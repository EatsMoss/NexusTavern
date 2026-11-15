import fs from 'node:fs';
import path from 'node:path';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import { DEFAULT_USER_DIR } from '../utils/paths.js';
import { readUserSettings, writeUserSettings, withUserSettingsLock } from './cardStore.js';
import {
  sanitizePresetSecretsForClient,
  restorePresetSecretsBeforeWrite,
  sanitizeProxyProfilesForClient,
  restoreProxyProfilesBeforeWrite,
} from './secretsStore.js';

export const BACKUPS_DIR = path.join(DEFAULT_USER_DIR, 'backups');
export const NEXUSTAVERN_META_DIR = path.join(DEFAULT_USER_DIR, '.nexustavern');
export const PRESETS_META_FILE = path.join(NEXUSTAVERN_META_DIR, 'presets-meta.json');

/**
 * Canonical SillyTavern default system prompts & markers (`chatCompletionDefaultPrompts`).
 * Used for 100% compatibility, default name restoration ("Reset Name"), and marker resolution.
 */
export const ST_DEFAULT_SYSTEM_PROMPTS = [
  {
    identifier: 'main',
    name: 'Main Prompt',
    system_prompt: true,
    marker: false,
    role: 'system',
    content: "Write {{char}}'s next reply in a fictional chat between {{charIfNotGroup}} and {{user}}.",
  },
  {
    identifier: 'nsfw',
    name: 'Auxiliary Prompt',
    system_prompt: true,
    marker: false,
    role: 'system',
    content: '',
  },
  {
    identifier: 'dialogueExamples',
    name: 'Chat Examples',
    system_prompt: true,
    marker: true,
  },
  {
    identifier: 'jailbreak',
    name: 'Post-History Instructions',
    system_prompt: true,
    marker: false,
    role: 'system',
    content: '',
  },
  {
    identifier: 'chatHistory',
    name: 'Chat History',
    system_prompt: true,
    marker: true,
  },
  {
    identifier: 'worldInfoAfter',
    name: 'World Info (after)',
    system_prompt: true,
    marker: true,
  },
  {
    identifier: 'worldInfoBefore',
    name: 'World Info (before)',
    system_prompt: true,
    marker: true,
  },
  {
    identifier: 'enhanceDefinitions',
    name: 'Enhance Definitions',
    system_prompt: true,
    marker: false,
    role: 'system',
    content:
      "If you have more knowledge of {{char}}, add to the character's lore and personality to enhance them but keep the Character Sheet's definitions absolute.",
  },
  {
    identifier: 'charDescription',
    name: 'Char Description',
    system_prompt: true,
    marker: true,
  },
  {
    identifier: 'charPersonality',
    name: 'Char Personality',
    system_prompt: true,
    marker: true,
  },
  {
    identifier: 'scenario',
    name: 'Scenario',
    system_prompt: true,
    marker: true,
  },
  {
    identifier: 'personaDescription',
    name: 'Persona Description',
    system_prompt: true,
    marker: true,
  },
];

export const ST_DEFAULT_PROMPT_MAP = new Map(
  ST_DEFAULT_SYSTEM_PROMPTS.map((p) => [p.identifier, p]),
);

/**
 * Connection-specific keys inside an OpenAI / Chat Completion preset that are stripped
 * by default when exporting a preset without connection settings (BookboundUI standard).
 */
export const OAI_CONNECTION_SETTING_KEYS = [
  'chat_completion_source',
  'openai_model',
  'claude_model',
  'windowai_model',
  'openrouter_model',
  'openrouter_use_fallback',
  'openrouter_force_instruct',
  'openrouter_group_models',
  'openrouter_sort_models',
  'openrouter_providers',
  'openrouter_quantizations',
  'openrouter_allow_fallbacks',
  'openrouter_middleout',
  'ai21_model',
  'mistralai_model',
  'cohere_model',
  'perplexity_model',
  'groq_model',
  'chutes_model',
  'chutes_sort_models',
  'siliconflow_model',
  'electronhub_model',
  'electronhub_sort_models',
  'electronhub_group_models',
  'nanogpt_model',
  'deepseek_model',
  'aimlapi_model',
  'xai_model',
  'pollinations_model',
  'moonshot_model',
  'fireworks_model',
  'cometapi_model',
  'custom_model',
  'custom_url',
  'custom_include_body',
  'custom_exclude_body',
  'custom_include_headers',
  'custom_prompt_post_processing',
  'google_model',
  'vertexai_model',
  'zai_model',
  'zai_endpoint',
  'reverse_proxy',
  'show_external_models',
  'proxy_password',
  'vertexai_auth_mode',
  'vertexai_region',
  'vertexai_express_project_id',
  'bypass_status_check',
  'azure_base_url',
  'azure_deployment_name',
  'azure_api_version',
  'azure_openai_model',
];

/**
 * Canonical SillyTavern preset categories mapped to their `data/default-user/` folders.
 */
export const PRESET_CATEGORIES = {
  openai: {
    id: 'openai',
    label: 'Chat Completion (OpenAI / Claude / Gemini / OR)',
    folder: 'OpenAI Settings',
    extensions: ['.json', '.settings'],
  },
  textgen: {
    id: 'textgen',
    label: 'Text Completion (TextGen / Oobabooga / Tabby / Ollama)',
    folder: 'TextGen Settings',
    extensions: ['.json', '.settings'],
  },
  kobold: {
    id: 'kobold',
    label: 'KoboldAI / Horde Settings',
    folder: 'KoboldAI Settings',
    extensions: ['.json', '.settings'],
  },
  novel: {
    id: 'novel',
    label: 'NovelAI Settings',
    folder: 'NovelAI Settings',
    extensions: ['.json', '.settings'],
  },
  instruct: {
    id: 'instruct',
    label: 'Instruct Mode Templates',
    folder: 'instruct',
    extensions: ['.json'],
  },
  context: {
    id: 'context',
    label: 'Context Templates',
    folder: 'context',
    extensions: ['.json'],
  },
  sysprompt: {
    id: 'sysprompt',
    label: 'System Prompts',
    folder: 'sysprompt',
    extensions: ['.json'],
  },
  reasoning: {
    id: 'reasoning',
    label: 'Reasoning / Chain-of-Thought Formatting',
    folder: 'reasoning',
    extensions: ['.json'],
  },
};

/**
 * High-speed in-memory caches keyed by category / file path + mtimeMs.
 */
const categoryListCache = new Map();
const presetFileCache = new Map();

function resolveCategoryConfig(category) {
  const key = String(category || '').toLowerCase().trim();
  const cfg = PRESET_CATEGORIES[key];
  if (!cfg) {
    throw new Error(`Unsupported preset category: ${category}`);
  }
  return cfg;
}

function getCategoryDirPath(category) {
  const cfg = resolveCategoryConfig(category);
  const fullPath = path.join(DEFAULT_USER_DIR, cfg.folder);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
  return { cfg, fullPath };
}

