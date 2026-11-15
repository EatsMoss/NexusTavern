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

/**
 * Ensures all required user data folders exist on startup.
 */
export function ensureUserDirectories() {
  const results = [];
  for (const dirName of USER_SUBDIRECTORIES) {
    const fullPath = path.join(DEFAULT_USER_DIR, dirName);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    results.push({
      name: dirName,
      exists: fs.existsSync(fullPath),
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

  return results;
}

/**
 * Counts files matching given extensions in a default-user subdirectory.
 */
export function countFilesInUserDir(subDir, extensions = null) {
  const targetDir = path.join(DEFAULT_USER_DIR, subDir);
  if (!fs.existsSync(targetDir)) return 0;

  try {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    return entries.filter((entry) => {
      if (!entry.isFile()) return false;
      if (entry.name === '.gitkeep') return false;
      if (!extensions || extensions.length === 0) return true;
      const ext = path.extname(entry.name).toLowerCase();
      return extensions.includes(ext);
    }).length;
  } catch {
    return 0;
  }
}
