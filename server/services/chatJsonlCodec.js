import fs from 'node:fs';
import path from 'node:path';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import { DEFAULT_USER_DIR } from '../utils/paths.js';
import {
  CHATS_DIR,
  USER_AVATARS_DIR,
  getFullCharacterCard,
  readUserSettings,
} from './cardStore.js';
import { resolveActiveRegexScriptsServer } from './regexStore.js';
import { readMessageRecapConfig } from './recapStore.js';
import { readSession } from './sessionStore.js';
import { estimateHistorySliceTokenBreakdown } from '../../src/core/presets/tokenEstimator.js';

export const GROUP_CHATS_DIR = path.join(DEFAULT_USER_DIR, 'group chats');

/**
 * High-speed in-memory cache of parsed `.jsonl` chats keyed by absolute file path.
 * Value: { mtimeMs, size, header, messages }
 */
const parsedChatCache = new Map();

/**
 * Lightweight summary cache for `listCharacterChats` keyed by absolute file path.
 * Value: { schemaVer, mtimeMs, size, summary }
 */
const CHAT_SUMMARY_CACHE_SCHEMA_VER = 4;
const chatSummaryCache = new Map();

export function invalidateChatCodecCaches() {
  parsedChatCache.clear();
  chatSummaryCache.clear();
}

export function invalidateChatFileCache(filePath) {
  if (!filePath) return;
  parsedChatCache.delete(filePath);
  chatSummaryCache.delete(filePath);
}

export function invalidateChatSummaryFileCache(filePath) {
  if (!filePath) return;
  chatSummaryCache.delete(filePath);
}

export function formatSillyTavernSendDate(date = new Date()) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `${month} ${day}, ${year} ${hours}:${minutes}${ampm}`;
}

export function formatSillyTavernChatFilename(prefixName = '', date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  const stamp = `${yyyy}-${mm}-${dd}@${hh}h${min}m${ss}s${ms}ms`;
  const cleanPrefix = String(prefixName || '').replace(/[<>:"/\\|?*]/g, '_').trim();
  return cleanPrefix ? `${cleanPrefix} - ${stamp}.jsonl` : `${stamp}.jsonl`;
}

export function estimateTokenCount(text) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(String(text).length / 3.8));
}

export function resolveCharacterChatDir(avatarOrFolder) {
  const raw = String(avatarOrFolder || '').trim();
  if (!raw) {
    throw new Error('Character avatar or chat folder is required');
  }

  const card = getFullCharacterCard(raw);
  if (card?.chatStats?.chatFolder) {
    const resolvedDir = path.join(CHATS_DIR, card.chatStats.chatFolder);
    if (!fs.existsSync(resolvedDir)) {
      fs.mkdirSync(resolvedDir, { recursive: true });
    }
    return {
      chatFolder: card.chatStats.chatFolder,
      dirPath: resolvedDir,
      card,
    };
  }

  const sanitizedFolder = path.basename(raw).replace(/\.(png|json)$/i, '').trim();
  const candidateDir = path.join(CHATS_DIR, sanitizedFolder);
  if (!fs.existsSync(candidateDir)) {
    fs.mkdirSync(candidateDir, { recursive: true });
  }
  return {
    chatFolder: sanitizedFolder,
    dirPath: candidateDir,
    card: card || null,
  };
}

export function resolveChatFilePath(avatarOrFolder, fileName, isGroup = false) {
  const safeFile = path.basename(String(fileName || '').trim());
  if (!safeFile || !safeFile.toLowerCase().endsWith('.jsonl')) {
    throw new Error('Invalid .jsonl chat filename');
  }

  if (isGroup) {
    if (!fs.existsSync(GROUP_CHATS_DIR)) {
      fs.mkdirSync(GROUP_CHATS_DIR, { recursive: true });
    }
    return {
      chatFolder: 'group chats',
      fileName: safeFile,
      filePath: path.join(GROUP_CHATS_DIR, safeFile),
      card: null,
    };
  }

  const { chatFolder, dirPath, card } = resolveCharacterChatDir(avatarOrFolder);
  return {
    chatFolder,
    fileName: safeFile,
    filePath: path.join(dirPath, safeFile),
    card,
  };
}

