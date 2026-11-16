import fs from 'node:fs';
import path from 'node:path';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import {
  NEXUSTAVERN_CUSTOMIZATION_FILE,
  NEXUSTAVERN_THEMES_DIR,
  NEXUSTAVERN_FONTS_DIR,
  ensureUserDirectories,
} from '../utils/paths.js';
import { readUserSettings, writeUserSettings } from './cardStore.js';
import {
  DEFAULT_CUSTOMIZATION_CONFIG,
  normalizeCustomizationConfig,
  normalizeThemePreset,
} from '../../src/core/customization/customizationDefaults.js';

let writeChain = Promise.resolve();

function withLock(fn) {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => {});
  return next;
}

function sanitizeFileSlug(raw, fallback = 'preset') {
  const slug = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || fallback;
}

/**
 * Overlays SillyTavern-compatible `settings.json -> power_user` fields onto the
 * NexusTavern customization object when `customization.json` is first created.
 */
function hydrateSharedFieldsFromStSettings(baseCfg) {
  try {
    const st = readUserSettings();
    const pu = st?.power_user || {};
    const nextAi = { ...baseCfg.chatAndAi };

    if (typeof pu.prefer_character_prompt === 'boolean') {
      nextAi.preferCharacterPrompt = pu.prefer_character_prompt;
    }
    if (typeof pu.prefer_character_jailbreak === 'boolean') {
      nextAi.preferCharacterJailbreak = pu.prefer_character_jailbreak;
    }
    if (['normal', 'keep', 'strip'].includes(pu.example_messages_behavior)) {
      nextAi.exampleMessagesBehavior = pu.example_messages_behavior;
    }
    if (typeof pu.auto_fix_generated_markdown === 'boolean') {
      nextAi.autoFixMarkdown = pu.auto_fix_generated_markdown;
    }
    if (typeof pu.trim_spaces === 'boolean') {
      nextAi.trimSpaces = pu.trim_spaces;
    }
    if (typeof pu.collapse_newlines === 'boolean') {
      nextAi.collapseNewlines = pu.collapse_newlines;
    }

    return normalizeCustomizationConfig({ ...baseCfg, chatAndAi: nextAi });
  } catch {
    return baseCfg;
  }
}

async function mirrorSharedFieldsToStSettings(cfg) {
  try {
    const st = readUserSettings();
    if (!st.power_user || typeof st.power_user !== 'object') {
      st.power_user = {};
    }
    const ai = cfg.chatAndAi;
    st.power_user.prefer_character_prompt = ai.preferCharacterPrompt;
    st.power_user.prefer_character_jailbreak = ai.preferCharacterJailbreak;
    st.power_user.example_messages_behavior = ai.exampleMessagesBehavior;
    st.power_user.auto_fix_generated_markdown = ai.autoFixMarkdown;
    st.power_user.trim_spaces = ai.trimSpaces;
    st.power_user.collapse_newlines = ai.collapseNewlines;
    await writeUserSettings(st);
  } catch {
    // Non-fatal if settings.json is temporarily locked
  }
}

export function readCustomizationConfig() {
  ensureUserDirectories();
  if (!fs.existsSync(NEXUSTAVERN_CUSTOMIZATION_FILE)) {
    return hydrateSharedFieldsFromStSettings(DEFAULT_CUSTOMIZATION_CONFIG);
  }
  try {
    const raw = JSON.parse(fs.readFileSync(NEXUSTAVERN_CUSTOMIZATION_FILE, 'utf8'));
    return normalizeCustomizationConfig(raw);
  } catch {
    return normalizeCustomizationConfig(DEFAULT_CUSTOMIZATION_CONFIG);
  }
}

