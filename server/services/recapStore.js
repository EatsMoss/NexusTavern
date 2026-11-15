import fs from 'node:fs';
import path from 'node:path';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import { NEXUSTAVERN_RECAP_FILE } from '../utils/paths.js';
import {
  normalizeRecapConfig,
  createDefaultRecapConfig,
} from '../../src/core/recap/recapEngine.js';

let writeChain = Promise.resolve();

function withRecapLock(task) {
  const run = writeChain.then(task, task);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Reads persisted Message Recap configuration from
 * `data/default-user/.nexustavern/message-recap.json`, falling back to defaults.
 */
export function readMessageRecapConfig() {
  if (!fs.existsSync(NEXUSTAVERN_RECAP_FILE)) {
    return normalizeRecapConfig(null);
  }
  try {
    const raw = JSON.parse(fs.readFileSync(NEXUSTAVERN_RECAP_FILE, 'utf8'));
    return normalizeRecapConfig(raw);
  } catch {
    return normalizeRecapConfig(null);
  }
}

async function writeMessageRecapConfigRaw(config) {
  const dir = path.dirname(NEXUSTAVERN_RECAP_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const normalized = normalizeRecapConfig(config);
  await writeFileAtomic(
    NEXUSTAVERN_RECAP_FILE,
    JSON.stringify(normalized, null, 2),
    'utf8',
  );
  return normalized;
}

/**
 * Atomically patches Message Recap configuration fields.
 */
export async function saveMessageRecapConfig(patch = {}) {
  return withRecapLock(async () => {
    const current = readMessageRecapConfig();
    const src = patch && typeof patch === 'object' ? patch : {};
    const merged = normalizeRecapConfig({
      ...current,
      ...(typeof src.enabled === 'boolean' ? { enabled: src.enabled } : {}),
      ...(typeof src.openingEnabled === 'boolean'
        ? { openingEnabled: src.openingEnabled }
        : {}),
      ...(src.openingRole !== undefined ? { openingRole: src.openingRole } : {}),
      ...(src.openingPosition !== undefined
        ? { openingPosition: src.openingPosition }
        : {}),
      ...(src.openingDepth !== undefined ? { openingDepth: src.openingDepth } : {}),
      ...(typeof src.openingPrompt === 'string'
        ? { openingPrompt: src.openingPrompt }
        : {}),
      ...(typeof src.closingEnabled === 'boolean'
        ? { closingEnabled: src.closingEnabled }
        : {}),
      ...(src.closingRole !== undefined ? { closingRole: src.closingRole } : {}),
      ...(src.closingPosition !== undefined
        ? { closingPosition: src.closingPosition }
        : {}),
      ...(src.closingDepth !== undefined ? { closingDepth: src.closingDepth } : {}),
      ...(typeof src.closingPrompt === 'string'
        ? { closingPrompt: src.closingPrompt }
        : {}),
      ...(typeof src.stripEnabled === 'boolean'
        ? { stripEnabled: src.stripEnabled }
        : {}),
      ...(src.keepFullDepth !== undefined ? { keepFullDepth: src.keepFullDepth } : {}),
      ...(typeof src.stripFindRegex === 'string'
        ? { stripFindRegex: src.stripFindRegex }
        : {}),
    });
    return writeMessageRecapConfigRaw(merged);
  });
}

/**
 * Resets Message Recap prompts, depth, and strip regex to factory defaults.
 */
export async function resetMessageRecapConfig({ enabled } = {}) {
  return withRecapLock(async () => {
    const current = readMessageRecapConfig();
    const keepEnabled = typeof enabled === 'boolean' ? enabled : current.enabled;
    const defaults = createDefaultRecapConfig({ enabled: keepEnabled });
    return writeMessageRecapConfigRaw(defaults);
  });
}