export function readParsedJsonlChat(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const stat = fs.statSync(filePath);
  const cached = parsedChatCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached;
  }

  const rawText = fs.readFileSync(filePath, 'utf8');
  const lines = rawText.split(/\r?\n/);

  let header = {
    chat_metadata: {},
    user_name: 'User',
    character_name: 'Character',
  };
  const messages = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);
      if (
        messages.length === 0 &&
        i === 0 &&
        (parsed.chat_metadata !== undefined ||
          (parsed.user_name !== undefined && parsed.mes === undefined))
      ) {
        header = parsed;
      } else {
        messages.push(parsed);
      }
    } catch {
      // Skip malformed line without crashing entire chat
    }
  }

  const entry = {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    header,
    messages,
  };
  parsedChatCache.set(filePath, entry);
  return entry;
}

export async function writeParsedJsonlChat(filePath, header, messages) {
  const serializedLines = [
    JSON.stringify(header || { chat_metadata: {}, user_name: 'User', character_name: 'Character' }),
    ...messages.map((m) => JSON.stringify(m)),
  ];
  const payload = `${serializedLines.join('\n')}\n`;
  await writeFileAtomic(filePath, payload, 'utf8');

  const stat = fs.statSync(filePath);
  const entry = {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    header,
    messages,
  };
  parsedChatCache.set(filePath, entry);
  return entry;
}

const IMAGE_EXT_SET = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg']);
const CODE_EXT_SET = new Set([
  'json', 'jsonl', 'yaml', 'yml', 'xml', 'toml', 'sql', 'sh', 'bash', 'bat', 'ps1',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'php', 'java', 'c', 'cpp',
  'h', 'hpp', 'cs', 'go', 'rs', 'lua', 'swift', 'kt', 'css', 'scss', 'html', 'htm',
]);
const TEXT_EXT_SET = new Set([
  ...CODE_EXT_SET,
  'txt', 'md', 'markdown', 'csv', 'tsv', 'log', 'ini', 'cfg', 'conf', 'env',
]);

export function getAttachmentExt(fileName = '') {
  const clean = String(fileName || '').split('?')[0].split('#')[0].trim();
  const dot = clean.lastIndexOf('.');
  if (dot <= 0 || dot === clean.length - 1) return '';
  return clean.slice(dot + 1).toLowerCase();
}

export function classifyServerAttachment({ name = '', mimeType = '', explicitType = '' } = {}) {
  const t = String(explicitType || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();
  const ext = getAttachmentExt(name);
  if (t === 'image' || mime.startsWith('image/') || IMAGE_EXT_SET.has(ext)) return 'image';
  if (t === 'audio' || mime.startsWith('audio/')) return 'audio';
  if (t === 'video' || mime.startsWith('video/')) return 'video';
  if (CODE_EXT_SET.has(ext) && ext !== 'svg') return 'code';
  if (
    ext !== 'svg' &&
    (TEXT_EXT_SET.has(ext) ||
      mime.startsWith('text/') ||
      mime === 'application/json' ||
      mime === 'application/xml')
  ) {
    return 'text';
  }
  return 'file';
}

export function resolveStAssetDiskPath(rawUrl = '') {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let rel = rawUrl.trim();
  if (!rel || rel.startsWith('data:') || /^https?:\/\//i.test(rel)) return null;
  try {
    rel = decodeURIComponent(rel);
  } catch {
    // keep raw string if already decoded
  }
  rel = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (rel.startsWith('user-data/')) {
    rel = rel.slice('user-data/'.length);
  }
  if (!rel.startsWith('user/')) return null;

  const userRoot = path.resolve(DEFAULT_USER_DIR, 'user');
  const candidate = path.resolve(DEFAULT_USER_DIR, rel);
  if (!candidate.startsWith(`${userRoot}${path.sep}`)) return null;
  return candidate;
}

export function normalizeStAssetClientUrl(rawUrl = '') {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:') || /^https?:\/\//i.test(trimmed)) return trimmed;

  let clean = trimmed.replace(/\\/g, '/');
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // keep raw if % literal
  }
  clean = clean.replace(/^\/+/, '');
  if (clean.startsWith('user-data/')) {
    clean = clean.slice('user-data/'.length);
  }
  const encodedSegments = clean
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg));
  return `/user-data/${encodedSegments.join('/')}`;
}