function sanitizeFileName(rawName, defaultExt = '.json') {
  const base = path.basename(String(rawName || '').trim());
  if (!base || base === '.' || base === '..') {
    throw new Error('Invalid preset file name');
  }
  const ext = path.extname(base).toLowerCase();
  if (ext === '.json' || ext === '.settings') {
    return base;
  }
  return `${base}${defaultExt}`;
}

function resolvePresetFilePath(category, nameOrFile) {
  const { cfg, fullPath } = getCategoryDirPath(category);
  const raw = path.basename(String(nameOrFile || '').trim());
  if (!raw) {
    throw new Error('Missing preset name');
  }

  // Exact match first
  const exactPath = path.join(fullPath, raw);
  if (fs.existsSync(exactPath) && fs.statSync(exactPath).isFile()) {
    return exactPath;
  }

  // Try matching with allowed extensions (.json first, then .settings)
  const stripped = raw.replace(/\.(json|settings)$/i, '');
  for (const ext of cfg.extensions) {
    const candidate = path.join(fullPath, `${stripped}${ext}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  // Default to .json for new files
  return path.join(fullPath, `${stripped}.json`);
}

function backupPresetFileIfExists(filePath, category) {
  if (!fs.existsSync(filePath)) return null;
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const base = path.basename(filePath, path.extname(filePath)).replace(/[^a-zA-Z0-9_-]/g, '_');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `preset_${category}_${base}_${stamp}.json`;
    const backupPath = path.join(BACKUPS_DIR, backupName);
    fs.copyFileSync(filePath, backupPath);
    return backupName;
  } catch {
    return null;
  }
}

/**
 * Reads NexusTavern-specific preset organization metadata (folders, folder assignments, starred presets)
 * stored outside SillyTavern preset files in `data/default-user/.nexustavern/presets-meta.json`.
 */
function readPresetsMetaStore() {
  try {
    if (!fs.existsSync(PRESETS_META_FILE)) {
      return { categories: {} };
    }
    const raw = fs.readFileSync(PRESETS_META_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { categories: {} };
    if (!parsed.categories || typeof parsed.categories !== 'object') {
      parsed.categories = {};
    }
    return parsed;
  } catch {
    return { categories: {} };
  }
}

async function writePresetsMetaStore(store) {
  if (!fs.existsSync(NEXUSTAVERN_META_DIR)) {
    fs.mkdirSync(NEXUSTAVERN_META_DIR, { recursive: true });
  }
  await writeFileAtomic(PRESETS_META_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function normalizeCharacterBindingsMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [rawAvatar, rawPreset] of Object.entries(raw)) {
    const safeAvatar = path.basename(String(rawAvatar || '').trim());
    const cleanPreset = String(rawPreset || '').trim();
    if (safeAvatar && cleanPreset) {
      out[safeAvatar] = cleanPreset;
    }
  }
  return out;
}

function listBoundCharactersForPreset(characterBindings, presetName) {
  if (!characterBindings || !presetName) return [];
  const out = [];
  for (const [avatar, boundName] of Object.entries(characterBindings)) {
    if (boundName === presetName) {
      out.push(avatar);
    }
  }
  return out;
}

export function getCategoryPresetsMeta(category) {
  const cfg = resolveCategoryConfig(category);
  const store = readPresetsMetaStore();
  const catMeta = store.categories[cfg.id] || {};
  return {
    starred: Array.isArray(catMeta.starred) ? catMeta.starred : [],
    folders: Array.isArray(catMeta.folders) ? catMeta.folders : [],
    presetFolders:
      catMeta.presetFolders && typeof catMeta.presetFolders === 'object'
        ? { ...catMeta.presetFolders }
        : {},
    characterBindings: normalizeCharacterBindingsMap(catMeta.characterBindings),
  };
}

/**
 * Updates preset organization metadata for a category:
 * - `createFolder`: `{ name }`
 * - `renameFolder`: `{ folderId, name }`
 * - `deleteFolder`: `{ folderId }`
 * - `assignFolder`: `{ names: string[], folderId: string | null }`
 * - `toggleStar`: `string` (preset name)
 * - `starred`: `string[]`
 */
export async function updateCategoryPresetsMeta(category, patch = {}) {
  const cfg = resolveCategoryConfig(category);
  const store = readPresetsMetaStore();
  const current = getCategoryPresetsMeta(cfg.id);

  let starred = [...current.starred];
  let folders = [...current.folders];
  const presetFolders = { ...current.presetFolders };
  let characterBindings = { ...current.characterBindings };

  if (Array.isArray(patch.starred)) {
    starred = Array.from(new Set(patch.starred.map(String).filter(Boolean)));
  }

  if (typeof patch.toggleStar === 'string' && patch.toggleStar.trim()) {
    const target = patch.toggleStar.trim();
    if (starred.includes(target)) {
      starred = starred.filter((s) => s !== target);
    } else {
      starred.push(target);
    }
  }

  if (patch.createFolder && typeof patch.createFolder === 'object') {
    const folderName = String(patch.createFolder.name || '').trim();
    if (folderName) {
      const folderId =
        patch.createFolder.id ||
        `pfolder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      folders.push({
        id: folderId,
        name: folderName,
        createdAt: new Date().toISOString(),
      });
      if (Array.isArray(patch.createFolder.names)) {
        for (const n of patch.createFolder.names) {
          if (n) presetFolders[String(n)] = folderId;
        }
      }
    }
  }

  if (patch.renameFolder && typeof patch.renameFolder === 'object') {
    const { folderId, name } = patch.renameFolder;
    const cleanName = String(name || '').trim();
    if (folderId && cleanName) {
      folders = folders.map((f) => (f.id === folderId ? { ...f, name: cleanName } : f));
    }
  }

  if (patch.deleteFolder && typeof patch.deleteFolder === 'object') {
    const { folderId } = patch.deleteFolder;
    if (folderId) {
      folders = folders.filter((f) => f.id !== folderId);
      for (const [pName, fId] of Object.entries(presetFolders)) {
        if (fId === folderId) {
          delete presetFolders[pName];
        }
      }
    }
  }

  if (patch.assignFolder && typeof patch.assignFolder === 'object') {
    const names = Array.isArray(patch.assignFolder.names) ? patch.assignFolder.names : [];
    const folderId = patch.assignFolder.folderId || null;
    for (const rawName of names) {
      const key = String(rawName || '').trim();
      if (!key) continue;
      if (!folderId) {
        delete presetFolders[key];
      } else {
        presetFolders[key] = folderId;
      }
    }
  }

  if (patch.characterBindings && typeof patch.characterBindings === 'object') {
    characterBindings = normalizeCharacterBindingsMap(patch.characterBindings);
  }

  if (patch.bindCharacter && typeof patch.bindCharacter === 'object') {
    const safeAvatar = path.basename(String(patch.bindCharacter.avatar || '').trim());
    const cleanPreset =
      patch.bindCharacter.presetName === null || patch.bindCharacter.presetName === undefined
        ? ''
        : String(patch.bindCharacter.presetName).trim();
    if (safeAvatar) {
      if (!cleanPreset) {
        delete characterBindings[safeAvatar];
      } else {
        characterBindings[safeAvatar] = cleanPreset;
      }
    }
  }

  if (typeof patch.unbindPresetCharacters === 'string' && patch.unbindPresetCharacters.trim()) {
    const targetPreset = patch.unbindPresetCharacters.trim();
    for (const [av, boundPreset] of Object.entries(characterBindings)) {
      if (boundPreset === targetPreset) {
        delete characterBindings[av];
      }
    }
  }

  store.categories[cfg.id] = {
    starred,
    folders,
    presetFolders,
    characterBindings,
  };

  await writePresetsMetaStore(store);
  categoryListCache.delete(cfg.id);
  return getCategoryPresetsMeta(cfg.id);
}

