import fs from 'node:fs';
import path from 'node:path';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import { NEXUSTAVERN_REFUSAL_FILE } from '../utils/paths.js';
import {
  REFUSAL_CONFIG_SCHEMA_VERSION,
  ADDED_V2_DEFAULT_PHRASES,
  normalizeRefusalConfig,
  normalizeForRefusalMatch,
  sanitizeBannedPhrases,
} from '../../src/core/refusal/refusalEngine.js';

let writeChain = Promise.resolve();

function withRefusalLock(task) {
  const run = writeChain.then(task, task);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Reads the persisted Refusal Catcher configuration from
 * `data/default-user/.nexustavern/refusal-catcher.json`, falling back to defaults.
 */
export function readRefusalCatcherConfig() {
  if (!fs.existsSync(NEXUSTAVERN_REFUSAL_FILE)) {
    return normalizeRefusalConfig(null);
  }
  try {
    const raw = JSON.parse(fs.readFileSync(NEXUSTAVERN_REFUSAL_FILE, 'utf8'));
    const normalized = normalizeRefusalConfig(raw);
    const savedVer = Number(raw?.schemaVersion) || 1;
    if (savedVer < REFUSAL_CONFIG_SCHEMA_VERSION) {
      const mergedPhrases = sanitizeBannedPhrases([
        ...normalized.bannedPhrases,
        ...ADDED_V2_DEFAULT_PHRASES,
      ]);
      const upgraded = {
        ...normalized,
        schemaVersion: REFUSAL_CONFIG_SCHEMA_VERSION,
        bannedPhrases: mergedPhrases,
      };
      writeRefusalCatcherConfigRaw(upgraded).catch(() => {});
      return upgraded;
    }
    return normalized;
  } catch {
    return normalizeRefusalConfig(null);
  }
}

async function writeRefusalCatcherConfigRaw(config) {
  const dir = path.dirname(NEXUSTAVERN_REFUSAL_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const normalized = normalizeRefusalConfig(config);
  await writeFileAtomic(
    NEXUSTAVERN_REFUSAL_FILE,
    JSON.stringify(normalized, null, 2),
    'utf8',
  );
  return normalized;
}

/**
 * Atomically patches Refusal Catcher configuration (`enabled`, `delayMs`, `headWindowChars`, `bannedPhrases`).
 */
export async function saveRefusalCatcherConfig(patch = {}) {
  return withRefusalLock(async () => {
    const current = readRefusalCatcherConfig();
    const merged = {
      ...current,
      ...(typeof patch.enabled === 'boolean' ? { enabled: patch.enabled } : {}),
      ...(patch.delayMs !== undefined ? { delayMs: patch.delayMs } : {}),
      ...(patch.headWindowChars !== undefined
        ? { headWindowChars: patch.headWindowChars }
        : {}),
      ...(Array.isArray(patch.bannedPhrases)
        ? { bannedPhrases: sanitizeBannedPhrases(patch.bannedPhrases) }
        : {}),
      ...(typeof patch.fallbackEnabled === 'boolean'
        ? { fallbackEnabled: patch.fallbackEnabled }
        : {}),
      ...(typeof patch.fallbackConnectionId === 'string'
        ? { fallbackConnectionId: patch.fallbackConnectionId }
        : {}),
      ...(typeof patch.fallbackModelId === 'string'
        ? { fallbackModelId: patch.fallbackModelId }
        : {}),
    };
    return writeRefusalCatcherConfigRaw(merged);
  });
}

/**
 * Appends a single banned phrase (ignoring case-insensitive duplicates).
 */
export async function appendRefusalPhrase(phrase = '') {
  const clean = String(phrase || '').replace(/\s+/g, ' ').trim();
  if (!clean) {
    throw new Error('Banned phrase cannot be empty');
  }
  return withRefusalLock(async () => {
    const current = readRefusalCatcherConfig();
    const targetKey = normalizeForRefusalMatch(clean);
    const exists = current.bannedPhrases.some(
      (item) => normalizeForRefusalMatch(item) === targetKey,
    );
    const nextList = exists
      ? current.bannedPhrases
      : [clean, ...current.bannedPhrases];
    const saved = await writeRefusalCatcherConfigRaw({
      ...current,
      bannedPhrases: nextList,
    });
    return { config: saved, added: !exists };
  });
}

/**
 * Removes a banned phrase by case-insensitive normalized match.
 */
export async function deleteRefusalPhrase(phrase = '') {
  const targetKey = normalizeForRefusalMatch(phrase);
  if (!targetKey) {
    throw new Error('Phrase to remove is required');
  }
  return withRefusalLock(async () => {
    const current = readRefusalCatcherConfig();
    const nextList = current.bannedPhrases.filter(
      (item) => normalizeForRefusalMatch(item) !== targetKey,
    );
    const saved = await writeRefusalCatcherConfigRaw({
      ...current,
      bannedPhrases: nextList,
    });
    return {
      config: saved,
      removed: nextList.length !== current.bannedPhrases.length,
    };
  });
}