export function extractMessageAttachments(rawMsg, activeSwipeInfo = null) {
  if (!rawMsg || typeof rawMsg !== 'object') return [];
  const ex = rawMsg.extra && typeof rawMsg.extra === 'object' ? rawMsg.extra : {};
  const swEx =
    activeSwipeInfo?.extra && typeof activeSwipeInfo.extra === 'object'
      ? activeSwipeInfo.extra
      : {};

  const out = [];
  const seenUrls = new Set();

  const pushEntry = (rawUrl, meta = {}) => {
    const urlStr = String(rawUrl || '').trim();
    if (!urlStr || seenUrls.has(urlStr)) return;
    seenUrls.add(urlStr);

    const clientUrl = normalizeStAssetClientUrl(urlStr);
    let fallbackName = 'Attachment';
    if (!urlStr.startsWith('data:')) {
      try {
        fallbackName = path.basename(decodeURIComponent(urlStr.replace(/\\/g, '/')));
      } catch {
        fallbackName = path.basename(urlStr.replace(/\\/g, '/'));
      }
    }
    const name = String(meta.name || fallbackName || 'Attachment').trim();
    const ext = getAttachmentExt(name);
    const kind = classifyServerAttachment({
      name,
      mimeType: meta.mimeType || '',
      explicitType: meta.type || '',
    });

    let size = Number(meta.size || 0);
    if (!size) {
      const diskPath = resolveStAssetDiskPath(urlStr);
      if (diskPath && fs.existsSync(diskPath)) {
        try {
          size = fs.statSync(diskPath).size;
        } catch {
          size = 0;
        }
      }
    }

    out.push({
      id: `att-${out.length}-${name}`,
      url: clientUrl,
      stUrl: urlStr,
      name,
      title: String(meta.title || ''),
      size,
      ext,
      kind,
      mimeType: String(meta.mimeType || ''),
    });
  };

  const mediaArr = Array.isArray(swEx.media)
    ? swEx.media
    : Array.isArray(ex.media)
      ? ex.media
      : null;

  if (mediaArr && mediaArr.length > 0) {
    for (const item of mediaArr) {
      if (item && item.url) {
        pushEntry(item.url, item);
      }
    }
  }

  const singleImg = swEx.image || ex.image;
  if (typeof singleImg === 'string' && singleImg.trim()) {
    pushEntry(singleImg, {
      type: 'image',
      title: swEx.title || ex.title || '',
    });
  }

  const filesArr = Array.isArray(swEx.files)
    ? swEx.files
    : Array.isArray(ex.files)
      ? ex.files
      : null;
  if (filesArr) {
    for (const f of filesArr) {
      if (f && f.url) pushEntry(f.url, f);
    }
  }

  const singleFile = swEx.file || ex.file;
  if (singleFile && typeof singleFile === 'object' && singleFile.url) {
    pushEntry(singleFile.url, singleFile);
  }

  return out;
}

export function extractPersonaFileFromForceAvatar(rawForceAvatar) {
  if (!rawForceAvatar || typeof rawForceAvatar !== 'string') return '';
  const trimmed = rawForceAvatar.trim();
  if (!trimmed) return '';
  if (trimmed.includes('file=')) {
    try {
      const qIndex = trimmed.indexOf('?');
      const params = new URLSearchParams(qIndex >= 0 ? trimmed.slice(qIndex + 1) : trimmed);
      const fileParam = params.get('file');
      if (fileParam) return path.basename(fileParam);
    } catch {
      // fall through
    }
  }
  try {
    return path.basename(decodeURIComponent(trimmed));
  } catch {
    return path.basename(trimmed);
  }
}

export function resolvePersonaByDisplayName(userName, personasMap = {}) {
  if (!userName || userName === 'unused') return '';
  const target = String(userName).trim().toLowerCase();
  if (!target) return '';
  for (const [avatarFile, displayName] of Object.entries(personasMap)) {
    if (String(displayName || '').trim().toLowerCase() === target) {
      return avatarFile;
    }
    const stem = avatarFile.replace(/\.(png|jpg|jpeg|webp)$/i, '').toLowerCase();
    if (stem === target) {
      return avatarFile;
    }
  }
  return '';
}