/**
 * Copies character preset bindings when a character card is duplicated.
 */
export async function duplicateCharacterPresetBindings(srcAvatar, destAvatar) {
  const safeSrc = path.basename(String(srcAvatar || '').trim());
  const safeDest = path.basename(String(destAvatar || '').trim());
  if (!safeSrc || !safeDest || safeSrc === safeDest) return;

  const store = readPresetsMetaStore();
  let dirty = false;

  for (const catKey of Object.keys(store.categories || {})) {
    const catMeta = store.categories[catKey];
    if (!catMeta || typeof catMeta !== 'object') continue;
    const bindings = normalizeCharacterBindingsMap(catMeta.characterBindings);
    if (bindings[safeSrc]) {
      bindings[safeDest] = bindings[safeSrc];
      catMeta.characterBindings = bindings;
      categoryListCache.delete(catKey);
      dirty = true;
    }
  }

  if (dirty) {
    await writePresetsMetaStore(store);
  }
}

/**
 * Removes character preset bindings when one or more character cards are deleted.
 */
export async function removeCharacterPresetBindings(avatarFilenames = []) {
  if (!Array.isArray(avatarFilenames) || avatarFilenames.length === 0) return;
  const targets = new Set(
    avatarFilenames
      .map((raw) => path.basename(String(raw || '').trim()))
      .filter(Boolean),
  );
  if (targets.size === 0) return;

  const store = readPresetsMetaStore();
  let dirty = false;

  for (const catKey of Object.keys(store.categories || {})) {
    const catMeta = store.categories[catKey];
    if (!catMeta || typeof catMeta !== 'object' || !catMeta.characterBindings) continue;
    const bindings = normalizeCharacterBindingsMap(catMeta.characterBindings);
    let catDirty = false;
    for (const av of targets) {
      if (Object.prototype.hasOwnProperty.call(bindings, av)) {
        delete bindings[av];
        catDirty = true;
      }
    }
    if (catDirty) {
      catMeta.characterBindings = bindings;
      categoryListCache.delete(catKey);
      dirty = true;
    }
  }

  if (dirty) {
    await writePresetsMetaStore(store);
  }
}

/**
 * Extracts a concise summary for fast dropdown & list rendering without transferring full prompt arrays.
 */
function buildPresetSummary(category, fileName, stat, data, catMeta = null) {
  const name = fileName.replace(/\.(json|settings)$/i, '');
  const createdMs =
    stat.birthtimeMs && stat.birthtimeMs > 0
      ? stat.birthtimeMs
      : stat.ctimeMs || stat.mtimeMs;
  const summary = {
    name,
    fileName,
    category,
    ext: path.extname(fileName).toLowerCase(),
    fileSize: stat.size,
    createdAt: new Date(createdMs).toISOString(),
    createdAtMs: Math.round(createdMs),
    updatedAt: new Date(stat.mtimeMs).toISOString(),
    updatedAtMs: Math.round(stat.mtimeMs),
    folderId: catMeta?.presetFolders?.[name] || null,
    starred: Array.isArray(catMeta?.starred) ? catMeta.starred.includes(name) : false,
    boundCharacters: listBoundCharactersForPreset(catMeta?.characterBindings, name),
  };

  if (category === 'openai' && data && typeof data === 'object') {
    summary.source = data.chat_completion_source || 'openai';
    summary.temperature = data.temperature ?? 1;
    summary.maxContext = data.openai_max_context ?? 4095;
    summary.maxTokens = data.openai_max_tokens ?? 300;
    summary.promptsCount = Array.isArray(data.prompts) ? data.prompts.length : 0;
    summary.hasProxy = Boolean(data.reverse_proxy && String(data.reverse_proxy).trim());
    summary.hasProxyPassword = Boolean(
      data.proxy_password && String(data.proxy_password).trim(),
    );
  } else if (category === 'textgen' && data && typeof data === 'object') {
    summary.temperature = data.temp ?? data.temperature ?? 0.7;
    summary.topP = data.top_p ?? 0.9;
    summary.minP = data.min_p ?? 0;
    summary.repPen = data.rep_pen ?? 1.1;
  } else if (category === 'instruct' && data && typeof data === 'object') {
    summary.inputSequence = data.input_sequence || '';
    summary.outputSequence = data.output_sequence || '';
  } else if (category === 'reasoning' && data && typeof data === 'object') {
    summary.prefix = data.prefix || '';
    summary.suffix = data.suffix || '';
  }

  return summary;
}

function readRawPresetFromDisk(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  const cached = presetFileCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return { data: cached.data, stat };
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  presetFileCache.set(filePath, { mtimeMs: stat.mtimeMs, data });
  return { data, stat };
}

/**
 * Lists all presets in a given category (`openai`, `textgen`, `instruct`, `context`, `sysprompt`, `reasoning`, etc.).
 * Deduplicates `.json` and `.settings` with the same basename (preferring `.json`).
 */
