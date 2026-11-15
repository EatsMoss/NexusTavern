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
  readUserSettings,
  invalidateCardStoreCaches,
} from './cardStore.js';
import { buildZipBuffer, extractZipEntries } from '../utils/zipBuilder.js';
import {
  resolveCharacterChatDir,
  formatSillyTavernSendDate,
  formatSillyTavernChatFilename,
  invalidateChatFileCache,
  getAttachmentExt,
  classifyServerAttachment,
  normalizeStAssetClientUrl,
} from './chatJsonlCodec.js';

export const BACKUPS_DIR = path.join(DEFAULT_USER_DIR, 'backups');

/**
 * Tracks last backup timestamp per chat file path to avoid spamming disk on every keystroke.
 */
const lastBackupTimeMap = new Map();
const BACKUP_THROTTLE_MS = 60 * 1000;
const MAX_BACKUPS_PER_PREFIX = 10;

export function clearChatBackupTimestamp(filePath) {
  if (!filePath) return;
  lastBackupTimeMap.delete(filePath);
}

export function clearAllChatBackupTimestamps() {
  lastBackupTimeMap.clear();
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

function sanitizeUploadFilename(rawName = 'attachment') {
  const base = path.basename(String(rawName || 'attachment').replace(/\\/g, '/')).trim();
  const safe = base.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/^\.+/, '');
  return safe || 'attachment';
}

export function parseBase64Payload(dataUrlOrBase64 = '') {
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
  const cleanFolder =
    String(chatFolder || 'default').replace(/[<>:"/\\|?*]/g, '_').trim() || 'default';
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

export function buildSillyTavernAttachmentExtra(attachments = []) {
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

export function normalizeImportedChatPayload(
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
      invalidateChatFileCache(targetPath);
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