export function toCompactClientMessage(rawMsg, messageIndex) {
  const swipes = Array.isArray(rawMsg.swipes) ? rawMsg.swipes : null;
  const swipeCount = swipes && swipes.length > 0 ? swipes.length : 1;
  const rawSwipeId = Number(rawMsg.swipe_id ?? 0);
  const activeSwipeId =
    swipes && swipes.length > 0
      ? Math.max(0, Math.min(rawSwipeId, swipes.length - 1))
      : 0;

  const activeText =
    swipes && swipes.length > 0 && swipes[activeSwipeId] !== undefined
      ? String(swipes[activeSwipeId])
      : String(rawMsg.mes ?? '');

  const swipeInfoList = Array.isArray(rawMsg.swipe_info) ? rawMsg.swipe_info : null;
  const activeSwipeInfo =
    swipeInfoList && swipeInfoList[activeSwipeId]
      ? swipeInfoList[activeSwipeId]
      : null;

  const reasoning =
    activeSwipeInfo?.extra?.reasoning ??
    rawMsg.extra?.reasoning ??
    '';

  const tokenCount =
    activeSwipeInfo?.extra?.token_count ||
    (activeSwipeId === 0 ? rawMsg.extra?.token_count : null) ||
    estimateTokenCount(activeText);

  const genStartedRaw = activeSwipeInfo?.gen_started || rawMsg.gen_started || null;
  const genFinishedRaw = activeSwipeInfo?.gen_finished || rawMsg.gen_finished || null;
  let durationMs = null;

  if (genStartedRaw && genFinishedRaw) {
    const startTs =
      typeof genStartedRaw === 'number' ? genStartedRaw : Date.parse(genStartedRaw);
    const endTs =
      typeof genFinishedRaw === 'number' ? genFinishedRaw : Date.parse(genFinishedRaw);
    if (Number.isFinite(startTs) && Number.isFinite(endTs) && endTs >= startTs) {
      durationMs = endTs - startTs;
    }
  }
  if (durationMs === null) {
    const rawTimeSpent =
      activeSwipeInfo?.extra?.time_spent ?? rawMsg.extra?.time_spent ?? null;
    if (typeof rawTimeSpent === 'number' && rawTimeSpent > 0) {
      durationMs = rawTimeSpent < 600 ? Math.round(rawTimeSpent * 1000) : rawTimeSpent;
    }
  }

  const reasoningDurationMs =
    activeSwipeInfo?.extra?.reasoning_duration ??
    rawMsg.extra?.reasoning_duration ??
    null;

  const apiName = activeSwipeInfo?.extra?.api || rawMsg.extra?.api || null;
  const modelName = activeSwipeInfo?.extra?.model || rawMsg.extra?.model || null;
  const fallbackInfo = activeSwipeInfo
    ? activeSwipeInfo.extra?.fallback_info || null
    : rawMsg.extra?.fallback_info || null;

  const rawForceAvatar = rawMsg.force_avatar || null;
  let userAvatarUrl = null;
  let userAvatarMissing = false;
  if (rawMsg.is_user && rawForceAvatar) {
    const forceFile = extractPersonaFileFromForceAvatar(rawForceAvatar);
    if (forceFile) {
      const existsOnDisk = fs.existsSync(path.join(USER_AVATARS_DIR, forceFile));
      if (existsOnDisk) {
        userAvatarUrl = `/api/thumbnails/persona/${encodeURIComponent(forceFile)}`;
      } else {
        userAvatarMissing = true;
      }
    }
  }

  const attachments = extractMessageAttachments(rawMsg, activeSwipeInfo);

  return {
    index: messageIndex,
    name: String(rawMsg.name || (rawMsg.is_user ? 'User' : 'Character')),
    is_user: Boolean(rawMsg.is_user),
    is_system: Boolean(rawMsg.is_system),
    send_date: String(activeSwipeInfo?.send_date || rawMsg.send_date || ''),
    mes: activeText,
    swipe_id: activeSwipeId,
    swipe_count: swipeCount,
    tokens: tokenCount,
    reasoning: String(reasoning || ''),
    reasoningDurationMs:
      typeof reasoningDurationMs === 'number' ? reasoningDurationMs : null,
    durationMs: typeof durationMs === 'number' ? durationMs : null,
    force_avatar: rawForceAvatar,
    userAvatarUrl,
    userAvatarMissing,
    attachments,
    fallbackInfo,
    extra:
      apiName || modelName || durationMs || fallbackInfo
        ? {
            api: apiName,
            model: modelName,
            time_spent: durationMs,
            ...(fallbackInfo ? { fallback_info: fallbackInfo } : {}),
          }
        : null,
  };
}