export function listCategoryPresets(category) {
  const t0 = performance.now();
  const { cfg, fullPath } = getCategoryDirPath(category);
  const dirStat = fs.statSync(fullPath);
  const catMeta = getCategoryPresetsMeta(cfg.id);

  const cachedList = categoryListCache.get(cfg.id);
  if (cachedList && cachedList.dirMtimeMs === dirStat.mtimeMs) {
    const enriched = cachedList.items.map((item) => ({
      ...item,
      folderId: catMeta.presetFolders?.[item.name] || null,
      starred: catMeta.starred.includes(item.name),
      boundCharacters: listBoundCharactersForPreset(catMeta.characterBindings, item.name),
    }));
    return {
      category: cfg.id,
      label: cfg.label,
      folder: cfg.folder,
      total: enriched.length,
      elapsedMs: Number((performance.now() - t0).toFixed(2)),
      presets: enriched,
      meta: catMeta,
    };
  }

  const entries = fs.readdirSync(fullPath, { withFileTypes: true });
  const byBaseName = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || entry.name === '.gitkeep') continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!cfg.extensions.includes(ext)) continue;

    const baseName = entry.name.replace(/\.(json|settings)$/i, '');
    const existing = byBaseName.get(baseName);
    if (!existing || ext === '.json') {
      byBaseName.set(baseName, entry.name);
    }
  }

  const items = [];
  for (const fileName of byBaseName.values()) {
    const filePath = path.join(fullPath, fileName);
    try {
      const loaded = readRawPresetFromDisk(filePath);
      if (loaded) {
        items.push(buildPresetSummary(cfg.id, fileName, loaded.stat, loaded.data, catMeta));
      }
    } catch {
      // Skip malformed JSON files without crashing the directory listing
    }
  }

  items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  categoryListCache.set(cfg.id, { dirMtimeMs: dirStat.mtimeMs, items });

  return {
    category: cfg.id,
    label: cfg.label,
    folder: cfg.folder,
    total: items.length,
    elapsedMs: Number((performance.now() - t0).toFixed(2)),
    presets: items,
    meta: catMeta,
  };
}

/**
 * Converts a raw SillyTavern prompt entry into a normalized client prompt object
 * while preserving every ST Prompt Manager property (`injection_order`, `forbid_overrides`,
 * `injection_trigger`, `bb_icon`, `system_prompt`, `marker`, `defaultName`).
 */
