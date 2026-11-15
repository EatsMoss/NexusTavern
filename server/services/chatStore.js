import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import {
  DEFAULT_USER_DIR,
  USER_IMAGES_DIR,
  USER_FILES_DIR,
} from '../utils/paths.js';
import {
  CHATS_DIR,
  USER_AVATARS_DIR,
  getFullCharacterCard,
  readUserSettings,
  invalidateCardStoreCaches,
} from './cardStore.js';
import { buildZipBuffer, extractZipEntries } from '../utils/zipBuilder.js';
import { resolveActiveRegexScriptsServer } from './regexStore.js';
import { readSession } from './sessionStore.js';
import {
  applyRegexPipeline,
  REGEX_PLACEMENT,
} from '../../src/core/regex/regexEngine.js';
import { estimateHistorySliceTokens } from '../../src/core/presets/tokenEstimator.js';

export const GROUP_CHATS_DIR = path.join(DEFAULT_USER_DIR, 'group chats');
export const BACKUPS_DIR = path.join(DEFAULT_USER_DIR, 'backups');

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

export function invalidateChatStoreCaches() {
  parsedChatCache.clear();
  chatSummaryCache.clear();
}

/**
 * Tracks last backup timestamp per chat file path to avoid spamming disk on every keystroke.
 */
const lastBackupTimeMap = new Map();
const BACKUP_THROTTLE_MS = 60 * 1000;
const MAX_BACKUPS_PER_PREFIX = 10;

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

function sanitizeUploadFilename(rawName = 'attachment') {
  const base = path.basename(String(rawName || 'attachment').replace(/\\/g, '/')).trim();
  const safe = base.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/^\.+/, '');
  return safe || 'attachment';
}

function parseBase64Payload(dataUrlOrBase64 = '') {
  const str = String(dataUrlOrBase64 || '').trim();
  if (!str) throw new Error('Empty attachment payload');
  const match = str.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,([\s\S]+)$/i);
  if (match) {
    return {
      mimeType: (match[1] || 'application/octet-stream').trim(),
      buffer: Buffer.from(match[2], 'base64'),
    };
  }
  return {
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(str, 'base64'),
  };
}