export function resolveChatPersonaState(parsed, settings = null) {
  const cfg = settings || readUserSettings();
  const personasMap = cfg?.power_user?.personas || {};
  const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
  const header = parsed?.header || {};

  let userMessageCount = 0;
  let lastUserForceAvatar = '';
  let lastUserName = '';

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg && msg.is_user) {
      userMessageCount += 1;
      if (!lastUserForceAvatar && msg.force_avatar) {
        lastUserForceAvatar = extractPersonaFileFromForceAvatar(msg.force_avatar);
      }
      if (!lastUserName && msg.name && msg.name !== 'unused') {
        lastUserName = String(msg.name).trim();
      }
    }
  }

  const hasUserMessages = userMessageCount > 0;
  const rawMetaPersona = header?.chat_metadata?.persona
    ? extractPersonaFileFromForceAvatar(header.chat_metadata.persona)
    : '';

  // Brand-new chat with zero user messages and no explicit persona lock has no bound persona yet
  if (!hasUserMessages && !rawMetaPersona) {
    return {
      hasUserMessages: false,
      userMessageCount: 0,
      chatPersonaAvatar: null,
      chatPersonaName: null,
    };
  }

  let resolvedAvatar = rawMetaPersona || lastUserForceAvatar || '';
  if (!resolvedAvatar) {
    resolvedAvatar =
      resolvePersonaByDisplayName(lastUserName, personasMap) ||
      resolvePersonaByDisplayName(header?.user_name, personasMap) ||
      '';
  }

  const resolvedName =
    (resolvedAvatar && personasMap[resolvedAvatar]) ||
    lastUserName ||
    (header?.user_name && header.user_name !== 'unused' ? String(header.user_name) : '') ||
    null;

  return {
    hasUserMessages,
    userMessageCount,
    chatPersonaAvatar: resolvedAvatar || null,
    chatPersonaName: resolvedName,
  };
}

export function parseEmbeddedChatStampMs(raw = '') {
  const m = String(raw || '').match(
    /(\d{4})-(\d{1,2})-(\d{1,2})\s*@\s*(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s(?:\s*(\d{1,3})ms)?/,
  );
  if (!m) return 0;
  const ts = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
    Number(m[7] || 0),
  ).getTime();
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
}

