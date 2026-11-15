import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '../..');
export const DATA_ROOT_DIR = path.join(ROOT_DIR, 'data');
export const DEFAULT_USER_DIR = path.join(DATA_ROOT_DIR, 'default-user');
export const DIST_DIR = path.join(ROOT_DIR, 'dist');

/**
 * Canonical 25 directories required for 100% SillyTavern data/default-user compatibility.
 */
export const USER_SUBDIRECTORIES = [
  'assets',
  'backgrounds',
  'backups',
  'characters',
  'chats',
  'context',
  'extensions',
  'group chats',
  'groups',
  'instruct',
  'KoboldAI Settings',
  'movingUI',
  'NovelAI Settings',
  'NvSettings',
  'OpenAI Settings',
  'QuickReplies',
  'reasoning',
  'sysprompt',
  'TextGen Settings',
  'themes',
  'thumbnails',
  'user',
  'User Avatars',
  'vectors',
  'worlds',
];

/**
 * Private NexusTavern metadata namespace, kept deliberately outside
 * `USER_SUBDIRECTORIES` so the SillyTavern folder layout stays untouched.
 * Holds per-card data that has no native SillyTavern home (per-intro portraits,
 * scenario theme bindings) as `characters/<avatar>.json`.
 */
export const NEXUSTAVERN_DIR = path.join(DEFAULT_USER_DIR, '.nexustavern');
export const NEXUSTAVERN_CHARACTERS_DIR = path.join(NEXUSTAVERN_DIR, 'characters');
export const NEXUSTAVERN_PORTRAITS_DIR = path.join(NEXUSTAVERN_DIR, 'portraits');
export const NEXUSTAVERN_SESSION_FILE = path.join(NEXUSTAVERN_DIR, 'session.json');
export const NEXUSTAVERN_REFUSAL_FILE = path.join(NEXUSTAVERN_DIR, 'refusal-catcher.json');
export const NEXUSTAVERN_RECAP_FILE = path.join(NEXUSTAVERN_DIR, 'message-recap.json');
export const NEXUSTAVERN_ST_IMPORTER_FILE = path.join(NEXUSTAVERN_DIR, 'st-importer.json');
export const USER_IMAGES_DIR = path.join(DEFAULT_USER_DIR, 'user', 'images');
export const USER_FILES_DIR = path.join(DEFAULT_USER_DIR, 'user', 'files');

const DIR_ENSURE_TTL_MS = 15_000;
let lastEnsureDirsAt = 0;
let cachedEnsureDirsResult = null;

/**
 * In-memory cache of directory file counts keyed by `${targetDir}::${extKey}`.
 * Invalidated automatically whenever the directory's `mtimeMs` changes.
 */
const dirFileCountCache = new Map();

/**
 * Ensures all required user data folders exist on startup (with short TTL cache for status polling).
 */
export function ensureUserDirectories({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedEnsureDirsResult && now - lastEnsureDirsAt < DIR_ENSURE_TTL_MS) {
    return cachedEnsureDirsResult;
  }

  const results = [];
  for (const dirName of USER_SUBDIRECTORIES) {
    const fullPath = path.join(DEFAULT_USER_DIR, dirName);
    let exists = fs.existsSync(fullPath);
    if (!exists) {
      fs.mkdirSync(fullPath, { recursive: true });
      exists = fs.existsSync(fullPath);
    }
    results.push({
      name: dirName,
      exists,
    });
  }

  if (!fs.existsSync(NEXUSTAVERN_DIR)) {
    fs.mkdirSync(NEXUSTAVERN_DIR, { recursive: true });
  }
  if (!fs.existsSync(NEXUSTAVERN_CHARACTERS_DIR)) {
    fs.mkdirSync(NEXUSTAVERN_CHARACTERS_DIR, { recursive: true });
  }
  if (!fs.existsSync(NEXUSTAVERN_PORTRAITS_DIR)) {
    fs.mkdirSync(NEXUSTAVERN_PORTRAITS_DIR, { recursive: true });
  }
  if (!fs.existsSync(USER_IMAGES_DIR)) {
    fs.mkdirSync(USER_IMAGES_DIR, { recursive: true });
  }
  if (!fs.existsSync(USER_FILES_DIR)) {
    fs.mkdirSync(USER_FILES_DIR, { recursive: true });
  }

  lastEnsureDirsAt = now;
  cachedEnsureDirsResult = results;
  return results;
}

/**
 * Counts files matching given extensions in a default-user subdirectory.
 * Uses directory `mtimeMs` caching to avoid repeated `readdirSync` scans during idle status polling.
 */
export function countFilesInUserDir(subDir, extensions = null) {
  const targetDir = path.join(DEFAULT_USER_DIR, subDir);
  let stat;
  try {
    stat = fs.statSync(targetDir);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return 0;

  const normalizedExts =
    Array.isArray(extensions) && extensions.length > 0
      ? extensions.map((e) => String(e).toLowerCase())
      : null;
  const cacheKey = `${targetDir}::${normalizedExts ? normalizedExts.join(',') : '*'}`;
  const cached = dirFileCountCache.get(cacheKey);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.count;
  }

  try {
    const extSet = normalizedExts ? new Set(normalizedExts) : null;
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    let count = 0;
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (!entry.isFile() || entry.name === '.gitkeep') continue;
      if (!extSet) {
        count += 1;
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (extSet.has(ext)) count += 1;
      }
    }
    dirFileCountCache.set(cacheKey, { mtimeMs: stat.mtimeMs, count });
    return count;
  } catch {
    return 0;
  }
}