export async function saveChatAttachments(avatarOrFolder, rawAttachments = []) {
  const { chatFolder } = resolveCharacterChatDir(avatarOrFolder);
  const cleanFolder = String(chatFolder || 'default').replace(/[<>:"/\\|?*]/g, '_').trim() || 'default';
  const charImgDir = path.join(USER_IMAGES_DIR, cleanFolder);
  if (!fs.existsSync(charImgDir)) {
    fs.mkdirSync(charImgDir, { recursive: true });
  }
  if (!fs.existsSync(USER_FILES_DIR)) {
    fs.mkdirSync(USER_FILES_DIR, { recursive: true });
  }

  const saved = [];
  for (const item of rawAttachments) {
    if (!item || !item.dataUrl) continue;
    const origName = sanitizeUploadFilename(item.name || 'attachment');
    const parsed = parseBase64Payload(item.dataUrl);
    const mimeType = String(item.mimeType || parsed.mimeType || 'application/octet-stream');
    const kind = classifyServerAttachment({ name: origName, mimeType });
    const isImage = kind === 'image';

    const targetDir = isImage ? charImgDir : USER_FILES_DIR;
    const ext = path.extname(origName);
    const stem = ext ? origName.slice(0, -ext.length) : origName;

    let finalFileName = origName;
    let destPath = path.join(targetDir, finalFileName);
    if (fs.existsSync(destPath)) {
      const stamp = `${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
      finalFileName = `${stem}_${stamp}${ext}`;
      destPath = path.join(targetDir, finalFileName);
    }

    await writeFileAtomic(destPath, parsed.buffer);

    const stUrl = isImage
      ? `/user/images/${cleanFolder}/${finalFileName}`
      : `/user/files/${finalFileName}`;

    saved.push({
      name: origName,
      savedFileName: finalFileName,
      size: parsed.buffer.length,
      mimeType,
      ext: getAttachmentExt(origName),
      kind,
      stUrl,
      url: normalizeStAssetClientUrl(stUrl),
    });
  }

  return saved;
}

function buildSillyTavernAttachmentExtra(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) return {};
  const images = [];
  const files = [];

  for (const att of attachments) {
    if (!att) continue;
    const stUrl = String(att.stUrl || att.url || '').trim();
    if (!stUrl) continue;
    const kind = att.kind || classifyServerAttachment(att);
    if (kind === 'image') {
      images.push({
        url: stUrl,
        type: 'image',
        name: att.name || path.basename(stUrl),
        title: att.title || att.name || '',
        size: Number(att.size || 0),
        mimeType: att.mimeType || '',
        source: 'uploaded',
      });
    } else {
      files.push({
        url: stUrl,
        name: att.name || path.basename(stUrl),
        size: Number(att.size || 0),
        mimeType: att.mimeType || '',
      });
    }
  }

  const extra = {};
  if (images.length > 0) {
    extra.media = images;
    extra.media_display = 'gallery';
    extra.media_index = 0;
    extra.image = images[0].url;
    extra.inline_image = true;
  }
  if (files.length > 0) {
    extra.file = files[0];
    if (files.length > 1) {
      extra.files = files;
    }
  }
  return extra;
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

export function ensureChatBackup(filePath, chatFolder, force = false) {
  if (!fs.existsSync(filePath)) return null;
  const now = Date.now();
  const lastBackup = lastBackupTimeMap.get(filePath) || 0;
  if (!force && now - lastBackup < BACKUP_THROTTLE_MS) {
    return null;
  }

  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const safeFolder = String(chatFolder || 'chat')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toLowerCase();
  const d = new Date(now);
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    '-',
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join('');
  const backupName = `chat_${safeFolder}_${stamp}.jsonl`;
  const backupPath = path.join(BACKUPS_DIR, backupName);

  try {
    fs.copyFileSync(filePath, backupPath);
    lastBackupTimeMap.set(filePath, now);

    const prefix = `chat_${safeFolder}_`;
    const existing = fs
      .readdirSync(BACKUPS_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.startsWith(prefix) && e.name.endsWith('.jsonl'))
      .map((e) => {
        const full = path.join(BACKUPS_DIR, e.name);
        const st = fs.statSync(full);
        return { name: e.name, full, mtimeMs: st.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (existing.length > MAX_BACKUPS_PER_PREFIX) {
      for (const old of existing.slice(MAX_BACKUPS_PER_PREFIX)) {
        try {
          fs.unlinkSync(old.full);
        } catch {
          // ignore cleanup failure
        }
      }
    }
    return backupName;
  } catch {
    return null;
  }
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

function getAttachmentExt(fileName = '') {
  const clean = String(fileName || '').split('?')[0].split('#')[0].trim();
  const dot = clean.lastIndexOf('.');
  if (dot <= 0 || dot === clean.length - 1) return '';
  return clean.slice(dot + 1).toLowerCase();
}

function classifyServerAttachment({ name = '', mimeType = '', explicitType = '' } = {}) {
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

function extractPersonaFileFromForceAvatar(rawForceAvatar) {
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

function resolvePersonaByDisplayName(userName, personasMap = {}) {
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
  const olderHistoryTokens =
    startIndex > 0
      ? estimateHistorySliceTokens(parsed.messages.slice(0, startIndex), {
          charName: parsed.header?.character_name || chatFolder,
          userName: personaState.chatPersonaName || parsed.header?.user_name || 'User',
        })
      : 0;

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
    messages: slice,
  };
}

export async function getOrSelectMessageSwipe(
  avatarOrFolder,
  fileName,
  messageIndex,
  swipeId,
  options = {},
) {
  const { persistSelection = true, isGroup = false } = options;
  const { chatFolder, filePath } = resolveChatFilePath(
    avatarOrFolder,
    fileName,
    isGroup,
  );
  const parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    throw new Error('Chat file not found');
  }

  const idx = Number(messageIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.messages.length) {
    throw new Error(`Message index ${messageIndex} out of range`);
  }

  const targetMsg = parsed.messages[idx];
  const swipes =
    Array.isArray(targetMsg.swipes) && targetMsg.swipes.length > 0
      ? targetMsg.swipes
      : [String(targetMsg.mes ?? '')];

  const requestedSwipe = Number(swipeId ?? 0);
  const normalizedSwipeId =
    ((requestedSwipe % swipes.length) + swipes.length) % swipes.length;

  targetMsg.swipe_id = normalizedSwipeId;
  targetMsg.mes = String(swipes[normalizedSwipeId] ?? '');
  if (
    Array.isArray(targetMsg.swipe_info) &&
    targetMsg.swipe_info[normalizedSwipeId]?.send_date
  ) {
    targetMsg.send_date = targetMsg.swipe_info[normalizedSwipeId].send_date;
  }

  if (persistSelection) {
    ensureChatBackup(filePath, chatFolder, false);
    await writeParsedJsonlChat(filePath, parsed.header, parsed.messages);
  }

  return {
    chatFolder,
    fileName,
    message: toCompactClientMessage(targetMsg, idx),
  };
}

export async function appendChatMessage(avatarOrFolder, fileName, payload = {}, isGroup = false) {
  const { chatFolder, filePath, card } = resolveChatFilePath(
    avatarOrFolder,
    fileName,
    isGroup,
  );

  let parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    const settings = readUserSettings();
    const header = {
      chat_metadata: {
        note_prompt: '',
        note_interval: 1,
        note_position: 1,
        note_depth: 4,
        note_role: 0,
        tainted: false,
        integrity: crypto.randomUUID(),
      },
      user_name: settings.username || 'User',
      character_name: card?.name || chatFolder,
    };
    parsed = await writeParsedJsonlChat(filePath, header, []);
  } else {
    ensureChatBackup(filePath, chatFolder, false);
  }

  const isUser = payload.is_user !== undefined ? Boolean(payload.is_user) : true;
  const isSystem = Boolean(payload.is_system);
  let text = String(payload.mes ?? payload.text ?? '');
  const sendDate = payload.send_date || formatSillyTavernSendDate();
  const senderName =
    payload.name ||
    (isUser ? parsed.header?.user_name || 'User' : card?.name || chatFolder);

  // Run permanent (non-ephemeral) USER_INPUT regex scripts when appending a user message
  if (isUser && !isSystem && text && !isGroup) {
    const activeRegexScripts = resolveActiveRegexScriptsServer({ card });
    if (activeRegexScripts.length > 0) {
      text = applyRegexPipeline(text, activeRegexScripts, {
        placement: REGEX_PLACEMENT.USER_INPUT,
        isPermanent: true,
        depth: 0,
        charName: card?.nickname || card?.name || chatFolder,
        userName: senderName,
      });
    }
  }

  const attachmentExtra = buildSillyTavernAttachmentExtra(payload.attachments);

  const newMsg = {
    name: senderName,
    is_user: isUser,
    is_system: isSystem,
    send_date: sendDate,
    mes: text,
    extra: {
      bias: '',
      reasoning: String(payload.reasoning || ''),
      token_count: estimateTokenCount(text),
      ...(payload.api ? { api: String(payload.api) } : {}),
      ...(payload.model ? { model: String(payload.model) } : {}),
      ...(typeof payload.reasoning_duration === 'number'
        ? { reasoning_duration: payload.reasoning_duration }
        : {}),
      ...(typeof payload.time_spent === 'number' ? { time_spent: payload.time_spent } : {}),
      ...(payload.fallback_info ? { fallback_info: payload.fallback_info } : {}),
      ...attachmentExtra,
      ...(payload.extra || {}),
    },
  };

  if (payload.gen_started) newMsg.gen_started = payload.gen_started;
  if (payload.gen_finished) newMsg.gen_finished = payload.gen_finished;

  if (!isUser) {
    newMsg.swipes = Array.isArray(payload.swipes) && payload.swipes.length > 0
      ? payload.swipes
      : [text];
    newMsg.swipe_id = Number(payload.swipe_id ?? 0);
    newMsg.swipe_info = newMsg.swipes.map((swText, sIdx) => ({
      send_date: sendDate,
      ...(payload.gen_started ? { gen_started: payload.gen_started } : {}),
      ...(payload.gen_finished ? { gen_finished: payload.gen_finished } : {}),
      extra: {
        bias: null,
        token_count: estimateTokenCount(swText),
        ...(sIdx === newMsg.swipe_id
          ? {
              ...(payload.api ? { api: String(payload.api) } : {}),
              ...(payload.model ? { model: String(payload.model) } : {}),
              ...(payload.reasoning ? { reasoning: String(payload.reasoning) } : {}),
              ...(typeof payload.reasoning_duration === 'number'
                ? { reasoning_duration: payload.reasoning_duration }
                : {}),
              ...(typeof payload.time_spent === 'number'
                ? { time_spent: payload.time_spent }
                : {}),
              ...(payload.fallback_info ? { fallback_info: payload.fallback_info } : {}),
            }
          : {}),
      },
    }));
  }

  if (payload.force_avatar) {
    newMsg.force_avatar = payload.force_avatar;
  }

  let headerDirty = false;
  if (isUser) {
    if (!parsed.header) {
      parsed.header = { chat_metadata: {}, user_name: senderName, character_name: card?.name || chatFolder };
      headerDirty = true;
    } else if (parsed.header.user_name !== senderName) {
      parsed.header.user_name = senderName;
      headerDirty = true;
    }
    const personaFile = payload.force_avatar
      ? extractPersonaFileFromForceAvatar(payload.force_avatar)
      : '';
    if (personaFile) {
      if (!parsed.header.chat_metadata) parsed.header.chat_metadata = {};
      if (parsed.header.chat_metadata.persona !== personaFile) {
        parsed.header.chat_metadata.persona = personaFile;
        headerDirty = true;
      }
    }
  }

  parsed.messages.push(newMsg);
  if (headerDirty) {
    await writeParsedJsonlChat(filePath, parsed.header, parsed.messages);
  } else {
    fs.appendFileSync(filePath, `${JSON.stringify(newMsg)}\n`, 'utf8');
    const st = fs.statSync(filePath);
    parsed.mtimeMs = st.mtimeMs;
    parsed.size = st.size;
  }
  chatSummaryCache.delete(filePath);

  const newIndex = parsed.messages.length - 1;
  return {
    chatFolder,
    fileName,
    totalMessages: parsed.messages.length,
    message: toCompactClientMessage(newMsg, newIndex),
  };
}

export async function patchChatMessage(
  avatarOrFolder,
  fileName,
  messageIndex,
  patch = {},
  isGroup = false,
) {
  const { chatFolder, filePath, card } = resolveChatFilePath(
    avatarOrFolder,
    fileName,
    isGroup,
  );
  const parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    throw new Error('Chat file not found');
  }

  const idx = Number(messageIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.messages.length) {
    throw new Error(`Message index ${messageIndex} out of range`);
  }

  const backupFile = ensureChatBackup(filePath, chatFolder, false);
  const msg = parsed.messages[idx];

  const ensureSwipeInfoAt = (sIdx, swText) => {
    if (!Array.isArray(msg.swipe_info)) msg.swipe_info = [];
    if (!msg.swipe_info[sIdx] || typeof msg.swipe_info[sIdx] !== 'object') {
      msg.swipe_info[sIdx] = {
        send_date: msg.send_date || formatSillyTavernSendDate(),
        extra: { bias: null, token_count: estimateTokenCount(swText) },
      };
    }
    if (!msg.swipe_info[sIdx].extra || typeof msg.swipe_info[sIdx].extra !== 'object') {
      msg.swipe_info[sIdx].extra = { bias: null };
    }
    return msg.swipe_info[sIdx];
  };

  const applySwipeMeta = (sInfo, swText) => {
    sInfo.extra.token_count = estimateTokenCount(swText);
    if (patch.gen_started) sInfo.gen_started = patch.gen_started;
    if (patch.gen_finished) sInfo.gen_finished = patch.gen_finished;
    if (patch.api) sInfo.extra.api = String(patch.api);
    if (patch.model) sInfo.extra.model = String(patch.model);
    if (patch.reasoning !== undefined) sInfo.extra.reasoning = String(patch.reasoning);
    if (typeof patch.reasoning_duration === 'number') {
      sInfo.extra.reasoning_duration = patch.reasoning_duration;
    }
    if (typeof patch.time_spent === 'number') {
      sInfo.extra.time_spent = patch.time_spent;
    }
    if (patch.fallback_info !== undefined) {
      if (patch.fallback_info) {
        sInfo.extra.fallback_info = patch.fallback_info;
      } else {
        delete sInfo.extra.fallback_info;
      }
    }
  };

  if (typeof patch.addSwipeText === 'string') {
    let swipeText = patch.addSwipeText;
    if (swipeText && !isGroup && !patch.gen_finished) {
      const activeRegexScripts = resolveActiveRegexScriptsServer({ card });
      if (activeRegexScripts.length > 0) {
        const editDepth = Math.max(0, parsed.messages.length - 1 - idx);
        swipeText = applyRegexPipeline(swipeText, activeRegexScripts, {
          placement: msg.is_user ? REGEX_PLACEMENT.USER_INPUT : REGEX_PLACEMENT.AI_OUTPUT,
          isPermanent: true,
          isEdit: true,
          depth: editDepth,
          charName: card?.nickname || card?.name || chatFolder,
          userName: parsed.header?.user_name || 'User',
        });
      }
    }
    if (!Array.isArray(msg.swipes) || msg.swipes.length === 0) {
      const firstText = String(msg.mes ?? '');
      msg.swipes = [firstText];
      const s0 = ensureSwipeInfoAt(0, firstText);
      if (msg.extra?.reasoning && !s0.extra.reasoning) s0.extra.reasoning = msg.extra.reasoning;
      if (msg.extra?.api && !s0.extra.api) s0.extra.api = msg.extra.api;
      if (msg.extra?.model && !s0.extra.model) s0.extra.model = msg.extra.model;
      if (msg.extra?.reasoning_duration && !s0.extra.reasoning_duration) {
        s0.extra.reasoning_duration = msg.extra.reasoning_duration;
      }
      if (msg.extra?.fallback_info && !s0.extra.fallback_info) {
        s0.extra.fallback_info = msg.extra.fallback_info;
      }
      if (msg.gen_started && !s0.gen_started) s0.gen_started = msg.gen_started;
      if (msg.gen_finished && !s0.gen_finished) s0.gen_finished = msg.gen_finished;
    }
    msg.swipes.push(swipeText);
    msg.swipe_id = msg.swipes.length - 1;
    msg.mes = swipeText;
    const sendDate = patch.send_date || formatSillyTavernSendDate();
    msg.send_date = sendDate;
    const sInfo = ensureSwipeInfoAt(msg.swipe_id, swipeText);
    sInfo.send_date = sendDate;
    applySwipeMeta(sInfo, swipeText);
  }

  if (typeof patch.appendToActiveSwipe === 'string' && patch.appendToActiveSwipe.length > 0) {
    if (!Array.isArray(msg.swipes) || msg.swipes.length === 0) {
      msg.swipes = [String(msg.mes ?? '')];
    }
    const activeSwipeId = Math.max(0, Math.min(Number(msg.swipe_id ?? 0), msg.swipes.length - 1));
    const joinedText = `${String(msg.swipes[activeSwipeId] ?? msg.mes ?? '')}${patch.appendToActiveSwipe}`;
    msg.swipes[activeSwipeId] = joinedText;
    msg.mes = joinedText;
    const sInfo = ensureSwipeInfoAt(activeSwipeId, joinedText);
    sInfo.extra.token_count = estimateTokenCount(joinedText);
    if (patch.gen_finished) sInfo.gen_finished = patch.gen_finished;
    if (patch.api) sInfo.extra.api = String(patch.api);
    if (patch.model) sInfo.extra.model = String(patch.model);
    if (patch.fallback_info) sInfo.extra.fallback_info = patch.fallback_info;
    if (patch.reasoning) {
      sInfo.extra.reasoning = sInfo.extra.reasoning
        ? `${sInfo.extra.reasoning}\n\n${patch.reasoning}`
        : String(patch.reasoning);
    }
    if (!msg.extra) msg.extra = {};
    msg.extra.token_count = sInfo.extra.token_count;
  }

  if (patch.mes !== undefined || patch.text !== undefined) {
    let nextText = String(patch.mes ?? patch.text ?? '');
    if (nextText && !isGroup) {
      const activeRegexScripts = resolveActiveRegexScriptsServer({ card });
      if (activeRegexScripts.length > 0) {
        const editDepth = Math.max(0, parsed.messages.length - 1 - idx);
        nextText = applyRegexPipeline(nextText, activeRegexScripts, {
          placement: msg.is_user ? REGEX_PLACEMENT.USER_INPUT : REGEX_PLACEMENT.AI_OUTPUT,
          isPermanent: true,
          isEdit: true,
          depth: editDepth,
          charName: card?.nickname || card?.name || chatFolder,
          userName: parsed.header?.user_name || 'User',
        });
      }
    }
    msg.mes = nextText;
    if (Array.isArray(msg.swipes) && msg.swipes.length > 0) {
      const activeSwipeId = Math.max(0, Math.min(Number(msg.swipe_id ?? 0), msg.swipes.length - 1));
      msg.swipes[activeSwipeId] = nextText;
      applySwipeMeta(ensureSwipeInfoAt(activeSwipeId, nextText), nextText);
    }
    if (!msg.extra) msg.extra = {};
    msg.extra.token_count = estimateTokenCount(nextText);
  }

  if (patch.reasoning !== undefined) {
    if (!msg.extra) msg.extra = {};
    msg.extra.reasoning = String(patch.reasoning);
    if (Array.isArray(msg.swipes) && msg.swipes.length > 0) {
      const activeSwipeId = Math.max(0, Math.min(Number(msg.swipe_id ?? 0), msg.swipes.length - 1));
      ensureSwipeInfoAt(activeSwipeId, msg.swipes[activeSwipeId] || '').extra.reasoning = String(
        patch.reasoning,
      );
    }
  }

  if (patch.api !== undefined) {
    if (!msg.extra) msg.extra = {};
    msg.extra.api = String(patch.api);
  }
  if (patch.model !== undefined) {
    if (!msg.extra) msg.extra = {};
    msg.extra.model = String(patch.model);
  }
  if (patch.fallback_info !== undefined) {
    if (!msg.extra) msg.extra = {};
    if (patch.fallback_info) {
      msg.extra.fallback_info = patch.fallback_info;
    } else {
      delete msg.extra.fallback_info;
    }
  }

  if (patch.removeAttachmentIndex !== undefined) {
    const removeIdx = Number(patch.removeAttachmentIndex);
    const activeSwipeIdx =
      Array.isArray(msg.swipes) && msg.swipes.length > 0
        ? Math.max(0, Math.min(Number(msg.swipe_id ?? 0), msg.swipes.length - 1))
        : -1;
    const activeSwipeObj =
      activeSwipeIdx >= 0 && Array.isArray(msg.swipe_info) ? msg.swipe_info[activeSwipeIdx] : null;

    const currentAtts = extractMessageAttachments(msg, activeSwipeObj);
    const remaining = currentAtts.filter((_, i) => i !== removeIdx);

    const clearExtraMediaKeys = (extraTarget) => {
      if (!extraTarget || typeof extraTarget !== 'object') return;
      delete extraTarget.media;
      delete extraTarget.media_display;
      delete extraTarget.media_index;
      delete extraTarget.image;
      delete extraTarget.image_swipes;
      delete extraTarget.inline_image;
      delete extraTarget.file;
      delete extraTarget.files;
    };

    if (!msg.extra || typeof msg.extra !== 'object') msg.extra = {};
    clearExtraMediaKeys(msg.extra);
    if (activeSwipeObj?.extra) {
      clearExtraMediaKeys(activeSwipeObj.extra);
    }

    if (remaining.length > 0) {
      Object.assign(msg.extra, buildSillyTavernAttachmentExtra(remaining));
    }
  }

  if (patch.name !== undefined) {
    msg.name = String(patch.name);
  }

  await writeParsedJsonlChat(filePath, parsed.header, parsed.messages);

  return {
    chatFolder,
    fileName,
    backupFile,
    totalMessages: parsed.messages.length,
    message: toCompactClientMessage(msg, idx),
  };
}

export async function deleteMessageSwipe(
  avatarOrFolder,
  fileName,
  messageIndex,
  swipeId,
  isGroup = false,
) {
  const { chatFolder, filePath } = resolveChatFilePath(avatarOrFolder, fileName, isGroup);
  const parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    throw new Error('Chat file not found');
  }

  const idx = Number(messageIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.messages.length) {
    throw new Error(`Message index ${messageIndex} out of range`);
  }

  const msg = parsed.messages[idx];
  if (!Array.isArray(msg.swipes) || msg.swipes.length <= 1) {
    throw new Error('Cannot delete the only swipe of a message');
  }

  const targetSwipe = Number(swipeId);
  if (!Number.isInteger(targetSwipe) || targetSwipe < 0 || targetSwipe >= msg.swipes.length) {
    throw new Error(`Swipe index ${swipeId} out of range`);
  }

  const backupFile = ensureChatBackup(filePath, chatFolder, false);
  msg.swipes.splice(targetSwipe, 1);
  if (Array.isArray(msg.swipe_info) && targetSwipe < msg.swipe_info.length) {
    msg.swipe_info.splice(targetSwipe, 1);
  }

  const nextSwipeId = Math.max(0, Math.min(targetSwipe, msg.swipes.length - 1));
  msg.swipe_id = nextSwipeId;
  msg.mes = String(msg.swipes[nextSwipeId] ?? '');
  const activeInfo = Array.isArray(msg.swipe_info) ? msg.swipe_info[nextSwipeId] : null;
  if (activeInfo?.send_date) {
    msg.send_date = activeInfo.send_date;
  }
  if (!msg.extra) msg.extra = {};
  msg.extra.token_count = estimateTokenCount(msg.mes);
  msg.extra.reasoning = activeInfo?.extra?.reasoning ?? '';

  await writeParsedJsonlChat(filePath, parsed.header, parsed.messages);

  return {
    chatFolder,
    fileName,
    backupFile,
    totalMessages: parsed.messages.length,
    message: toCompactClientMessage(msg, idx),
  };
}

export async function deleteChatMessage(
  avatarOrFolder,
  fileName,
  messageIndex,
  options = {},
) {
  const { truncateTail = false, isGroup = false } = options;
  const { chatFolder, filePath } = resolveChatFilePath(
    avatarOrFolder,
    fileName,
    isGroup,
  );
  const parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    throw new Error('Chat file not found');
  }

  const idx = Number(messageIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.messages.length) {
    throw new Error(`Message index ${messageIndex} out of range`);
  }

  const backupFile = ensureChatBackup(filePath, chatFolder, true);
  if (truncateTail) {
    parsed.messages.splice(idx);
  } else {
    parsed.messages.splice(idx, 1);
  }

  await writeParsedJsonlChat(filePath, parsed.header, parsed.messages);

  return {
    chatFolder,
    fileName,
    backupFile,
    totalMessages: parsed.messages.length,
  };
}

export async function deleteChatMessagesBatch(
  avatarOrFolder,
  fileName,
  messageIndices = [],
  options = {},
) {
  const { isGroup = false } = options;
  const { chatFolder, filePath } = resolveChatFilePath(
    avatarOrFolder,
    fileName,
    isGroup,
  );
  const parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    throw new Error('Chat file not found');
  }

  const rawList = Array.isArray(messageIndices) ? messageIndices : [];
  const validSet = new Set();
  for (const raw of rawList) {
    const idx = Number(raw);
    if (Number.isInteger(idx) && idx >= 0 && idx < parsed.messages.length) {
      validSet.add(idx);
    }
  }

  if (validSet.size === 0) {
    throw new Error('No valid message indices provided');
  }

  const backupFile = ensureChatBackup(filePath, chatFolder, true);
  const nextMessages = parsed.messages.filter((_, idx) => !validSet.has(idx));
  const deletedCount = parsed.messages.length - nextMessages.length;

  await writeParsedJsonlChat(filePath, parsed.header, nextMessages);

  return {
    chatFolder,
    fileName,
    backupFile,
    deletedCount,
    totalMessages: nextMessages.length,
  };
}

export async function createNewCharacterChat(avatarOrFolder, options = {}) {
  const {
    greetingIndex = 0,
    greetingText = null,
    introPortraitUrl = null,
    customFileName = null,
  } = options;
  const { chatFolder, dirPath, card } = resolveCharacterChatDir(avatarOrFolder);
  const settings = readUserSettings();
  const personasMap = settings?.power_user?.personas || {};
  const activePersonaAvatar = settings?.user_avatar || '';
  const userName =
    (activePersonaAvatar && personasMap[activePersonaAvatar]) ||
    settings.username ||
    'User';
  const characterName = card?.name || chatFolder;
  const fileName = customFileName
    ? path.basename(customFileName)
    : formatSillyTavernChatFilename(characterName);
  const filePath = path.join(dirPath, fileName);

  const rawIdx = Math.max(0, Number(greetingIndex) || 0);
  const resolvedPortraitUrl =
    (typeof introPortraitUrl === 'string' && introPortraitUrl.trim()) ||
    card?.scenarioMeta?.introsMeta?.[rawIdx]?.portraitUrl ||
    null;

  const header = {
    chat_metadata: {
      note_prompt: '',
      note_interval: 1,
      note_position: 1,
      note_depth: 4,
      note_role: 0,
      tainted: false,
      timedWorldInfo: { sticky: {}, cooldown: {} },
      integrity: crypto.randomUUID(),
      ...(resolvedPortraitUrl ? { scenario_portrait_url: resolvedPortraitUrl } : {}),
    },
    user_name: userName,
    character_name: characterName,
  };

  const messages = [];
  if (card) {
    const rawGreetings = [
      String(card.first_mes ?? ''),
      ...(Array.isArray(card.alternate_greetings)
        ? card.alternate_greetings.map((g) => String(g ?? ''))
        : []),
    ];

    const customText = typeof greetingText === 'string' ? greetingText : null;
    if (customText !== null && customText.trim().length > 0 && rawIdx >= rawGreetings.length) {
      const sendDate = formatSillyTavernSendDate();
      messages.push({
        name: characterName,
        is_user: false,
        is_system: false,
        send_date: sendDate,
        mes: customText,
        swipes: [customText],
        swipe_id: 0,
        swipe_info: [{ send_date: sendDate, extra: { bias: null } }],
        extra: {
          bias: null,
          token_count: estimateTokenCount(customText),
        },
      });
    } else {
      const indexedGreetings = rawGreetings
        .map((text, idx) => ({ text, idx }))
        .filter((entry) => entry.text.trim().length > 0);

      if (indexedGreetings.length > 0) {
        const matchedPos = indexedGreetings.findIndex((entry) => entry.idx === rawIdx);
        const safeSwipePos =
          matchedPos >= 0
            ? matchedPos
            : Math.min(rawIdx, indexedGreetings.length - 1);
        const allGreetings = indexedGreetings.map((entry) => entry.text);
        const activeText =
          customText !== null && customText.trim().length > 0
            ? customText
            : allGreetings[safeSwipePos];
        if (customText !== null && customText.trim().length > 0) {
          allGreetings[safeSwipePos] = customText;
        }
        const sendDate = formatSillyTavernSendDate();
        messages.push({
          name: characterName,
          is_user: false,
          is_system: false,
          send_date: sendDate,
          mes: activeText,
          swipes: allGreetings,
          swipe_id: safeSwipePos,
          swipe_info: allGreetings.map(() => ({
            send_date: sendDate,
            extra: { bias: null },
          })),
          extra: {
            bias: null,
            token_count: estimateTokenCount(activeText),
          },
        });
      }
    }
  }

  await writeParsedJsonlChat(filePath, header, messages);
  return getChatWindow(avatarOrFolder, { fileName, limit: 20 });
}

/**
 * Creates a new branch (fork) from an existing `.jsonl` chat file.
 * Names the new file `<base> - Branch #<N>.jsonl` using the lowest unused N >= 1.
 * When `options.upToMessageIndex` is provided, keeps messages `0..upToMessageIndex`
 * inclusive and trims everything after it in the newly created branch.
 */
export async function branchCharacterChat(avatarOrFolder, sourceFileName, options = {}) {
  const { upToMessageIndex = null } = options || {};
  const { dirPath } = resolveCharacterChatDir(avatarOrFolder);
  const { fileName: resolvedSource, filePath: sourcePath } = resolveChatFilePath(
    avatarOrFolder,
    sourceFileName,
    false,
  );

  const parsed = readParsedJsonlChat(sourcePath);
  if (!parsed) {
    throw new Error(`Source chat "${resolvedSource}" not found`);
  }

  const sourceStem = resolvedSource.replace(/\.jsonl$/i, '');
  let baseStem = sourceStem
    .replace(/\s*-\s*Branch\s*#\d+$/i, '')
    .replace(/^Branch\s*#\d+\s*-\s*/i, '')
    .trim();
  if (!baseStem) {
    baseStem = sourceStem;
  }

  const existingFiles = new Set(
    fs.existsSync(dirPath)
      ? fs
          .readdirSync(dirPath, { withFileTypes: true })
          .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.jsonl'))
          .map((e) => e.name.toLowerCase())
      : [],
  );

  let branchNum = 1;
  let newFileName = `${baseStem} - Branch #${branchNum}.jsonl`;
  while (existingFiles.has(newFileName.toLowerCase())) {
    branchNum += 1;
    newFileName = `${baseStem} - Branch #${branchNum}.jsonl`;
  }

  const totalCount = parsed.messages.length;
  const hasCutoff =
    upToMessageIndex !== null &&
    upToMessageIndex !== undefined &&
    Number.isFinite(Number(upToMessageIndex));
  const forkMesIdx =
    totalCount === 0
      ? 0
      : hasCutoff
        ? Math.max(0, Math.min(Math.trunc(Number(upToMessageIndex)), totalCount - 1))
        : totalCount - 1;

  const sourceSlice =
    totalCount === 0 ? [] : parsed.messages.slice(0, forkMesIdx + 1);

  const newFilePath = path.join(dirPath, newFileName);
  const newHeader = {
    ...(parsed.header || {}),
    chat_metadata: {
      ...(parsed.header?.chat_metadata || {}),
      main_chat: sourceStem,
      bbFork: {
        parent: sourceStem,
        mesId: forkMesIdx,
      },
      integrity: crypto.randomUUID(),
    },
  };

  const clonedMessages = sourceSlice.map((m) => structuredClone(m));
  await writeParsedJsonlChat(newFilePath, newHeader, clonedMessages);

  return getChatWindow(avatarOrFolder, { fileName: newFileName, limit: 20 });
}

/**
 * Deletes one or more `.jsonl` chat files for a character (saving a backup first).
 */
export function deleteCharacterChatFiles(avatarOrFolder, fileNames = []) {
  const targets = Array.isArray(fileNames) ? fileNames : [fileNames];
  const uniqueNames = Array.from(
    new Set(
      targets
        .map((n) => path.basename(String(n || '').trim()))
        .filter((n) => n && n.toLowerCase().endsWith('.jsonl')),
    ),
  );

  if (uniqueNames.length === 0) {
    throw new Error('At least one valid .jsonl chat file is required');
  }

  const { chatFolder, dirPath } = resolveCharacterChatDir(avatarOrFolder);
  const deleted = [];

  for (const name of uniqueNames) {
    const filePath = path.join(dirPath, name);
    if (!fs.existsSync(filePath)) continue;
    try {
      ensureChatBackup(filePath, chatFolder, true);
    } catch {
      // ignore backup error on delete
    }
    fs.unlinkSync(filePath);
    parsedChatCache.delete(filePath);
    chatSummaryCache.delete(filePath);
    lastBackupTimeMap.delete(filePath);
    deleted.push(name);
  }

  const remaining = fs.existsSync(dirPath)
    ? fs
        .readdirSync(dirPath, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.jsonl')).length
    : 0;

  return {
    chatFolder,
    deleted,
    deletedCount: deleted.length,
    remainingChatsCount: remaining,
  };
}

/**
 * Deletes every `.jsonl` chat file inside a character's chat directory (creating rotating
 * backups first) and invalidates both chat and card summary caches.
 */
export function deleteAllCharacterChats(avatarOrFolder) {
  const { chatFolder, dirPath } = resolveCharacterChatDir(avatarOrFolder);
  if (!fs.existsSync(dirPath)) {
    return {
      chatFolder,
      deleted: [],
      deletedCount: 0,
      remainingChatsCount: 0,
    };
  }

  const allJsonlNames = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.jsonl'))
    .map((e) => e.name);

  if (allJsonlNames.length === 0) {
    return {
      chatFolder,
      deleted: [],
      deletedCount: 0,
      remainingChatsCount: 0,
    };
  }

  const result = deleteCharacterChatFiles(avatarOrFolder, allJsonlNames);
  invalidateCardStoreCaches();
  return result;
}

/**
 * Packs all `.jsonl` chat files for a character into a single `.zip` archive.
 */
export function exportCharacterChatsZip(avatarOrFolder) {
  const { chatFolder, dirPath, card } = resolveCharacterChatDir(avatarOrFolder);
  const zipEntries = [];

  if (fs.existsSync(dirPath)) {
    const entries = fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.jsonl'))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        zipEntries.push({
          fileName: entry.name,
          buffer: fs.readFileSync(fullPath),
          compress: true,
        });
      } catch {
        // skip unreadable file
      }
    }
  }

  const rawLabel = card?.name || chatFolder || 'character';
  const safeStem =
    String(rawLabel)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .trim()
      .slice(0, 64) || 'character';
  const dateStamp = new Date().toISOString().slice(0, 10);
  const zipFileName = `${safeStem}-chats-${dateStamp}.zip`;
  const zipBuffer = buildZipBuffer(zipEntries);

  return {
    chatFolder,
    contentType: 'application/zip',
    fileName: zipFileName,
    count: zipEntries.length,
    buffer: zipBuffer,
  };
}

function normalizeImportedChatPayload(
  rawText,
  fallbackCharName = 'Character',
  fallbackUserName = 'User',
) {
  const text = String(rawText || '').replace(/^\uFEFF/, '').trim();
  if (!text) {
    throw new Error('Chat file is empty');
  }

  if (text.startsWith('[') || (text.startsWith('{') && !text.includes('\n'))) {
    try {
      const whole = JSON.parse(text);
      if (Array.isArray(whole)) {
        if (whole.length === 0) throw new Error('Chat JSON array is empty');
        const first = whole[0];
        const hasHeader =
          first &&
          typeof first === 'object' &&
          (first.chat_metadata !== undefined ||
            (first.user_name !== undefined && first.mes === undefined));
        const header = hasHeader
          ? first
          : {
              user_name: fallbackUserName,
              character_name: fallbackCharName,
              create_date: formatSillyTavernSendDate(new Date()),
              chat_metadata: {},
            };
        const validMsgs = (hasHeader ? whole.slice(1) : whole).filter(
          (m) => m && typeof m === 'object',
        );
        return `${[JSON.stringify(header), ...validMsgs.map((m) => JSON.stringify(m))].join('\n')}\n`;
      }
      if (whole && typeof whole === 'object' && Array.isArray(whole.messages)) {
        const header = {
          user_name: whole.user_name || fallbackUserName,
          character_name: whole.character_name || fallbackCharName,
          create_date: whole.create_date || formatSillyTavernSendDate(new Date()),
          chat_metadata:
            whole.chat_metadata && typeof whole.chat_metadata === 'object'
              ? whole.chat_metadata
              : {},
        };
        const validMsgs = whole.messages.filter((m) => m && typeof m === 'object');
        return `${[JSON.stringify(header), ...validMsgs.map((m) => JSON.stringify(m))].join('\n')}\n`;
      }
    } catch (err) {
      if (text.startsWith('[')) throw err;
    }
  }

  const parsedLines = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        parsedLines.push(obj);
      }
    } catch {
      // skip malformed line
    }
  }

  if (parsedLines.length === 0) {
    throw new Error('No valid JSONL chat entries found in file');
  }

  const first = parsedLines[0];
  const hasHeader =
    first.chat_metadata !== undefined ||
    (first.user_name !== undefined && first.mes === undefined);

  const normalizedLines = hasHeader
    ? parsedLines
    : [
        {
          user_name: fallbackUserName,
          character_name: fallbackCharName,
          create_date: formatSillyTavernSendDate(new Date()),
          chat_metadata: {},
        },
        ...parsedLines,
      ];

  return `${normalizedLines.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
}

function buildSafeUniqueChatFileName(dirPath, rawFileName, fallbackPrefix = 'Chat') {
  const base = path.basename(String(rawFileName || '').replace(/\\/g, '/')).trim();
  const withoutExt = base.replace(/\.(jsonl|json)$/i, '').trim();
  const cleanStem =
    (withoutExt || formatSillyTavernChatFilename(fallbackPrefix).replace(/\.jsonl$/i, ''))
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/^\.+/, '')
      .trim() || 'Imported Chat';

  let candidate = `${cleanStem}.jsonl`;
  let counter = 2;
  while (fs.existsSync(path.join(dirPath, candidate))) {
    candidate = `${cleanStem} (${counter}).jsonl`;
    counter += 1;
  }
  return candidate;
}

/**
 * Imports one or more `.jsonl` / `.json` chat files or `.zip` archives of chats
 * into a character's chat folder (`data/default-user/chats/<chatFolder>/`).
 */
export async function importCharacterChats(avatarOrFolder, rawItems = []) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('No chat files provided for import');
  }

  const { chatFolder, dirPath, card } = resolveCharacterChatDir(avatarOrFolder);
  const settings = readUserSettings();
  const fallbackCharName = card?.name || chatFolder || 'Character';
  const fallbackUserName = settings?.username || 'User';

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const candidateFiles = [];
  const errors = [];

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;
    const rawName = String(item.fileName || item.name || 'chat.jsonl').trim();
    let buf = null;

    if (typeof item.contentBase64 === 'string' && item.contentBase64.trim()) {
      buf = parseBase64Payload(item.contentBase64).buffer;
    } else if (typeof item.contentText === 'string') {
      buf = Buffer.from(item.contentText, 'utf8');
    }

    if (!buf || buf.length === 0) {
      errors.push(`${rawName}: empty file`);
      continue;
    }

    const isZipMagic =
      buf.length >= 4 &&
      buf[0] === 0x50 &&
      buf[1] === 0x4b &&
      (buf[2] === 0x03 || buf[2] === 0x05);
    const isZipExt = rawName.toLowerCase().endsWith('.zip');

    if (isZipMagic || isZipExt) {
      try {
        const unpacked = extractZipEntries(buf);
        const chatEntries = unpacked.filter((e) => /\.(jsonl|json)$/i.test(e.fileName));
        if (chatEntries.length === 0) {
          errors.push(`${rawName}: no .jsonl or .json chat files inside archive`);
        } else {
          for (const entry of chatEntries) {
            candidateFiles.push({
              fileName: entry.fileName,
              text: entry.buffer.toString('utf8'),
            });
          }
        }
      } catch (err) {
        errors.push(`${rawName}: ${err.message}`);
      }
    } else {
      candidateFiles.push({
        fileName: rawName,
        text: buf.toString('utf8'),
      });
    }
  }

  const imported = [];
  for (const candidate of candidateFiles) {
    try {
      const normalizedPayload = normalizeImportedChatPayload(
        candidate.text,
        fallbackCharName,
        fallbackUserName,
      );
      const targetName = buildSafeUniqueChatFileName(
        dirPath,
        candidate.fileName,
        fallbackCharName,
      );
      const targetPath = path.join(dirPath, targetName);
      await writeFileAtomic(targetPath, normalizedPayload, 'utf8');
      parsedChatCache.delete(targetPath);
      chatSummaryCache.delete(targetPath);
      imported.push(targetName);
    } catch (err) {
      errors.push(`${candidate.fileName}: ${err.message}`);
    }
  }

  if (imported.length === 0) {
    throw new Error(errors[0] || 'No valid .jsonl chat files could be imported');
  }

  invalidateCardStoreCaches();

  return {
    chatFolder,
    imported,
    count: imported.length,
    skippedCount: errors.length,
    errors,
  };
}

export function listChatBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs
    .readdirSync(BACKUPS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    .map((e) => {
      const full = path.join(BACKUPS_DIR, e.name);
      const st = fs.statSync(full);
      return {
        fileName: e.name,
        fileSize: st.size,
        lastModifiedMs: st.mtimeMs,
        lastModifiedIso: new Date(st.mtimeMs).toISOString(),
      };
    })
    .sort((a, b) => b.lastModifiedMs - a.lastModifiedMs);
}

/**
 * Updates `header.chat_metadata` inside a `.jsonl` chat file (e.g. `world_info`, `persona`).
 */
export async function patchChatMetadata(
  avatarOrFolder,
  fileName,
  metadataPatch = {},
  isGroup = false,
) {
  const { chatFolder, filePath } = resolveChatFilePath(
    avatarOrFolder,
    fileName,
    isGroup,
  );
  const parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    throw new Error('Chat file not found');
  }

  const nextChatMeta = {
    ...(parsed.header?.chat_metadata || {}),
    ...(metadataPatch || {}),
  };
  Object.keys(nextChatMeta).forEach((k) => {
    if (nextChatMeta[k] === null) delete nextChatMeta[k];
  });

  const nextHeader = {
    ...(parsed.header || {}),
    chat_metadata: nextChatMeta,
  };

  await writeParsedJsonlChat(filePath, nextHeader, parsed.messages);
  chatSummaryCache.delete(filePath);

  return {
    chatFolder,
    fileName,
    chatMetadata: nextChatMeta,
  };
}

/**
 * Replaces the active user persona across an existing `.jsonl` chat:
 * updates `header.user_name`, `header.chat_metadata.persona`, and every user message's
 * `name` + `force_avatar`, creating a safety backup beforehand.
 */
export async function replacePersonaInChat(
  avatarOrFolder,
  fileName,
  { personaAvatar, personaName, isGroup = false } = {},
) {
  const safePersonaAvatar = path.basename(String(personaAvatar || '').trim());
  if (!safePersonaAvatar) {
    throw new Error('Target personaAvatar is required');
  }

  const settings = readUserSettings();
  const personasMap = settings?.power_user?.personas || {};
  const resolvedPersonaName =
    String(personaName || '').trim() ||
    personasMap[safePersonaAvatar] ||
    safePersonaAvatar.replace(/\.(png|jpg|jpeg|webp)$/i, '') ||
    'User';

  const { chatFolder, filePath } = resolveChatFilePath(
    avatarOrFolder,
    fileName,
    isGroup,
  );
  const parsed = readParsedJsonlChat(filePath);
  if (!parsed) {
    throw new Error('Chat file not found');
  }

  ensureChatBackup(filePath, chatFolder, true);

  let updatedUserMessages = 0;
  for (const msg of parsed.messages) {
    if (msg && msg.is_user) {
      msg.name = resolvedPersonaName;
      msg.force_avatar = `User Avatars/${safePersonaAvatar}`;
      updatedUserMessages += 1;
    }
  }

  const nextChatMeta = {
    ...(parsed.header?.chat_metadata || {}),
  };
  if (updatedUserMessages > 0) {
    nextChatMeta.persona = safePersonaAvatar;
  } else {
    delete nextChatMeta.persona;
  }

  const nextHeader = {
    ...(parsed.header || {}),
    user_name: resolvedPersonaName,
    chat_metadata: nextChatMeta,
  };

  await writeParsedJsonlChat(filePath, nextHeader, parsed.messages);
  chatSummaryCache.delete(filePath);

  const windowData = getChatWindow(avatarOrFolder, {
    fileName,
    limit: 20,
    isGroup,
  });

  return {
    updatedUserMessages,
    ...windowData,
  };
}



