import { apiFetchJson } from '@core/api/apiClient.js';

const LAST_CHAT_STORAGE_KEY = 'nexustavern_last_chat_v1';
const LAST_CHATS_MAP_STORAGE_KEY = 'nexustavern_last_chats_map_v1';
const UI_STATE_STORAGE_KEY = 'nexustavern_ui_session_v1';
const PRESET_DRAFT_STORAGE_KEY = 'nexustavern_preset_draft_v1';

const VALID_LEFT_TABS = new Set(['characters', 'chats', 'worldinfo', 'usersettings']);
const VALID_RIGHT_TABS = new Set(['selected', 'aiconfig', 'media', 'extensions']);
const VALID_SHEET_TABS = new Set(['description', 'intros', 'links']);
const VALID_AI_SUB_TABS = new Set(['prompts', 'samplers']);

function sanitizeSplitRatioValue(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0 || num > 1) return null;
  return Number(num.toFixed(6));
}

export function sanitizeUiState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    leftOpen: typeof raw.leftOpen === 'boolean' ? raw.leftOpen : true,
    rightOpen: typeof raw.rightOpen === 'boolean' ? raw.rightOpen : true,
    leftTab: VALID_LEFT_TABS.has(raw.leftTab) ? raw.leftTab : 'chats',
    rightTab: VALID_RIGHT_TABS.has(raw.rightTab) ? raw.rightTab : 'selected',
    activeSheetTab: VALID_SHEET_TABS.has(raw.activeSheetTab)
      ? raw.activeSheetTab
      : 'description',
    aiSubTab: VALID_AI_SUB_TABS.has(raw.aiSubTab) ? raw.aiSubTab : 'prompts',
    timelinesOpen: Boolean(raw.timelinesOpen),
    sheetExpanded: Boolean(raw.sheetExpanded),
    charSplitRatio: sanitizeSplitRatioValue(raw.charSplitRatio),
    updatedAtMs: Number.isFinite(Number(raw.updatedAtMs))
      ? Number(raw.updatedAtMs)
      : 0,
  };
}

export function readCachedUiState() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(UI_STATE_STORAGE_KEY);
    return raw ? sanitizeUiState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeCachedUiState(uiState) {
  if (typeof localStorage === 'undefined') return null;
  const normalized = sanitizeUiState({
    ...uiState,
    updatedAtMs: uiState?.updatedAtMs || Date.now(),
  });
  try {
    if (normalized) {
      localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(normalized));
    } else {
      localStorage.removeItem(UI_STATE_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
  return normalized;
}

export function readCachedPresetDraft() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PRESET_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.category || !parsed.presetName) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedPresetDraft(draft) {
  if (typeof localStorage === 'undefined') return null;
  try {
    if (!draft) {
      localStorage.removeItem(PRESET_DRAFT_STORAGE_KEY);
      return null;
    }
    const payload = {
      ...draft,
      updatedAtMs: draft.updatedAtMs || Date.now(),
    };
    localStorage.setItem(PRESET_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    return payload;
  } catch {
    return draft;
  }
}

export function readCachedLastChat() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_CHAT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const avatar = typeof parsed?.avatar === 'string' ? parsed.avatar.trim() : '';
    if (!avatar) return null;
    return {
      avatar,
      file: typeof parsed?.file === 'string' ? parsed.file.trim() : '',
      updatedAtMs: Number.isFinite(Number(parsed?.updatedAtMs))
        ? Number(parsed.updatedAtMs)
        : 0,
    };
  } catch {
    return null;
  }
}

export function writeCachedLastChat(lastChat) {
  if (typeof localStorage === 'undefined') return null;
  try {
    if (!lastChat || !lastChat.avatar) {
      localStorage.removeItem(LAST_CHAT_STORAGE_KEY);
      return null;
    }
    const payload = {
      avatar: String(lastChat.avatar).trim(),
      file: typeof lastChat.file === 'string' ? lastChat.file.trim() : '',
      updatedAtMs: Number.isFinite(Number(lastChat.updatedAtMs))
        ? Number(lastChat.updatedAtMs)
        : Date.now(),
    };
    localStorage.setItem(LAST_CHAT_STORAGE_KEY, JSON.stringify(payload));
    return payload;
  } catch {
    return lastChat;
  }
}

export function sanitizeLastChatsMap(rawMap, fallbackLastChat = null) {
  const out = {};
  if (rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)) {
    for (const [rawAvatar, entry] of Object.entries(rawMap)) {
      const avatar = typeof rawAvatar === 'string' ? rawAvatar.trim() : '';
      const file = typeof entry?.file === 'string' ? entry.file.trim() : '';
      if (!avatar || !file) continue;
      out[avatar] = {
        file,
        updatedAtMs: Number.isFinite(Number(entry.updatedAtMs))
          ? Number(entry.updatedAtMs)
          : 0,
      };
    }
  }
  if (fallbackLastChat?.avatar && fallbackLastChat?.file) {
    const cur = out[fallbackLastChat.avatar];
    const ts = Number(fallbackLastChat.updatedAtMs) || 0;
    if (!cur || ts >= (Number(cur.updatedAtMs) || 0)) {
      out[fallbackLastChat.avatar] = {
        file: fallbackLastChat.file,
        updatedAtMs: ts,
      };
    }
  }
  return out;
}