export function parseSendDateMs(rawSendDate = '') {
  const str = String(rawSendDate || '').trim();
  if (!str) return 0;
  if (/^\d{10,15}$/.test(str)) {
    const num = Number(str);
    return num < 1e11 ? num * 1000 : num;
  }
  const embedded = parseEmbeddedChatStampMs(str);
  if (embedded > 0) return embedded;

  const normalized = str.replace(/(\d)(am|pm)\b/i, '$1 $2');
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function resolveDefaultCharacterChatSummary(
  chats = [],
  { rememberedFile = '', cardChat = '' } = {},
) {
  if (!Array.isArray(chats) || chats.length === 0) return null;

  const normalizeName = (raw) => {
    const trimmed = path.basename(String(raw || '').trim());
    if (!trimmed) return '';
    return trimmed.toLowerCase().endsWith('.jsonl') ? trimmed : `${trimmed}.jsonl`;
  };

  const findByName = (raw) => {
    const clean = normalizeName(raw);
    if (!clean) return null;
    const lower = clean.toLowerCase();
    return (
      chats.find((c) => c.fileName === clean) ||
      chats.find((c) => String(c.fileName || '').toLowerCase() === lower) ||
      null
    );
  };

  const isSubstantive = (c) =>
    Boolean(c && (Number(c.messageCount ?? 0) > 1 || Boolean(c.hasUserMessages)));

  const rememberedMatch = findByName(rememberedFile);
  if (rememberedMatch) {
    return rememberedMatch;
  }

  const firstSubstantive = chats.find(isSubstantive) || null;
  if (firstSubstantive) {
    return firstSubstantive;
  }

  const cardChatMatch = findByName(cardChat);
  if (cardChatMatch) {
    return cardChatMatch;
  }

  return chats.find((c) => Number(c.messageCount ?? 0) > 0) || chats[0] || null;
}

export function listGroupChats() {
  if (!fs.existsSync(GROUP_CHATS_DIR)) return [];
  const entries = fs
    .readdirSync(GROUP_CHATS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.jsonl'));

  return entries
    .map((entry) => {
      const fullPath = path.join(GROUP_CHATS_DIR, entry.name);
      const st = fs.statSync(fullPath);
      return {
        fileName: entry.name,
        fileSize: st.size,
        lastModifiedMs: st.mtimeMs,
        lastModifiedIso: new Date(st.mtimeMs).toISOString(),
      };
    })
    .sort((a, b) => b.lastModifiedMs - a.lastModifiedMs);
}

export function listCharacterChats(avatarOrFolder, options = {}) {
  const { offset = 0, limit = null } = options;
  const { chatFolder, dirPath, card } = resolveCharacterChatDir(avatarOrFolder);
  if (!fs.existsSync(dirPath)) {
    return {
      chatFolder,
      defaultChatFile: null,
      totalChats: 0,
      offset: 0,
      limit: limit ? Number(limit) : null,
      hasMore: false,
      nextOffset: 0,
      chats: [],
    };
  }

  const settings = readUserSettings();
  const personasMap = settings?.power_user?.personas || {};
  const activeUserAvatar = settings?.user_avatar || 'user-default.png';

  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.jsonl'));

  const chats = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    try {
      const st = fs.statSync(fullPath);
      const summaryCached = chatSummaryCache.get(fullPath);
      if (
        summaryCached &&
        summaryCached.schemaVer === CHAT_SUMMARY_CACHE_SCHEMA_VER &&
        summaryCached.mtimeMs === st.mtimeMs &&
        summaryCached.size === st.size
      ) {
        chats.push(summaryCached.summary);
        continue;
      }

      const cached = parsedChatCache.get(fullPath);
      let messageCount = null;
      let hasUserMessages = false;
      let lastPreview = '';
      let lastSendDate = '';
      let personaAvatarFile = '';
      let personaName = '';
      let parentChat = null;
      let forkMesId = null;
      let lastMessage = null;

      const normalizeParentChatFile = (rawParent) => {
        if (!rawParent || typeof rawParent !== 'string') return null;
        const trimmed = path.basename(rawParent.trim());
        if (!trimmed) return null;
        return trimmed.toLowerCase().endsWith('.jsonl')
          ? trimmed
          : `${trimmed}.jsonl`;
      };

      if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
        messageCount = cached.messages.length;
        const rawMainChat =
          cached.header?.chat_metadata?.main_chat ||
          cached.header?.chat_metadata?.bbFork?.parent ||
          null;
        parentChat = normalizeParentChatFile(rawMainChat);
        if (Number.isFinite(cached.header?.chat_metadata?.bbFork?.mesId)) {
          forkMesId = Number(cached.header.chat_metadata.bbFork.mesId);
        }
        const lastMsg = cached.messages[cached.messages.length - 1];
        if (lastMsg) {
          lastMessage = toCompactClientMessage(lastMsg, cached.messages.length - 1);
          lastPreview = String(lastMessage.mes || lastMsg.mes || '').slice(0, 160);
          lastSendDate = String(lastMsg.send_date || '');
        }
        const metaPersona = cached.header?.chat_metadata?.persona;
        if (metaPersona) {
          personaAvatarFile = extractPersonaFileFromForceAvatar(metaPersona);
        }
        if (cached.header?.user_name && cached.header.user_name !== 'unused') {
          personaName = String(cached.header.user_name);
        }
        for (let i = cached.messages.length - 1; i >= 0; i--) {
          const msg = cached.messages[i];
          if (msg && msg.is_user) {
            hasUserMessages = true;
            if (!personaName && msg.name && msg.name !== 'unused') {
              personaName = String(msg.name);
            }
            if (!personaAvatarFile && msg.force_avatar) {
              personaAvatarFile = extractPersonaFileFromForceAvatar(msg.force_avatar);
            }
            if (personaName && personaAvatarFile) break;
          }
        }
      } else {
        const buf = fs.readFileSync(fullPath, 'utf8');
        const nonEmptyLines = buf.split(/\r?\n/).filter((l) => l.trim().length > 0);
        messageCount = Math.max(0, nonEmptyLines.length - 1);
        if (nonEmptyLines.length > 0) {
          try {
            const headerObj = JSON.parse(nonEmptyLines[0]);
            const rawMainChat =
              headerObj?.chat_metadata?.main_chat ||
              headerObj?.chat_metadata?.bbFork?.parent ||
              null;
            parentChat = normalizeParentChatFile(rawMainChat);
            if (Number.isFinite(headerObj?.chat_metadata?.bbFork?.mesId)) {
              forkMesId = Number(headerObj.chat_metadata.bbFork.mesId);
            }
            const metaPersona = headerObj?.chat_metadata?.persona;
            if (metaPersona) {
              personaAvatarFile = extractPersonaFileFromForceAvatar(metaPersona);
            }
            if (headerObj?.user_name && headerObj.user_name !== 'unused') {
              personaName = String(headerObj.user_name);
            }
          } catch {
            // ignore
          }
        }
        if (nonEmptyLines.length > 1) {
          try {
            const lastObj = JSON.parse(nonEmptyLines[nonEmptyLines.length - 1]);
            lastMessage = toCompactClientMessage(lastObj, Math.max(0, messageCount - 1));
            lastPreview = String(lastMessage.mes || lastObj.mes || '').slice(0, 160);
            lastSendDate = String(lastObj.send_date || '');
          } catch {
            // ignore
          }
          for (let i = nonEmptyLines.length - 1; i >= 1; i--) {
            try {
              const msgObj = JSON.parse(nonEmptyLines[i]);
              if (msgObj && msgObj.is_user) {
                hasUserMessages = true;
                if (!personaName && msgObj.name && msgObj.name !== 'unused') {
                  personaName = String(msgObj.name);
                }
                if (!personaAvatarFile && msgObj.force_avatar) {
                  personaAvatarFile = extractPersonaFileFromForceAvatar(msgObj.force_avatar);
                }
                if (personaName && personaAvatarFile) break;
              }
            } catch {
              // ignore
            }
          }
        }
      }

      const hadExplicitPersonaInChat = Boolean(personaAvatarFile || personaName);
      if (!personaAvatarFile && personaName) {
        personaAvatarFile = resolvePersonaByDisplayName(personaName, personasMap);
      }
      const hasExplicitChatPersona = Boolean(hadExplicitPersonaInChat || personaAvatarFile);
      if (!personaAvatarFile) {
        personaAvatarFile = activeUserAvatar;
      }
      if (!personaName) {
        personaName =
          personasMap[personaAvatarFile] ||
          settings?.username ||
          personaAvatarFile.replace(/\.(png|jpg|jpeg|webp)$/i, '') ||
          'User';
      }

      const safePersonaFile = personaAvatarFile ? path.basename(personaAvatarFile) : '';
      const personaExistsOnDisk = safePersonaFile
        ? fs.existsSync(path.join(USER_AVATARS_DIR, safePersonaFile))
        : false;
      const personaAvatarUrl = personaExistsOnDisk
        ? `/api/thumbnails/persona/${encodeURIComponent(safePersonaFile)}`
        : null;
      const personaAvatarMissing = Boolean(hasExplicitChatPersona && !personaExistsOnDisk);

      const embeddedMs = parseEmbeddedChatStampMs(entry.name);
      const parsedSendMs = parseSendDateMs(lastSendDate);
      let sortTimestampMs = embeddedMs || st.mtimeMs;
      if (parsedSendMs > 0) {
        sortTimestampMs = Math.max(parsedSendMs, embeddedMs);
        // Human-readable ST send_date only stores minute precision; use mtimeMs when
        // it falls inside the same ~2-minute window so rapid replies/branches sort accurately.
        if (st.mtimeMs >= parsedSendMs && st.mtimeMs - parsedSendMs <= 120_000) {
          sortTimestampMs = Math.max(sortTimestampMs, st.mtimeMs);
        }
      }

      const summary = {
        fileName: entry.name,
        chatFolder,
        parentChat,
        forkMesId,
        fileSize: st.size,
        lastModifiedMs: st.mtimeMs,
        lastModifiedIso: new Date(st.mtimeMs).toISOString(),
        lastSendDate,
        sortTimestampMs,
        messageCount,
        hasUserMessages,
        lastPreview,
        lastMessage,
        personaName,
        personaAvatarUrl,
        personaAvatarMissing,
      };

      chatSummaryCache.set(fullPath, {
        schemaVer: CHAT_SUMMARY_CACHE_SCHEMA_VER,
        mtimeMs: st.mtimeMs,
        size: st.size,
        summary,
      });

      chats.push(summary);
    } catch {
      // ignore unreadable file
    }
  }

  chats.sort((a, b) => {
    const timeDiff = (b.sortTimestampMs || 0) - (a.sortTimestampMs || 0);
    if (timeDiff !== 0) return timeDiff;
    if (Math.abs(b.lastModifiedMs - a.lastModifiedMs) > 1000) {
      return b.lastModifiedMs - a.lastModifiedMs;
    }
    return b.fileSize - a.fileSize;
  });

  const totalChats = chats.length;
  const safeOffset = Math.max(0, Math.min(Number(offset) || 0, totalChats));
  const hasLimit = limit !== null && limit !== undefined && limit !== '';
  const safeLimit = hasLimit
    ? Math.max(1, Math.min(Number(limit) || 30, 200))
    : totalChats;
  const pagedChats = hasLimit
    ? chats.slice(safeOffset, safeOffset + safeLimit)
    : chats;
  const nextOffset = safeOffset + pagedChats.length;
  const hasMore = nextOffset < totalChats;

  const session = readSession();
  const avatarKey = card?.avatar || String(avatarOrFolder || '').trim();
  const rememberedFile =
    session?.lastChats?.[avatarKey]?.file ||
    (session?.lastChat?.avatar === avatarKey ? session.lastChat.file : '') ||
    '';
  const defaultChatSummary = resolveDefaultCharacterChatSummary(chats, {
    rememberedFile,
    cardChat: card?.chat || '',
  });

  return {
    chatFolder,
    characterName: card?.name || chatFolder,
    defaultChatFile: defaultChatSummary?.fileName || null,
    totalChats,
    offset: safeOffset,
    limit: hasLimit ? safeLimit : null,
    hasMore,
    nextOffset,
    chats: pagedChats,
  };
}

