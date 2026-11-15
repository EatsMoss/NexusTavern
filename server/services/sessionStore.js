import fs from 'node:fs';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import { NEXUSTAVERN_SESSION_FILE } from '../utils/paths.js';

/**
 * Persists the UI session state so the app restores the last opened chat, active tabs,
 * and unsaved prompt/preset drafts across page reloads and app restarts.
 * Stored in the private NexusTavern namespace, outside SillyTavern's native structures:
 *   `data/default-user/.nexustavern/session.json`
 */

const VALID_LEFT_TABS = new Set(['characters', 'chats', 'worldinfo', 'usersettings']);
const VALID_RIGHT_TABS = new Set(['selected', 'aiconfig', 'media', 'extensions']);
const VALID_SHEET_TABS = new Set(['description', 'intros', 'links']);
const VALID_AI_SUB_TABS = new Set(['prompts', 'samplers']);
const VALID_PRESET_DRAFT_CATEGORIES = new Set(['openai', 'textgen']);

let sessionWriteChain = Promise.resolve();

function withSessionLock(fn) {
  const next = sessionWriteChain.then(fn, fn);
  sessionWriteChain = next.catch(() => {});
  return next;
}

function createDefaultSession() {
  return {
    version: 3,
    lastChat: null,
    lastChats: {},
    uiState: null,
    presetDraft: null,
    onboardingDismissed: false,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Normalizes a raw `lastChat` value. Returns `null` when the pointer is unusable,
 * so a stale/deleted chat can never block the boot sequence.
 */
function normalizeLastChat(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const avatar = typeof raw.avatar === 'string' ? raw.avatar.trim() : '';
  const file = typeof raw.file === 'string' ? raw.file.trim() : '';
  if (!avatar) return null;
  return {
    avatar,
    file,
    updatedAtMs: Number.isFinite(Number(raw.updatedAtMs))
      ? Number(raw.updatedAtMs)
      : Date.now(),
  };
}

/**
 * Normalizes the per-character `{ [avatar]: { file, updatedAtMs } }` map so each
 * character remembers its own last opened `.jsonl` chat across switches and restarts.
 */
function normalizeLastChatsMap(rawMap, fallbackLastChat = null) {
  const out = {};
  if (rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)) {
    for (const [rawAvatar, entry] of Object.entries(rawMap)) {
      const avatar = typeof rawAvatar === 'string' ? rawAvatar.trim() : '';
      if (!avatar || !entry || typeof entry !== 'object') continue;
      const file = typeof entry.file === 'string' ? entry.file.trim() : '';
      if (!file) continue;
      out[avatar] = {
        file,
        updatedAtMs: Number.isFinite(Number(entry.updatedAtMs))
          ? Number(entry.updatedAtMs)
          : Date.now(),
      };
    }
  }

  if (fallbackLastChat?.avatar && fallbackLastChat?.file) {
    const existing = out[fallbackLastChat.avatar];
    const nextTs = Number(fallbackLastChat.updatedAtMs) || 0;
    if (!existing || nextTs >= (Number(existing.updatedAtMs) || 0)) {
      out[fallbackLastChat.avatar] = {
        file: fallbackLastChat.file,
        updatedAtMs: nextTs || Date.now(),
      };
    }
  }

  return out;
}

function normalizeSplitRatioValue(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0 || num > 1) return null;
  return Number(num.toFixed(6));
}

function normalizeUiState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const leftTab = VALID_LEFT_TABS.has(raw.leftTab) ? raw.leftTab : 'chats';
  const rightTab = VALID_RIGHT_TABS.has(raw.rightTab) ? raw.rightTab : 'selected';
  const activeSheetTab = VALID_SHEET_TABS.has(raw.activeSheetTab)
    ? raw.activeSheetTab
    : 'description';
  const aiSubTab = VALID_AI_SUB_TABS.has(raw.aiSubTab) ? raw.aiSubTab : 'prompts';

  return {
    leftOpen: typeof raw.leftOpen === 'boolean' ? raw.leftOpen : true,
    rightOpen: typeof raw.rightOpen === 'boolean' ? raw.rightOpen : true,
    leftTab,
    rightTab,
    activeSheetTab,
    aiSubTab,
    timelinesOpen: Boolean(raw.timelinesOpen),
    sheetExpanded: Boolean(raw.sheetExpanded),
    charSplitRatio: normalizeSplitRatioValue(raw.charSplitRatio),
    updatedAtMs: Number.isFinite(Number(raw.updatedAtMs))
      ? Number(raw.updatedAtMs)
      : Date.now(),
  };
}