export function readCachedLastChatsMap() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LAST_CHATS_MAP_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return sanitizeLastChatsMap(parsed, readCachedLastChat());
  } catch {
    return sanitizeLastChatsMap(null, readCachedLastChat());
  }
}

export function writeCachedLastChatsMap(map) {
  const normalized = sanitizeLastChatsMap(map);
  if (typeof localStorage === 'undefined') return normalized;
  try {
    localStorage.setItem(LAST_CHATS_MAP_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage quota errors
  }
  return normalized;
}

export function upsertCachedCharacterLastChat(avatar, file, updatedAtMs = Date.now()) {
  const cleanAvatar = typeof avatar === 'string' ? avatar.trim() : '';
  const cleanFile = typeof file === 'string' ? file.trim() : '';
  const current = readCachedLastChatsMap();
  if (!cleanAvatar || !cleanFile) return current;
  return writeCachedLastChatsMap({
    ...current,
    [cleanAvatar]: {
      file: cleanFile,
      updatedAtMs: Number.isFinite(Number(updatedAtMs)) ? Number(updatedAtMs) : Date.now(),
    },
  });
}

export function clearCachedCharacterLastChat(avatar) {
  const cleanAvatar = typeof avatar === 'string' ? avatar.trim() : '';
  const current = readCachedLastChatsMap();
  if (!cleanAvatar || !(cleanAvatar in current)) return current;
  const next = { ...current };
  delete next[cleanAvatar];
  return writeCachedLastChatsMap(next);
}

export function mergeLastChatsMaps(localMap, serverMap) {
  const a = sanitizeLastChatsMap(localMap);
  const b = sanitizeLastChatsMap(serverMap);
  const merged = { ...b };
  let localHasNewer = false;

  for (const [avatar, localEntry] of Object.entries(a)) {
    const serverEntry = merged[avatar];
    const localTs = Number(localEntry?.updatedAtMs) || 0;
    const serverTs = Number(serverEntry?.updatedAtMs) || 0;
    if (!serverEntry || localTs > serverTs) {
      merged[avatar] = localEntry;
      localHasNewer = true;
    }
  }

  return { merged, localHasNewer };
}

export function pickNewestSessionSlice(localSlice, serverSlice) {
  if (localSlice && serverSlice) {
    return (Number(localSlice.updatedAtMs) || 0) >= (Number(serverSlice.updatedAtMs) || 0)
      ? localSlice
      : serverSlice;
  }
  return localSlice || serverSlice || null;
}

/**
 * Reads the persisted UI session state (`GET /api/system/session`).
 */
export async function fetchSession() {
  const res = await apiFetchJson('/api/system/session');
  const session = res?.session || {};
  const lastChat = session?.lastChat?.avatar
    ? {
        avatar: session.lastChat.avatar,
        file: typeof session.lastChat.file === 'string' ? session.lastChat.file : '',
        updatedAtMs: Number(session.lastChat.updatedAtMs) || 0,
      }
    : null;
  const lastChats = sanitizeLastChatsMap(session?.lastChats, lastChat);

  return {
    lastChat,
    lastChats,
    uiState: sanitizeUiState(session?.uiState),
    presetDraft: session?.presetDraft || null,
  };
}

/**
 * Partially updates persisted UI session fields (`PUT /api/system/session`).
 * Automatically enables `keepalive` during page unload when payload fits under browser limits (~60 KB).
 */
export async function patchSession(patch, options = {}) {
  const { preferKeepalive = false } = options;
  let keepalive = false;
  if (preferKeepalive) {
    try {
      const approxBytes = JSON.stringify(patch || {}).length;
      keepalive = approxBytes > 0 && approxBytes < 58_000;
    } catch {
      keepalive = false;
    }
  }

  const res = await apiFetchJson('/api/system/session', {
    method: 'PUT',
    body: patch || {},
    ...(keepalive ? { keepalive: true } : {}),
  });
  return res?.session || null;
}

/**
 * Records the currently opened chat (`PUT /api/system/session`).
 * Passing `null` clears the global pointer; `options.clearCharacterChat` clears that avatar's entry.
 */
export async function saveLastChat(lastChat, options = {}) {
  const { clearCharacterChat = false } = options;
  const patch = { lastChat: lastChat || null };
  if (lastChat?.avatar) {
    const cleanFile = typeof lastChat.file === 'string' ? lastChat.file.trim() : '';
    if (cleanFile) {
      patch.lastChats = {
        [lastChat.avatar]: {
          file: cleanFile,
          updatedAtMs: Number(lastChat.updatedAtMs) || Date.now(),
        },
      };
    } else if (clearCharacterChat) {
      patch.lastChats = {
        [lastChat.avatar]: null,
      };
    }
  }
  const session = await patchSession(patch);
  const stored = session?.lastChat;
  if (!stored?.avatar) {
    return {
      lastChat: null,
      lastChats: sanitizeLastChatsMap(session?.lastChats),
    };
  }
  return {
    lastChat: {
      avatar: stored.avatar,
      file: typeof stored.file === 'string' ? stored.file : '',
      updatedAtMs: Number(stored.updatedAtMs) || Date.now(),
    },
    lastChats: sanitizeLastChatsMap(session?.lastChats),
  };
}