export async function writeCustomizationConfig(rawNext) {
  return withLock(async () => {
    ensureUserDirectories();
    const normalized = normalizeCustomizationConfig(rawNext);
    await writeFileAtomic(
      NEXUSTAVERN_CUSTOMIZATION_FILE,
      JSON.stringify(normalized, null, 2),
      'utf8',
    );
    await mirrorSharedFieldsToStSettings(normalized);
    return normalized;
  });
}

export function listCustomThemePresets() {
  ensureUserDirectories();
  if (!fs.existsSync(NEXUSTAVERN_THEMES_DIR)) return [];
  const out = [];
  const entries = fs.readdirSync(NEXUSTAVERN_THEMES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(NEXUSTAVERN_THEMES_DIR, entry.name), 'utf8'),
      );
      const norm = normalizeThemePreset({ ...raw, builtin: false });
      if (norm && !norm.builtin) out.push(norm);
    } catch {
      // Skip malformed preset file
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function upsertCustomThemePreset(rawPreset) {
  return withLock(async () => {
    ensureUserDirectories();
    const norm = normalizeThemePreset({ ...(rawPreset || {}), builtin: false });
    if (!norm || norm.builtin) {
      throw new Error('Cannot overwrite a built-in theme preset; save as a new preset instead.');
    }
    const safeId = sanitizeFileSlug(norm.id, `custom-${Date.now()}`);
    const finalPreset = { ...norm, id: safeId, builtin: false };
    const filePath = path.join(NEXUSTAVERN_THEMES_DIR, `${safeId}.json`);
    await writeFileAtomic(filePath, JSON.stringify(finalPreset, null, 2), 'utf8');
    return finalPreset;
  });
}

export async function removeCustomThemePreset(presetId) {
  return withLock(async () => {
    ensureUserDirectories();
    const safeId = sanitizeFileSlug(presetId, '');
    if (!safeId) throw new Error('Invalid preset identifier.');
    const filePath = path.join(NEXUSTAVERN_THEMES_DIR, `${safeId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  });
}

const ALLOWED_FONT_EXTS = new Set(['.woff2', '.woff', '.ttf', '.otf']);

export async function saveUploadedFont({ fileName, dataUrl, family }) {
  return withLock(async () => {
    ensureUserDirectories();
    const rawExt = path.extname(String(fileName || '')).toLowerCase();
    const ext = ALLOWED_FONT_EXTS.has(rawExt) ? rawExt : '.woff2';
    const match = /^data:[^;]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || '').trim());
    if (!match) {
      throw new Error('Invalid font payload; expected base64 data URL.');
    }
    const buf = Buffer.from(match[1], 'base64');
    if (buf.length < 32 || buf.length > 18 * 1024 * 1024) {
      throw new Error('Font file size must be between 32 bytes and 18 MB.');
    }

    const baseStem = path.basename(String(fileName || 'custom-font'), rawExt);
    const cleanFamily = String(family || baseStem)
      .replace(/["'`]/g, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'Custom Font';

    const id = `font-${sanitizeFileSlug(cleanFamily, 'custom')}-${Date.now().toString(36)}`;
    const storedFileName = `${id}${ext}`;
    const fullPath = path.join(NEXUSTAVERN_FONTS_DIR, storedFileName);
    fs.writeFileSync(fullPath, buf);

    return {
      id,
      family: cleanFamily,
      fileUrl: `/user-data/.nexustavern/fonts/${encodeURIComponent(storedFileName)}`,
    };
  });
}

export async function removeUploadedFont(fontId) {
  return withLock(async () => {
    ensureUserDirectories();
    const safePrefix = sanitizeFileSlug(fontId, '');
    if (!safePrefix) return false;
    const entries = fs.readdirSync(NEXUSTAVERN_FONTS_DIR, { withFileTypes: true });
    let removed = false;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const stem = path.basename(entry.name, path.extname(entry.name));
      if (stem === safePrefix) {
        fs.unlinkSync(path.join(NEXUSTAVERN_FONTS_DIR, entry.name));
        removed = true;
      }
    }
    return removed;
  });
}

