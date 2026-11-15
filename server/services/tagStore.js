import { randomUUID } from 'node:crypto';
import {
  readUserSettings,
  writeUserSettings,
  withUserSettingsLock,
} from './cardStore.js';

/**
 * SillyTavern stores tags as a flat list in `settings.json -> tags` and the
 * per-card assignments in `settings.json -> tag_map` (avatar filename -> [tagId]).
 * This service is the single place that mutates those two structures, so the
 * 100% on-disk compatibility with SillyTavern is preserved by construction.
 */

const DEFAULT_FOLDER_TYPE = 'NONE';
const TAG_FOLDER_TYPES = ['NONE', 'TAG', 'CHARACTER', 'GROUP_CHAT'];

/**
 * Normalizes a raw tag entry so the client always receives every field.
 */
function normalizeTag(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  return {
    id: String(raw.id),
    name: String(raw.name || ''),
    folderType: TAG_FOLDER_TYPES.includes(raw.folder_type) ? raw.folder_type : DEFAULT_FOLDER_TYPE,
    filterState: String(raw.filter_state || 'UNDEFINED'),
    sortOrder: Number(raw.sort_order ?? 0),
    color: String(raw.color || ''),
    color2: String(raw.color2 || ''),
    createDate: Number(raw.create_date ?? 0),
  };
}

/**
 * Returns every tag plus the raw avatar -> tag-id assignments, so the gallery can
 * build OR / AND / NOT filters by id instead of by display name.
 */
export function listTags() {
  const settings = readUserSettings();
  const tags = (Array.isArray(settings.tags) ? settings.tags : [])
    .map(normalizeTag)
    .filter(Boolean);

  const rawMap = settings.tag_map && typeof settings.tag_map === 'object' ? settings.tag_map : {};
  const tagMap = {};
  for (const [avatar, ids] of Object.entries(rawMap)) {
    tagMap[avatar] = Array.isArray(ids) ? ids.map(String) : [];
  }

  return { tags, tagMap };
}

/**
 * Creates a new tag and returns the refreshed tag list.
 */
export async function createTag({ name, folderType = DEFAULT_FOLDER_TYPE, color = '' } = {}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    throw new Error('Tag name cannot be empty');
  }

  return withUserSettingsLock(async () => {
    const settings = readUserSettings();
    if (!Array.isArray(settings.tags)) settings.tags = [];
    if (!settings.tag_map || typeof settings.tag_map !== 'object') settings.tag_map = {};

    const duplicate = settings.tags.some(
      (tag) => String(tag?.name || '').trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) {
      throw new Error(`Tag "${trimmed}" already exists`);
    }

    settings.tags.push({
      id: randomUUID(),
      name: trimmed,
      folder_type: TAG_FOLDER_TYPES.includes(folderType) ? folderType : DEFAULT_FOLDER_TYPE,
      filter_state: 'UNDEFINED',
      sort_order: settings.tags.length,
      color: String(color || ''),
      color2: '',
      create_date: Date.now(),
    });

    await writeUserSettings(settings);
    return listTags();
  });
}

/**
 * Renames a tag (its folder name in the TAGS view IS the tag name).
 */
export async function renameTag(tagId, newName) {
  const trimmed = String(newName || '').trim();
  if (!trimmed) {
    throw new Error('Tag name cannot be empty');
  }

  return withUserSettingsLock(async () => {
    const settings = readUserSettings();
    const tag = (Array.isArray(settings.tags) ? settings.tags : []).find(
      (t) => String(t?.id) === String(tagId),
    );
    if (!tag) {
      throw new Error('Tag not found');
    }
    if (tag.name === trimmed) {
      return listTags();
    }

    tag.name = trimmed;
    await writeUserSettings(settings);
    return listTags();
  });
}

/**
 * Deletes a tag and detaches it from every card in `tag_map`.
 */
export async function deleteTag(tagId) {
  return withUserSettingsLock(async () => {
    const settings = readUserSettings();
    const tags = Array.isArray(settings.tags) ? settings.tags : [];
    const remaining = tags.filter((t) => String(t?.id) !== String(tagId));
    if (remaining.length === tags.length) {
      throw new Error('Tag not found');
    }

    settings.tags = remaining;
    const rawMap = settings.tag_map && typeof settings.tag_map === 'object' ? settings.tag_map : {};
    for (const avatar of Object.keys(rawMap)) {
      if (Array.isArray(rawMap[avatar])) {
        rawMap[avatar] = rawMap[avatar].filter((id) => String(id) !== String(tagId));
      }
    }

    await writeUserSettings(settings);
    return listTags();
  });
}

/**
 * Replaces the tag-id list assigned to a single card.
 */
export async function setCardTags(avatarFilename, tagIds = []) {
  return withUserSettingsLock(async () => {
    const settings = readUserSettings();
    if (!settings.tag_map || typeof settings.tag_map !== 'object') settings.tag_map = {};

    const known = new Set(
      (Array.isArray(settings.tags) ? settings.tags : []).map((t) => String(t?.id)),
    );
    settings.tag_map[avatarFilename] = Array.from(
      new Set(tagIds.map(String).filter((id) => known.has(id))),
    );

    await writeUserSettings(settings);
    return listTags();
  });
}

/**
 * Applies one tag operation to many cards at once (used by the multi-edit dock).
 * mode: 'add' | 'remove' | 'replace'
 */
export async function bulkSetCardTags(avatars = [], tagId, mode = 'add') {
  return withUserSettingsLock(async () => {
    const settings = readUserSettings();
    if (!settings.tag_map || typeof settings.tag_map !== 'object') settings.tag_map = {};

    const tid = String(tagId);
    const known = new Set(
      (Array.isArray(settings.tags) ? settings.tags : []).map((t) => String(t?.id)),
    );
    if (!known.has(tid)) {
      throw new Error('Tag not found');
    }

    for (const avatar of avatars) {
      const current = Array.isArray(settings.tag_map[avatar])
        ? settings.tag_map[avatar].map(String)
        : [];
      if (mode === 'remove') {
        settings.tag_map[avatar] = current.filter((id) => id !== tid);
      } else if (mode === 'replace') {
        settings.tag_map[avatar] = [tid];
      } else if (!current.includes(tid)) {
        settings.tag_map[avatar] = [...current, tid];
      }
    }

    await writeUserSettings(settings);
    return listTags();
  });
}