export function getChatWindow(avatarOrFolder, options = {}) {
  const {
    fileName = null,
    beforeIndex = null,
    limit = 20,
    isGroup = false,
  } = options;

  let resolvedFile = fileName;
  if (!resolvedFile && !isGroup) {
    const listed = listCharacterChats(avatarOrFolder);
    resolvedFile = listed.defaultChatFile || listed.chats[0]?.fileName || null;
  }

  if (!resolvedFile) {
    return {
      found: false,
      chatFolder: resolveCharacterChatDir(avatarOrFolder).chatFolder,
      fileName: null,
      fileSize: 0,
      chatMetadata: {},
      hasUserMessages: false,
      userMessageCount: 0,
      chatPersonaAvatar: null,
      chatPersonaName: null,
      totalMessages: 0,
      startIndex: 0,
      endIndex: 0,
      hasMoreOlder: false,
      olderCount: 0,
      olderHistoryTokens: 0,
      olderHistoryRawTokens: 0,
      messages: [],
    };
  }

  const { chatFolder, filePath } = resolveChatFilePath(
    avatarOrFolder,
    resolvedFile,
    isGroup,
  );
  const parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    return {
      found: false,
      chatFolder,
      fileName: resolvedFile,
      fileSize: 0,
      chatMetadata: {},
      hasUserMessages: false,
      userMessageCount: 0,
      chatPersonaAvatar: null,
      chatPersonaName: null,
      totalMessages: 0,
      startIndex: 0,
      endIndex: 0,
      hasMoreOlder: false,
      olderCount: 0,
      olderHistoryTokens: 0,
      olderHistoryRawTokens: 0,
      messages: [],
    };
  }

  const totalMessages = parsed.messages.length;
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const endIndex =
    beforeIndex !== null && beforeIndex !== undefined && beforeIndex !== ''
      ? Math.max(0, Math.min(Number(beforeIndex), totalMessages))
      : totalMessages;
  const startIndex = Math.max(0, endIndex - safeLimit);

  const slice = [];
  for (let idx = startIndex; idx < endIndex; idx++) {
    slice.push(toCompactClientMessage(parsed.messages[idx], idx));
  }

  const personaState = resolveChatPersonaState(parsed);
  let olderHistoryTokens = 0;
  let olderHistoryRawTokens = 0;
  if (startIndex > 0) {
    const activeRegexScripts = !isGroup
      ? resolveActiveRegexScriptsServer({ cardAvatar: avatarOrFolder })
      : [];
    const recapConfig = readMessageRecapConfig();
    const olderBreakdown = estimateHistorySliceTokenBreakdown(
      parsed.messages.slice(0, startIndex),
      {
        charName: parsed.header?.character_name || chatFolder,
        userName: personaState.chatPersonaName || parsed.header?.user_name || 'User',
      },
      {
        regexScripts: activeRegexScripts,
        recapConfig,
        tailCountAfterSlice: totalMessages - startIndex,
      },
    );
    olderHistoryTokens = olderBreakdown.activeTokens;
    olderHistoryRawTokens = olderBreakdown.rawTokens;
  }

  return {
    found: true,
    chatFolder,
    fileName: resolvedFile,
    fileSize: parsed.size,
    chatMetadata: parsed.header?.chat_metadata || {},
    userName: parsed.header?.user_name || 'User',
    characterName: parsed.header?.character_name || chatFolder,
    hasUserMessages: personaState.hasUserMessages,
    userMessageCount: personaState.userMessageCount,
    chatPersonaAvatar: personaState.chatPersonaAvatar,
    chatPersonaName: personaState.chatPersonaName,
    totalMessages,
    startIndex,
    endIndex,
    hasMoreOlder: startIndex > 0,
    olderCount: startIndex,
    olderHistoryTokens,
    olderHistoryRawTokens,
    messages: slice,
  };
}







