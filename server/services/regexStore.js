import fs from 'node:fs';
import path from 'node:path';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import { DEFAULT_USER_DIR } from '../utils/paths.js';
import {
  readUserSettings,
  writeUserSettings,
  withUserSettingsLock,
  getFullCharacterCard,
  saveCharacterCard,
} from './cardStore.js';
import {
  getPresetByName,
  savePresetByName,
  getConnectionAndPresetSettings,
} from './presetStore.js';
import { readSession } from './sessionStore.js';
import { normalizeRegexScript } from '../../src/core/regex/regexEngine.js';

export const REGEX_META_FILE = path.join(DEFAULT_USER_DIR, '.nexustavern', 'regex-meta.json');

let metaWriteChain = Promise.resolve();

function withRegexMetaLock(task) {
  const run = metaWriteChain.then(task, task);
  metaWriteChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function readRegexMeta() {
  if (!fs.existsSync(REGEX_META_FILE)) {
    return { scopes: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(REGEX_META_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' && parsed.scopes
      ? parsed
      : { scopes: {} };
  } catch {
    return { scopes: {} };
  }
}

export async function writeRegexMeta(meta) {
  const dir = path.dirname(REGEX_META_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  await writeFileAtomic(REGEX_META_FILE, JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

function sanitizeScriptArray(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter((item) => item && typeof item === 'object')
    .map((item) => normalizeRegexScript(item));
}

export function readGlobalRegexFromSettings(settingsObj = null) {
  const settings = settingsObj || readUserSettings();
  const ext = settings?.extension_settings || {};
  const masterEnabled = ext.regex_enabled !== false;
  const globalScripts = sanitizeScriptArray(ext.regex);
  return { masterEnabled, globalScripts };
}

export function readCardRegexScripts(cardOrAvatar) {
  if (!cardOrAvatar) return [];
  const card =
    typeof cardOrAvatar === 'string'
      ? getFullCharacterCard(cardOrAvatar)
      : cardOrAvatar;
  if (!card) return [];
  return sanitizeScriptArray(card?.extensions?.regex_scripts);
}

export function readPresetRegexScripts(presetNameOrData) {
  if (!presetNameOrData) return [];
  if (typeof presetNameOrData === 'object') {
    const dataObj = presetNameOrData.data || presetNameOrData;
    return sanitizeScriptArray(dataObj?.extensions?.regex_scripts);
  }
  const presetDoc = getPresetByName('openai', presetNameOrData);
  return sanitizeScriptArray(presetDoc?.data?.extensions?.regex_scripts);
}

export function resolveActiveRegexScriptsServer({
  card = null,
  cardAvatar = '',
  oaiData = null,
  presetName = '',
  settings = null,
} = {}) {
  const resolvedSettings = settings || readUserSettings();
  const { masterEnabled, globalScripts } = readGlobalRegexFromSettings(resolvedSettings);
  if (!masterEnabled) return [];

  const resolvedCard = card || (cardAvatar ? getFullCharacterCard(cardAvatar) : null);
  const cardScripts = readCardRegexScripts(resolvedCard);

  let effectiveOaiData = oaiData;
  if (!effectiveOaiData) {
    const activeName =
      presetName || getConnectionAndPresetSettings()?.activePresets?.openai || 'Default';
    const sessionDraft = readSession()?.presetDraft;
    if (
      sessionDraft &&
      sessionDraft.category === 'openai' &&
      sessionDraft.presetName === activeName &&
      sessionDraft.data
    ) {
      effectiveOaiData = sessionDraft.data;
    } else {
      effectiveOaiData = getPresetByName('openai', activeName)?.data || {};
    }
  }
  const presetScripts = readPresetRegexScripts(effectiveOaiData);

  return [...globalScripts, ...presetScripts, ...cardScripts];
}

export function getRegexWorkspaceState({ cardAvatar = '', presetName = '' } = {}) {
  const settings = readUserSettings();
  const { masterEnabled, globalScripts } = readGlobalRegexFromSettings(settings);
  const effectivePresetName =
    presetName || getConnectionAndPresetSettings()?.activePresets?.openai || 'Default';

  const cardScripts = cardAvatar ? readCardRegexScripts(cardAvatar) : [];
  const presetScripts = effectivePresetName
    ? readPresetRegexScripts(effectivePresetName)
    : [];
  const meta = readRegexMeta();

  return {
    masterEnabled,
    activeCardAvatar: cardAvatar || '',
    activePresetName: effectivePresetName,
    globalScripts,
    cardScripts,
    presetScripts,
    foldersMeta: meta.scopes || {},
  };
}

export async function saveGlobalRegexScripts(scripts = [], { masterEnabled } = {}) {
  const normalized = sanitizeScriptArray(scripts);
  await withUserSettingsLock(async () => {
    const settings = readUserSettings();
    if (!settings.extension_settings || typeof settings.extension_settings !== 'object') {
      settings.extension_settings = {};
    }
    settings.extension_settings.regex = normalized;
    if (typeof masterEnabled === 'boolean') {
      settings.extension_settings.regex_enabled = masterEnabled;
    }
    await writeUserSettings(settings);
  });
  return normalized;
}

export async function setGlobalRegexMasterEnabled(masterEnabled) {
  const nextVal = Boolean(masterEnabled);
  await withUserSettingsLock(async () => {
    const settings = readUserSettings();
    if (!settings.extension_settings || typeof settings.extension_settings !== 'object') {
      settings.extension_settings = {};
    }
    settings.extension_settings.regex_enabled = nextVal;
    await writeUserSettings(settings);
  });
  return nextVal;
}

export async function saveCardRegexScripts(cardAvatar, scripts = []) {
  if (!cardAvatar) {
    throw new Error('Active scenario card is required to save card-scoped regex scripts');
  }
  const current = getFullCharacterCard(cardAvatar);
  if (!current) {
    throw new Error(`Character card not found: ${cardAvatar}`);
  }
  const normalized = sanitizeScriptArray(scripts);
  const updatedCard = await saveCharacterCard(cardAvatar, {
    extensions: {
      ...(current.extensions || {}),
      regex_scripts: normalized,
    },
  });
  return {
    scripts: normalized,
    card: updatedCard,
  };
}

export async function savePresetRegexScripts(presetName, scripts = []) {
  const targetName =
    presetName || getConnectionAndPresetSettings()?.activePresets?.openai || '';
  if (!targetName) {
    throw new Error('Active Chat Completion preset is required to save preset-scoped regex scripts');
  }
  const existing = getPresetByName('openai', targetName);
  const existingExt = existing?.data?.extensions || {};
  const normalized = sanitizeScriptArray(scripts);

  const savedPreset = await savePresetByName('openai', targetName, {
    data: {
      extensions: {
        ...existingExt,
        regex_scripts: normalized,
      },
    },
  });
  return {
    scripts: normalized,
    preset: savedPreset,
  };
}

export async function saveScopeFoldersMeta(scopeKey, { folders = [], assignments = {} } = {}) {
  const cleanKey = String(scopeKey || 'global').trim() || 'global';
  const cleanFolders = Array.isArray(folders)
    ? folders
        .filter((f) => f && typeof f === 'object' && f.id && f.name)
        .map((f) => ({
          id: String(f.id),
          name: String(f.name).trim(),
        }))
    : [];

  const validFolderIds = new Set(cleanFolders.map((f) => f.id));
  const cleanAssignments = {};
  if (assignments && typeof assignments === 'object') {
    for (const [scriptId, folderId] of Object.entries(assignments)) {
      if (scriptId && folderId && validFolderIds.has(String(folderId))) {
        cleanAssignments[String(scriptId)] = String(folderId);
      }
    }
  }

  return withRegexMetaLock(async () => {
    const meta = readRegexMeta();
    if (!meta.scopes || typeof meta.scopes !== 'object') {
      meta.scopes = {};
    }
    meta.scopes[cleanKey] = {
      folders: cleanFolders,
      assignments: cleanAssignments,
    };
    await writeRegexMeta(meta);
    return meta.scopes;
  });
}