const SERVER_OPEN_GROUP_RE = /^\s*[▼▽]\s*\[grp_[a-zA-Z0-9_-]+\]/;
const SERVER_CLOSE_GROUP_RE = /^\s*(?:\[\s*[▲△]\s*grp_[a-zA-Z0-9_-]+\s*\]|[▲△]\s*\[\s*grp_[a-zA-Z0-9_-]+\s*\])/;
const SERVER_TRIM_WS_BRAILLE_RE = /^[\s\u2800\u200B\uFEFF]+/u;
const SERVER_LEADING_EMOJI_RE =
  /^(?:[\u{1F1E6}-\u{1F1FF}]{2}|[0-9#*]\uFE0F?\u20E3|(?:(?![\u25BC\u25BD\u25B2\u25B3])(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u2600-\u27BF\u2139\u24C2]))(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u2600-\u27BF])(?:\uFE0F|\p{Emoji_Modifier})?)*)/u;

function splitServerPromptEmoji(rawName = '', rawIcon = '') {
  const str = String(rawName || '');
  if (SERVER_OPEN_GROUP_RE.test(str) || SERVER_CLOSE_GROUP_RE.test(str)) {
    return { name: str, bb_icon: typeof rawIcon === 'string' ? rawIcon : '' };
  }
  let cleaned = str.replace(SERVER_TRIM_WS_BRAILLE_RE, '');
  let extracted = '';
  const m = cleaned.match(SERVER_LEADING_EMOJI_RE);
  if (m && m[0]) {
    extracted = m[0];
    cleaned = cleaned.slice(m[0].length).replace(SERVER_TRIM_WS_BRAILLE_RE, '');
  }
  return {
    name: cleaned,
    bb_icon: extracted || (typeof rawIcon === 'string' ? rawIcon : ''),
  };
}

function normalizePromptDefinition(def, enabledOverride) {
  const defaultDef = ST_DEFAULT_PROMPT_MAP.get(def.identifier) || null;
  const isMarker =
    def.marker !== undefined ? Boolean(def.marker) : Boolean(defaultDef?.marker);
  const isSystemPrompt =
    def.system_prompt !== undefined
      ? Boolean(def.system_prompt)
      : Boolean(defaultDef?.system_prompt);

  const rawTitle = def.name || defaultDef?.name || def.identifier;
  const parsedTitle = splitServerPromptEmoji(rawTitle, def.bb_icon);

  return {
    identifier: def.identifier,
    name: parsedTitle.name || defaultDef?.name || def.identifier,
    defaultName: defaultDef?.name || null,
    role: def.role || defaultDef?.role || 'system',
    content: def.content ?? defaultDef?.content ?? '',
    marker: isMarker,
    system_prompt: isSystemPrompt,
    injection_position:
      def.injection_position !== undefined ? Number(def.injection_position) : 0,
    injection_depth:
      def.injection_depth !== undefined ? Number(def.injection_depth) : 4,
    injection_order:
      def.injection_order !== undefined ? Number(def.injection_order) : 100,
    forbid_overrides: Boolean(def.forbid_overrides ?? false),
    injection_trigger: Array.isArray(def.injection_trigger)
      ? def.injection_trigger.map(String)
      : [],
    bb_icon: parsedTitle.bb_icon,
    enabled:
      enabledOverride !== undefined
        ? Boolean(enabledOverride)
        : def.identifier === 'chatHistory'
          ? true
          : Boolean(def.enabled ?? true),
  };
}

/**
 * Normalizes SillyTavern Prompt Manager (`prompts` + `prompt_order`) into:
 * - `orderedPrompts`: active prompts present in `prompt_order` (in exact display order)
 * - `unlinkedPrompts`: prompts present in `prompts` (or default ST system prompts) that were
 *   removed/unlinked from `prompt_order` (available in the footer "Add prompt..." dropdown).
 */
function buildNormalizedPromptStructure(presetData) {
  if (!presetData || typeof presetData !== 'object') {
    return { orderedPrompts: [], unlinkedPrompts: [] };
  }

  const rawPrompts = Array.isArray(presetData.prompts) ? presetData.prompts : [];
  const promptById = new Map();

  for (const sysDef of ST_DEFAULT_SYSTEM_PROMPTS) {
    promptById.set(sysDef.identifier, { ...sysDef });
  }
  for (const p of rawPrompts) {
    if (p && p.identifier) {
      const base = promptById.get(p.identifier) || {};
      promptById.set(p.identifier, { ...base, ...p });
    }
  }

function resolveGlobalPromptOrderEntry(promptOrderList = []) {
  if (!Array.isArray(promptOrderList) || promptOrderList.length === 0) {
    return null;
  }
  const by100001 = promptOrderList.find((po) => String(po?.character_id) === '100001');
  if (by100001 && Array.isArray(by100001.order)) return by100001;

  const by100000 = promptOrderList.find((po) => String(po?.character_id) === '100000');
  if (by100000 && Array.isArray(by100000.order)) return by100000;

  // Fallback for custom presets without 100001/100000: pick the slot with the most entries
  let best = null;
  for (const po of promptOrderList) {
    if (po && Array.isArray(po.order)) {
      if (!best || po.order.length > best.order.length) {
        best = po;
      }
    }
  }
  return best;
}

  const globalEntry = resolveGlobalPromptOrderEntry(presetData.prompt_order);
  const orderList = Array.isArray(globalEntry?.order) ? globalEntry.order : [];

  const seenInOrder = new Set();
  const orderedPrompts = [];
  const unlinkedPrompts = [];

  if (orderList.length > 0) {
    for (const item of orderList) {
      if (!item || !item.identifier || seenInOrder.has(item.identifier)) continue;
      const def = promptById.get(item.identifier);
      if (!def) continue;
      seenInOrder.add(item.identifier);
      const isEnabled =
        item.identifier === 'chatHistory'
          ? true
          : item.enabled !== undefined
            ? Boolean(item.enabled)
            : Boolean(def.enabled ?? true);
      orderedPrompts.push(normalizePromptDefinition(def, isEnabled));
    }

    const unlinkedSeen = new Set();
    for (const def of rawPrompts) {
      if (!def || !def.identifier || seenInOrder.has(def.identifier) || unlinkedSeen.has(def.identifier)) {
        continue;
      }
      unlinkedSeen.add(def.identifier);
      unlinkedPrompts.push(normalizePromptDefinition(def, false));
    }
    for (const sysDef of ST_DEFAULT_SYSTEM_PROMPTS) {
      if (seenInOrder.has(sysDef.identifier) || unlinkedSeen.has(sysDef.identifier)) {
        continue;
      }
      unlinkedSeen.add(sysDef.identifier);
      unlinkedPrompts.push(normalizePromptDefinition(sysDef, false));
    }
  } else {
    for (const def of rawPrompts) {
      if (!def || !def.identifier || seenInOrder.has(def.identifier)) continue;
      seenInOrder.add(def.identifier);
      orderedPrompts.push(
        normalizePromptDefinition(
          def,
          def.identifier === 'chatHistory' ? true : Boolean(def.enabled ?? true),
        ),
      );
    }
  }

  return { orderedPrompts, unlinkedPrompts };
}

/**
 * Reads a single preset by category and name, applying Zero-Trust secret sanitization.
 */
export function getPresetByName(category, nameOrFile) {
  const t0 = performance.now();
  const cfg = resolveCategoryConfig(category);
  const filePath = resolvePresetFilePath(cfg.id, nameOrFile);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const loaded = readRawPresetFromDisk(filePath);
  if (!loaded) return null;

  const fileName = path.basename(filePath);
  const name = fileName.replace(/\.(json|settings)$/i, '');
  const sanitizedData =
    cfg.id === 'openai'
      ? sanitizePresetSecretsForClient(loaded.data)
      : { ...loaded.data };

  const result = {
    category: cfg.id,
    name,
    fileName,
    fileSize: loaded.stat.size,
    updatedAt: new Date(loaded.stat.mtimeMs).toISOString(),
    elapsedMs: Number((performance.now() - t0).toFixed(2)),
    data: sanitizedData,
  };

  if (cfg.id === 'openai') {
    const { orderedPrompts, unlinkedPrompts } = buildNormalizedPromptStructure(loaded.data);
    result.orderedPrompts = orderedPrompts;
    result.unlinkedPrompts = unlinkedPrompts;
  }

  return result;
}

/**
 * Helper to serialize a normalized client prompt back into a SillyTavern `prompts[]` definition.
 */
function serializePromptToSTFormat(item, orig = {}) {
  const defaultDef = ST_DEFAULT_PROMPT_MAP.get(item.identifier) || null;
  const isMarker =
    item.marker !== undefined
      ? Boolean(item.marker)
      : orig.marker !== undefined
        ? Boolean(orig.marker)
        : Boolean(defaultDef?.marker);
  const isSystemPrompt =
    item.system_prompt !== undefined
      ? Boolean(item.system_prompt)
      : orig.system_prompt !== undefined
        ? Boolean(orig.system_prompt)
        : Boolean(defaultDef?.system_prompt);

  const updatedDef = {
    ...orig,
    identifier: item.identifier,
    name: item.name ?? orig.name ?? defaultDef?.name ?? item.identifier,
    system_prompt: isSystemPrompt,
    marker: isMarker,
  };

  delete updatedDef.defaultName;

  if (!isMarker) {
    updatedDef.role = item.role || orig.role || defaultDef?.role || 'system';
    updatedDef.content =
      item.content !== undefined
        ? String(item.content)
        : orig.content ?? defaultDef?.content ?? '';
    updatedDef.injection_position =
      item.injection_position !== undefined
        ? Number(item.injection_position)
        : orig.injection_position ?? 0;
    updatedDef.injection_depth =
      item.injection_depth !== undefined
        ? Number(item.injection_depth)
        : orig.injection_depth ?? 4;
    if (item.injection_order !== undefined || orig.injection_order !== undefined) {
      updatedDef.injection_order = Number(
        item.injection_order ?? orig.injection_order ?? 100,
      );
    }
    if (item.forbid_overrides !== undefined || orig.forbid_overrides !== undefined) {
      updatedDef.forbid_overrides = Boolean(
        item.forbid_overrides ?? orig.forbid_overrides ?? false,
      );
    }
    if (Array.isArray(item.injection_trigger) && item.injection_trigger.length > 0) {
      updatedDef.injection_trigger = item.injection_trigger.map(String);
    } else if (Array.isArray(item.injection_trigger) && item.injection_trigger.length === 0) {
      delete updatedDef.injection_trigger;
    }
    updatedDef.enabled = Boolean(item.enabled);
  } else {
    if (item.injection_position !== undefined) {
      updatedDef.injection_position = Number(item.injection_position);
    }
    if (item.injection_depth !== undefined) {
      updatedDef.injection_depth = Number(item.injection_depth);
    }
  }

  if (typeof item.bb_icon === 'string') {
    if (item.bb_icon.trim()) {
      updatedDef.bb_icon = item.bb_icon.trim();
    } else {
      delete updatedDef.bb_icon;
    }
  }

  return updatedDef;
}

/**
 * Applies normalized `orderedPrompts` and optional `unlinkedPrompts` arrays back into
 * SillyTavern's `prompts` and `prompt_order` structure so 100% compatibility with
 * SillyTavern Prompt Manager is preserved on disk.
 */
function applyOrderedPromptsToPresetData(targetData, orderedPrompts, unlinkedPrompts) {
  if (!Array.isArray(orderedPrompts)) return targetData;

  const existingPrompts = Array.isArray(targetData.prompts) ? targetData.prompts : [];
  const existingMap = new Map();
  for (const p of existingPrompts) {
    if (p && p.identifier) {
      existingMap.set(p.identifier, p);
    }
  }

  const nextPrompts = [];
  const nextOrderEntries = [];
  const includedIds = new Set();

  for (const item of orderedPrompts) {
    if (!item || !item.identifier || includedIds.has(item.identifier)) continue;
    includedIds.add(item.identifier);
    const orig = existingMap.get(item.identifier) || {};
    const isEnabled =
      item.identifier === 'chatHistory' ? true : Boolean(item.enabled);
    nextPrompts.push(serializePromptToSTFormat({ ...item, enabled: isEnabled }, orig));
    nextOrderEntries.push({
      identifier: item.identifier,
      enabled: isEnabled,
    });
  }

  if (Array.isArray(unlinkedPrompts)) {
    for (const item of unlinkedPrompts) {
      if (!item || !item.identifier || includedIds.has(item.identifier)) continue;
      includedIds.add(item.identifier);
      const orig = existingMap.get(item.identifier) || {};
      nextPrompts.push(serializePromptToSTFormat({ ...item, enabled: false }, orig));
    }
  } else {
    for (const orig of existingPrompts) {
      if (!orig || !orig.identifier || includedIds.has(orig.identifier)) continue;
      includedIds.add(orig.identifier);
      nextPrompts.push(orig);
    }
  }

  targetData.prompts = nextPrompts;

  if (Array.isArray(targetData.prompt_order) && targetData.prompt_order.length > 0) {
    let has100001 = false;
    targetData.prompt_order = targetData.prompt_order.map((po) => {
      const cid = String(po?.character_id);
      if (cid === '100001') {
        has100001 = true;
        return { ...po, order: nextOrderEntries };
      }
      if (cid === '100000') {
        return { ...po, order: nextOrderEntries };
      }
      return po;
    });
    if (!has100001) {
      targetData.prompt_order.push({
        character_id: 100001,
        order: nextOrderEntries,
      });
    }
  } else {
    targetData.prompt_order = [
      {
        character_id: 100001,
        order: nextOrderEntries,
      },
    ];
  }

  return targetData;
}

/**
 * Saves or updates a preset in the given category (`data/default-user/<CategoryFolder>/<name>.json`).
 * Preserves untouched `proxy_password` on disk and creates a timestamped backup in `backups/`.
 */
export async function savePresetByName(category, nameOrFile, payload = {}) {
  const t0 = performance.now();
  const cfg = resolveCategoryConfig(category);
  const filePath = resolvePresetFilePath(cfg.id, sanitizeFileName(nameOrFile, '.json'));

  let existingData = {};
  if (fs.existsSync(filePath)) {
    try {
      const loaded = readRawPresetFromDisk(filePath);
      if (loaded && loaded.data) {
        existingData = loaded.data;
      }
    } catch {
      existingData = {};
    }
  }

  const incomingData =
    payload.data && typeof payload.data === 'object' ? payload.data : payload;
  let merged = {
    ...existingData,
    ...incomingData,
  };
  delete merged.orderedPrompts;
  delete merged.unlinkedPrompts;

  if (cfg.id === 'openai') {
    merged = restorePresetSecretsBeforeWrite(merged, existingData);
    if (Array.isArray(payload.orderedPrompts)) {
      merged = applyOrderedPromptsToPresetData(
        merged,
        payload.orderedPrompts,
        Array.isArray(payload.unlinkedPrompts) ? payload.unlinkedPrompts : undefined,
      );
    }
  }

  const backupFile = backupPresetFileIfExists(filePath, cfg.id);
  await writeFileAtomic(filePath, JSON.stringify(merged, null, 2), 'utf8');

  presetFileCache.delete(filePath);
  categoryListCache.delete(cfg.id);

  const saved = getPresetByName(cfg.id, path.basename(filePath));
  return {
    ...saved,
    backupFile,
    elapsedMs: Number((performance.now() - t0).toFixed(2)),
  };
}

export async function renamePresetByName(category, oldNameOrFile, newNameRaw) {
  const cfg = resolveCategoryConfig(category);
  const oldPath = resolvePresetFilePath(cfg.id, oldNameOrFile);
  if (!fs.existsSync(oldPath)) {
    throw new Error(`Preset "${oldNameOrFile}" not found`);
  }

  const cleanNewFile = sanitizeFileName(newNameRaw, '.json');
  const newBaseName = cleanNewFile.replace(/\.(json|settings)$/i, '').trim();
  if (!newBaseName) {
    throw new Error('New preset name cannot be empty');
  }

  const { fullPath } = getCategoryDirPath(cfg.id);
  const newPath = path.join(fullPath, `${newBaseName}.json`);

  if (path.resolve(oldPath) !== path.resolve(newPath) && fs.existsSync(newPath)) {
    throw new Error(`A preset named "${newBaseName}" already exists`);
  }

  const backupFile = backupPresetFileIfExists(oldPath, cfg.id);
  const loaded = readRawPresetFromDisk(oldPath);
  const dataToWrite = loaded?.data || {};

  if (['instruct', 'context', 'sysprompt', 'reasoning'].includes(cfg.id) && typeof dataToWrite === 'object') {
    dataToWrite.name = newBaseName;
  }

  await writeFileAtomic(newPath, JSON.stringify(dataToWrite, null, 2), 'utf8');
  if (path.resolve(oldPath) !== path.resolve(newPath)) {
    fs.unlinkSync(oldPath);
  }

  presetFileCache.delete(oldPath);
  presetFileCache.delete(newPath);
  categoryListCache.delete(cfg.id);

  const oldBaseName = path.basename(oldPath).replace(/\.(json|settings)$/i, '');
  if (oldBaseName !== newBaseName) {
    const store = readPresetsMetaStore();
    const catMeta = store.categories?.[cfg.id];
    if (catMeta && typeof catMeta === 'object') {
      let metaDirty = false;
      if (Array.isArray(catMeta.starred) && catMeta.starred.includes(oldBaseName)) {
        catMeta.starred = Array.from(
          new Set(catMeta.starred.map((s) => (s === oldBaseName ? newBaseName : s))),
        );
        metaDirty = true;
      }
      if (catMeta.presetFolders && catMeta.presetFolders[oldBaseName]) {
        catMeta.presetFolders[newBaseName] = catMeta.presetFolders[oldBaseName];
        delete catMeta.presetFolders[oldBaseName];
        metaDirty = true;
      }
      if (catMeta.characterBindings && typeof catMeta.characterBindings === 'object') {
        const bindings = normalizeCharacterBindingsMap(catMeta.characterBindings);
        for (const [av, boundName] of Object.entries(bindings)) {
          if (boundName === oldBaseName) {
            bindings[av] = newBaseName;
            metaDirty = true;
          }
        }
        catMeta.characterBindings = bindings;
      }
      if (metaDirty) {
        await writePresetsMetaStore(store);
      }
    }
  }

  const currentSettings = getConnectionAndPresetSettings();
  if (currentSettings.activePresets?.[cfg.id] === oldBaseName) {
    await updateConnectionAndPresetSettings({
      activePresets: { [cfg.id]: newBaseName },
    });
  }

  return {
    renamed: true,
    oldName: oldBaseName,
    newName: newBaseName,
    backupFile,
    preset: getPresetByName(cfg.id, newBaseName),
  };
}

export async function duplicatePresetByName(category, sourceNameOrFile, targetNameRaw) {
  const cfg = resolveCategoryConfig(category);
  const sourcePath = resolvePresetFilePath(cfg.id, sourceNameOrFile);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source preset "${sourceNameOrFile}" not found`);
  }

  const loaded = readRawPresetFromDisk(sourcePath);
  if (!loaded || !loaded.data) {
    throw new Error(`Failed to read source preset "${sourceNameOrFile}"`);
  }

  const sourceBase = path.basename(sourcePath).replace(/\.(json|settings)$/i, '');
  const { fullPath } = getCategoryDirPath(cfg.id);

  let targetBase = String(targetNameRaw || '').replace(/\.(json|settings)$/i, '').trim();
  if (!targetBase) {
    let idx = 1;
    targetBase = `${sourceBase} (Copy)`;
    while (fs.existsSync(path.join(fullPath, `${targetBase}.json`))) {
      idx += 1;
      targetBase = `${sourceBase} (Copy ${idx})`;
    }
  }

  const targetPath = path.join(fullPath, `${targetBase}.json`);
  const clonedData = structuredClone(loaded.data);
  if (['instruct', 'context', 'sysprompt', 'reasoning'].includes(cfg.id) && typeof clonedData === 'object') {
    clonedData.name = targetBase;
  }

  await writeFileAtomic(targetPath, JSON.stringify(clonedData, null, 2), 'utf8');
  presetFileCache.delete(targetPath);
  categoryListCache.delete(cfg.id);

  return {
    duplicated: true,
    sourceName: sourceBase,
    newName: targetBase,
    preset: getPresetByName(cfg.id, targetBase),
  };
}

export function exportPresetByName(category, nameOrFile, options = {}) {
  const cfg = resolveCategoryConfig(category);
  const filePath = resolvePresetFilePath(cfg.id, nameOrFile);
  if (!fs.existsSync(filePath)) return null;

  const loaded = readRawPresetFromDisk(filePath);
  if (!loaded || !loaded.data) return null;

  const name = path.basename(filePath).replace(/\.(json|settings)$/i, '');
  const includeConnection = Boolean(options.includeConnection);
  const exportedData = structuredClone(loaded.data);
  delete exportedData.orderedPrompts;
  delete exportedData.unlinkedPrompts;

  if (cfg.id === 'openai' && !includeConnection) {
    for (const key of OAI_CONNECTION_SETTING_KEYS) {
      delete exportedData[key];
    }
  }

  return {
    category: cfg.id,
    name,
    fileName: `${name}.json`,
    includeConnection,
    data: exportedData,
  };
}

export async function importPresetsToCategory(category, items = []) {
  const cfg = resolveCategoryConfig(category);
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('No preset items provided for import');
  }

  const imported = [];
  for (const entry of items) {
    if (!entry || typeof entry !== 'object') continue;
    const rawName = String(entry.name || entry.fileName || entry.data?.name || 'Imported Preset')
      .replace(/\.(json|settings)$/i, '')
      .trim();
    const safeName = rawName || `Imported_${Date.now()}`;
    let payloadData = entry.data && typeof entry.data === 'object' ? { ...entry.data } : { ...entry };

    if (
      cfg.id === 'openai' &&
      payloadData.version !== undefined &&
      payloadData.data &&
      Array.isArray(payloadData.data.prompts)
    ) {
      const pmData = payloadData.data;
      payloadData = {
        temperature: 1,
        top_p: 1,
        openai_max_context: 16384,
        openai_max_tokens: 1000,
        prompts: pmData.prompts,
        prompt_order: Array.isArray(pmData.prompt_order)
          ? pmData.prompt_order
          : pmData.prompt_order && typeof pmData.prompt_order === 'object'
            ? [pmData.prompt_order]
            : [{ character_id: 100001, order: [] }],
      };
    }

    const saved = await savePresetByName(cfg.id, safeName, { data: payloadData });
    imported.push(saved);
  }

  return {
    category: cfg.id,
    importedCount: imported.length,
    imported,
    presets: listCategoryPresets(cfg.id).presets,
  };
}

/**
 * Deletes a preset file after creating a safety backup in `backups/`.
 */
export function deletePresetByName(category, nameOrFile) {
  const cfg = resolveCategoryConfig(category);
  const filePath = resolvePresetFilePath(cfg.id, nameOrFile);
  if (!fs.existsSync(filePath)) {
    return { deleted: false };
  }
  const baseName = path.basename(filePath).replace(/\.(json|settings)$/i, '');
  const backupFile = backupPresetFileIfExists(filePath, cfg.id);
  fs.unlinkSync(filePath);
  presetFileCache.delete(filePath);
  categoryListCache.delete(cfg.id);

  // Clean up folder/star/character-binding references in presets-meta.json if present
  try {
    const store = readPresetsMetaStore();
    const catMeta = store.categories?.[cfg.id];
    if (catMeta) {
      if (Array.isArray(catMeta.starred)) {
        catMeta.starred = catMeta.starred.filter((s) => s !== baseName);
      }
      if (catMeta.presetFolders && catMeta.presetFolders[baseName]) {
        delete catMeta.presetFolders[baseName];
      }
      if (catMeta.characterBindings && typeof catMeta.characterBindings === 'object') {
        for (const [av, boundName] of Object.entries(catMeta.characterBindings)) {
          if (boundName === baseName) {
            delete catMeta.characterBindings[av];
          }
        }
      }
      fs.writeFileSync(PRESETS_META_FILE, JSON.stringify(store, null, 2), 'utf8');
    }
  } catch {
    // ignore meta cleanup errors
  }

  return {
    deleted: true,
    name: baseName,
    fileName: path.basename(filePath),
    backupFile,
  };
}

/**
 * Bulk deletes multiple preset files in a category, backing up each file to `backups/`.
 */
export async function bulkDeletePresetsByName(category, names = []) {
  const cfg = resolveCategoryConfig(category);
  if (!Array.isArray(names) || names.length === 0) {
    return { deletedCount: 0, deletedNames: [] };
  }

  const deletedNames = [];
  const backups = [];
  for (const rawName of names) {
    if (!rawName) continue;
    try {
      const res = deletePresetByName(cfg.id, rawName);
      if (res.deleted) {
        deletedNames.push(res.name);
        if (res.backupFile) backups.push(res.backupFile);
      }
    } catch {
      // skip missing
    }
  }

  const listing = listCategoryPresets(cfg.id);
  return {
    category: cfg.id,
    deletedCount: deletedNames.length,
    deletedNames,
    backups,
    presets: listing.presets,
    meta: listing.meta,
  };
}

/**
 * Reads active preset bindings and connection settings from `settings.json` with Zero-Trust sanitization.
 */
export function getConnectionAndPresetSettings() {
  const settings = readUserSettings();
  const oai = settings.oai_settings || {};
  const tg = settings.textgenerationwebui_settings || {};
  const kai = settings.kai_settings || {};
  const nai = settings.nai_settings || {};
  const pu = settings.power_user || {};

  const openaiListing = listCategoryPresets('openai');
  const textgenListing = listCategoryPresets('textgen');
  const instructListing = listCategoryPresets('instruct');
  const contextListing = listCategoryPresets('context');
  const syspromptListing = listCategoryPresets('sysprompt');
  const reasoningListing = listCategoryPresets('reasoning');

  const openaiList = openaiListing.presets;
  const textgenList = textgenListing.presets;
  const instructList = instructListing.presets;
  const contextList = contextListing.presets;
  const syspromptList = syspromptListing.presets;
  const reasoningList = reasoningListing.presets;

  const activePresets = {
    openai:
      oai.preset_settings_openai ||
      settings.preset_settings_openai ||
      openaiList.find((p) => p.name === 'Default')?.name ||
      openaiList[0]?.name ||
      'Default',
    textgen:
      tg.preset_settings_textgenerationwebui ||
      settings.preset_settings_textgenerationwebui ||
      textgenList.find((p) => p.name === 'Default')?.name ||
      textgenList[0]?.name ||
      'Default',
    kobold: kai.preset_settings_kobold || settings.preset_settings_kobold || 'Default',
    novel: nai.preset_settings_novel || settings.preset_settings_novel || 'Default',
    instruct:
      pu.instruct?.preset ||
      instructList.find((p) => p.name === 'Alpaca')?.name ||
      instructList[0]?.name ||
      '',
    context:
      pu.context?.preset ||
      contextList.find((p) => p.name === 'Default')?.name ||
      contextList[0]?.name ||
      '',
    sysprompt: pu.sysprompt?.name || syspromptList[0]?.name || '',
    reasoning:
      pu.reasoning?.name ||
      reasoningList.find((p) => p.name === 'DeepSeek')?.name ||
      reasoningList[0]?.name ||
      '',
  };

  return {
    mainApi: settings.main_api || 'openai',
    activePresets,
    connection: {
      chatCompletionSource: oai.chat_completion_source || 'openai',
      openaiModel: oai.openai_model || 'gpt-4o',
      claudeModel: oai.claude_model || 'claude-3-7-sonnet-20250219',
      googleModel: oai.google_model || 'gemini-2.5-pro',
      openrouterModel: oai.openrouter_model || 'anthropic/claude-3.7-sonnet',
      deepseekModel: oai.deepseek_model || 'deepseek-chat',
      groqModel: oai.groq_model || 'llama-3.3-70b-versatile',
      mistralaiModel: oai.mistralai_model || 'mistral-large-latest',
      xaiModel: oai.xai_model || 'grok-2-latest',
      customModel: oai.custom_model || '',
      customUrl: oai.custom_url || '',
      reverseProxy: oai.reverse_proxy || '',
      hasProxyPassword: Boolean(oai.proxy_password && String(oai.proxy_password).trim()),
      selectedProxy: settings.selected_proxy || '',
      proxies: sanitizeProxyProfilesForClient(settings.proxies || []),
      connectionProfiles:
        settings.extension_settings?.connectionManager?.profiles || [],
      selectedConnectionProfile:
        settings.extension_settings?.connectionManager?.selectedProfile || '',
    },
    counts: {
      openai: openaiList.length,
      textgen: textgenList.length,
      instruct: instructList.length,
      context: contextList.length,
      sysprompt: syspromptList.length,
      reasoning: reasoningList.length,
    },
    presetMeta: {
      openai: openaiListing.meta,
      textgen: textgenListing.meta,
      instruct: instructListing.meta,
      context: contextListing.meta,
      sysprompt: syspromptListing.meta,
      reasoning: reasoningListing.meta,
    },
  };
}


/**
 * Updates active preset selections and connection parameters in `settings.json`.
 */
export async function updateConnectionAndPresetSettings(patch = {}) {
  return withUserSettingsLock(async () => {
    const settings = readUserSettings();
    if (!settings.oai_settings) settings.oai_settings = {};
    if (!settings.textgenerationwebui_settings) settings.textgenerationwebui_settings = {};
    if (!settings.power_user) settings.power_user = {};

    if (patch.mainApi) {
      settings.main_api = String(patch.mainApi);
    }

    if (patch.activePresets && typeof patch.activePresets === 'object') {
      const ap = patch.activePresets;
      if (ap.openai !== undefined) {
        settings.oai_settings.preset_settings_openai = String(ap.openai);
      }
      if (ap.textgen !== undefined) {
        settings.textgenerationwebui_settings.preset_settings_textgenerationwebui = String(ap.textgen);
      }
      if (ap.instruct !== undefined) {
        if (!settings.power_user.instruct) settings.power_user.instruct = {};
        settings.power_user.instruct.preset = String(ap.instruct);
      }
      if (ap.context !== undefined) {
        if (!settings.power_user.context) settings.power_user.context = {};
        settings.power_user.context.preset = String(ap.context);
      }
      if (ap.sysprompt !== undefined) {
        if (!settings.power_user.sysprompt) settings.power_user.sysprompt = {};
        settings.power_user.sysprompt.name = String(ap.sysprompt);
      }
      if (ap.reasoning !== undefined) {
        if (!settings.power_user.reasoning) settings.power_user.reasoning = {};
        settings.power_user.reasoning.name = String(ap.reasoning);
      }
    }

    if (patch.connection && typeof patch.connection === 'object') {
      const c = patch.connection;
      const oai = settings.oai_settings;
      if (c.chatCompletionSource !== undefined) oai.chat_completion_source = String(c.chatCompletionSource);
      if (c.openaiModel !== undefined) oai.openai_model = String(c.openaiModel);
      if (c.claudeModel !== undefined) oai.claude_model = String(c.claudeModel);
      if (c.googleModel !== undefined) oai.google_model = String(c.googleModel);
      if (c.openrouterModel !== undefined) oai.openrouter_model = String(c.openrouterModel);
      if (c.deepseekModel !== undefined) oai.deepseek_model = String(c.deepseekModel);
      if (c.groqModel !== undefined) oai.groq_model = String(c.groqModel);
      if (c.mistralaiModel !== undefined) oai.mistralai_model = String(c.mistralaiModel);
      if (c.xaiModel !== undefined) oai.xai_model = String(c.xaiModel);
      if (c.customModel !== undefined) oai.custom_model = String(c.customModel);
      if (c.customUrl !== undefined) oai.custom_url = String(c.customUrl);
      if (c.reverseProxy !== undefined) oai.reverse_proxy = String(c.reverseProxy);
      if (c.proxyPassword !== undefined && c.proxyPassword !== '__NEXUSTAVERN_MASKED_SECRET__') {
        oai.proxy_password = String(c.proxyPassword);
      }
      if (c.selectedProxy !== undefined) {
        settings.selected_proxy = String(c.selectedProxy);
      }
      if (Array.isArray(c.proxies)) {
        settings.proxies = restoreProxyProfilesBeforeWrite(c.proxies, settings.proxies || []);
      }
    }

    await writeUserSettings(settings);
    return getConnectionAndPresetSettings();
  });
}

