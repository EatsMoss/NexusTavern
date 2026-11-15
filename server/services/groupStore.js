import fs from 'node:fs';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import { DEFAULT_USER_DIR } from '../utils/paths.js';

export const GROUPS_DIR = path.join(DEFAULT_USER_DIR, 'groups');
export const GROUP_CHATS_DIR = path.join(DEFAULT_USER_DIR, 'group chats');

/**
 * SillyTavern keeps group definitions as one JSON file per group inside
 * `data/default-user/groups/` (`<name>.json`). The GROUP CHATS tab of the
 * character gallery lists these files, so this store only reads them.
 */

function readGroupFile(fileName) {
  const fullPath = path.join(GROUPS_DIR, fileName);
  try {
    const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    const members = Array.isArray(raw.members) ? raw.members.map(String) : [];
    const disabledMembers = Array.isArray(raw.disabled_members)
      ? raw.disabled_members.map(String)
      : [];

    const leadMember = members[0] ? path.basename(members[0]) : '';
    const leadHasPng =
      Boolean(leadMember) &&
      leadMember.toLowerCase().endsWith('.png') &&
      fs.existsSync(path.join(DEFAULT_USER_DIR, 'characters', leadMember));

    return {
      id: path.basename(fileName, '.json'),
      fileName,
      name: String(raw.name || path.basename(fileName, '.json')),
      members,
      disabledMembers,
      memberCount: members.filter((m) => !disabledMembers.includes(m)).length,
      fav: Boolean(raw.fav),
      chatId: String(raw.chat_id || ''),
      activationStrategy: Number(raw.activation_strategy ?? 0),
      allowSelfResponses: Boolean(raw.allow_self_responses),
      generationMode: Number(raw.generation_mode ?? 0),
      thumbnailUrl: leadHasPng
        ? `/api/thumbnails/avatar/${encodeURIComponent(leadMember)}`
        : null,
      avatarUrl: leadHasPng
        ? `/user-data/characters/${encodeURIComponent(leadMember)}`
        : null,
    };
  } catch {
    return null;
  }
}

/**
 * Lists every group definition with its member roster.
 */
export function listGroups() {
  if (!fs.existsSync(GROUPS_DIR)) {
    return [];
  }

  const groups = fs
    .readdirSync(GROUPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => readGroupFile(entry.name))
    .filter(Boolean);

  groups.sort((a, b) => {
    if (a.fav !== b.fav) return a.fav ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return groups;
}

/**
 * Returns one group by its id (the file name without the `.json` extension).
 */
export function getGroupById(groupId) {
  const safeName = path.basename(String(groupId || ''));
  if (!safeName) return null;
  const fileName = `${safeName}.json`;
  if (!fs.existsSync(path.join(GROUPS_DIR, fileName))) return null;
  return readGroupFile(fileName);
}

/**
 * Creates a new SillyTavern-compatible group definition inside `data/default-user/groups/`.
 */
export async function createGroup({ name, members = [], fav = false } = {}) {
  const cleanMembers = Array.from(
    new Set(
      (Array.isArray(members) ? members : [])
        .map((m) => path.basename(String(m || '').trim()))
        .filter(Boolean),
    ),
  );
  if (cleanMembers.length === 0) {
    throw new Error('At least one character member is required to create a group');
  }

  fs.mkdirSync(GROUPS_DIR, { recursive: true });
  const now = Date.now();
  const groupId = String(now);
  const chatId = `${now}`;
  const groupName = String(name || '').trim() || `Group (${cleanMembers.length})`;

  const rawPayload = {
    id: groupId,
    name: groupName,
    members: cleanMembers,
    disabled_members: [],
    avatar_url: '',
    allow_self_responses: false,
    activation_strategy: 0,
    generation_mode: 0,
    fav: Boolean(fav),
    chat_id: chatId,
    chats: [chatId],
    date_added: now,
    past_metadata: {},
  };

  const fileName = `${groupId}.json`;
  await writeFileAtomic(
    path.join(GROUPS_DIR, fileName),
    JSON.stringify(rawPayload, null, 2),
    'utf8',
  );

  return readGroupFile(fileName);
}

/**
 * Updates an existing group's roster, disabled members, name, or reply/generation settings.
 */
export async function updateGroup(groupId, patch = {}) {
  const safeId = path.basename(String(groupId || '')).replace(/\.json$/i, '');
  if (!safeId) {
    throw new Error('Group ID is required');
  }
  const fileName = `${safeId}.json`;
  const fullPath = path.join(GROUPS_DIR, fileName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Group not found: ${safeId}`);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch {
    throw new Error(`Failed to parse group file: ${fileName}`);
  }

  if (typeof patch.name === 'string' && patch.name.trim()) {
    raw.name = patch.name.trim();
  }
  if (Array.isArray(patch.members)) {
    raw.members = Array.from(
      new Set(
        patch.members
          .map((m) => path.basename(String(m || '').trim()))
          .filter(Boolean),
      ),
    );
  }
  if (Array.isArray(patch.disabledMembers)) {
    raw.disabled_members = Array.from(
      new Set(
        patch.disabledMembers
          .map((m) => path.basename(String(m || '').trim()))
          .filter(Boolean),
      ),
    );
  }
  if (patch.fav !== undefined) {
    raw.fav = Boolean(patch.fav);
  }
  if (patch.activationStrategy !== undefined) {
    raw.activation_strategy = Number(patch.activationStrategy);
  }
  if (patch.generationMode !== undefined) {
    raw.generation_mode = Number(patch.generationMode);
  }
  if (patch.allowSelfResponses !== undefined) {
    raw.allow_self_responses = Boolean(patch.allowSelfResponses);
  }
  if (patch.joinPrefix !== undefined) {
    raw.generation_mode_join_prefix = String(patch.joinPrefix);
  }
  if (patch.joinSuffix !== undefined) {
    raw.generation_mode_join_suffix = String(patch.joinSuffix);
  }
  if (patch.autoModeDelay !== undefined) {
    raw.auto_mode_delay = Math.max(1, Number(patch.autoModeDelay) || 5);
  }

  await writeFileAtomic(fullPath, JSON.stringify(raw, null, 2), 'utf8');
  return readGroupFile(fileName);
}

/**
 * Deletes group JSON files and optionally their `.jsonl` group chat histories.
 */
export function deleteGroups(groupIds = [], { deleteChats = true } = {}) {
  const deleted = [];
  for (const rawId of groupIds || []) {
    const safeId = path.basename(String(rawId || '')).replace(/\.json$/i, '');
    if (!safeId) continue;
    const filePath = path.join(GROUPS_DIR, `${safeId}.json`);
    if (!fs.existsSync(filePath)) continue;

    let groupData = null;
    try {
      groupData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      // ignore
    }

    fs.rmSync(filePath, { force: true });
    deleted.push(safeId);

    if (deleteChats && groupData && fs.existsSync(GROUP_CHATS_DIR)) {
      const chatIds = new Set(
        [
          ...(Array.isArray(groupData.chats) ? groupData.chats : []),
          groupData.chat_id,
        ]
          .map((x) => String(x || '').trim())
          .filter(Boolean),
      );
      for (const cid of chatIds) {
        const chatPath = path.join(GROUP_CHATS_DIR, `${path.basename(cid)}.jsonl`);
        if (fs.existsSync(chatPath)) {
          fs.rmSync(chatPath, { force: true });
        }
      }
    }
  }

  return { deleted, count: deleted.length };
}