function normalizePresetDraft(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const category = VALID_PRESET_DRAFT_CATEGORIES.has(raw.category) ? raw.category : '';
  const presetName = typeof raw.presetName === 'string' ? raw.presetName.trim() : '';
  if (!category || !presetName) return null;
  const data = raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) ? raw.data : {};
  const orderedPrompts = Array.isArray(raw.orderedPrompts) ? raw.orderedPrompts : undefined;
  const unlinkedPrompts = Array.isArray(raw.unlinkedPrompts) ? raw.unlinkedPrompts : undefined;

  return {
    category,
    presetName,
    data,
    ...(orderedPrompts !== undefined ? { orderedPrompts } : {}),
    ...(unlinkedPrompts !== undefined ? { unlinkedPrompts } : {}),
    updatedAtMs: Number.isFinite(Number(raw.updatedAtMs))
      ? Number(raw.updatedAtMs)
      : Date.now(),
  };
}

function normalizeSession(raw) {
  const base = createDefaultSession();
  if (!raw || typeof raw !== 'object') return base;
  const normalizedLastChat = normalizeLastChat(raw.lastChat);
  return {
    version: 3,
    lastChat: normalizedLastChat,
    lastChats: normalizeLastChatsMap(raw.lastChats, normalizedLastChat),
    uiState: normalizeUiState(raw.uiState),
    presetDraft: normalizePresetDraft(raw.presetDraft),
    onboardingDismissed: Boolean(raw.onboardingDismissed),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
  };
}

export function readSession() {
  if (!fs.existsSync(NEXUSTAVERN_SESSION_FILE)) return createDefaultSession();
  try {
    const raw = JSON.parse(fs.readFileSync(NEXUSTAVERN_SESSION_FILE, 'utf8'));
    return normalizeSession(raw);
  } catch {
    return createDefaultSession();
  }
}

export async function saveSession(patch = {}) {
  return withSessionLock(async () => {
    const current = readSession();
    const nextRaw = {
      ...current,
      lastChats: { ...(current.lastChats || {}) },
    };

    if ('lastChat' in patch) {
      nextRaw.lastChat = patch.lastChat;
      const candidate = normalizeLastChat(patch.lastChat);
      if (candidate?.avatar && candidate?.file) {
        nextRaw.lastChats[candidate.avatar] = {
          file: candidate.file,
          updatedAtMs: candidate.updatedAtMs,
        };
      }
    }
    if ('lastChats' in patch && patch.lastChats && typeof patch.lastChats === 'object') {
      for (const [rawAvatar, entry] of Object.entries(patch.lastChats)) {
        const avatar = typeof rawAvatar === 'string' ? rawAvatar.trim() : '';
        if (!avatar) continue;
        if (!entry || typeof entry !== 'object' || !String(entry.file || '').trim()) {
          delete nextRaw.lastChats[avatar];
          if (nextRaw.lastChat?.avatar === avatar && !('lastChat' in patch)) {
            nextRaw.lastChat = {
              ...nextRaw.lastChat,
              file: '',
              updatedAtMs: Date.now(),
            };
          }
        } else {
          nextRaw.lastChats[avatar] = {
            file: String(entry.file).trim(),
            updatedAtMs: Number.isFinite(Number(entry.updatedAtMs))
              ? Number(entry.updatedAtMs)
              : Date.now(),
          };
        }
      }
    }
    if ('uiState' in patch) {
      nextRaw.uiState = patch.uiState;
    }
    if ('presetDraft' in patch) {
      nextRaw.presetDraft = patch.presetDraft;
    }
    if ('onboardingDismissed' in patch) {
      nextRaw.onboardingDismissed = Boolean(patch.onboardingDismissed);
    }
    nextRaw.updatedAt = new Date().toISOString();

    const merged = normalizeSession(nextRaw);
    await writeFileAtomic(
      NEXUSTAVERN_SESSION_FILE,
      JSON.stringify(merged, null, 2),
      'utf8',
    );
    return merged;
  });
}

/**
 * Records the currently opened chat. Passing `null` clears the pointer.
 */
export async function saveLastChat(lastChat) {
  return saveSession({ lastChat: normalizeLastChat(lastChat) });
}
