import fs from 'node:fs';
import path from 'node:path';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import {
  NEXUSTAVERN_CHARACTERS_DIR,
  NEXUSTAVERN_PORTRAITS_DIR,
} from '../utils/paths.js';

/**
 * Manages NexusTavern-specific per-scenario metadata outside SillyTavern's native structures:
 *   `data/default-user/.nexustavern/characters/<avatar>.json`
 *   `data/default-user/.nexustavern/portraits/<char_slug>/*`
 */

function toMetaFilename(avatarFilename) {
  const safeBase = path.basename(String(avatarFilename || '').trim());
  if (!safeBase) return null;
  return `${safeBase}.json`;
}

function toPortraitSlug(avatarFilename) {
  const safeBase = path
    .basename(String(avatarFilename || '').trim())
    .replace(/\.(png|json)$/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return safeBase || 'scenario';
}

export function createDefaultScenarioMeta(avatarFilename) {
  return {
    version: 1,
    avatar: path.basename(String(avatarFilename || '')),
    subtitle: '',
    themePresetId: null,
    activePortraitId: null,
    spoilerBlur: false,
    externalMediaAllowed: true,
    sourceUrl: '',
    introsMeta: [],
    groupIntrosMeta: [],
    avatarGallery: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeIntrosMetaList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => ({
    title: typeof item?.title === 'string' ? item.title : '',
    portraitUrl:
      typeof item?.portraitUrl === 'string' && item.portraitUrl
        ? item.portraitUrl
        : null,
  }));
}

export function normalizeScenarioMeta(raw, avatarFilename) {
  const base = createDefaultScenarioMeta(avatarFilename);
  if (!raw || typeof raw !== 'object') return base;

  const introsMeta = normalizeIntrosMetaList(raw.introsMeta);
  const groupIntrosMeta = normalizeIntrosMetaList(raw.groupIntrosMeta);

  const avatarGallery = Array.isArray(raw.avatarGallery)
    ? raw.avatarGallery
        .filter((g) => g && typeof g === 'object' && g.url)
        .map((g, idx) => ({
          id: String(g.id || `p-${idx}`),
          fileName: String(g.fileName || ''),
          url: String(g.url),
          label: String(g.label || ''),
          isOriginal: Boolean(g.isOriginal),
          addedAt: Number(g.addedAt || Date.now()),
        }))
    : [];

  const rawActiveId =
    typeof raw.activePortraitId === 'string' && raw.activePortraitId.trim()
      ? raw.activePortraitId.trim()
      : null;
  const activePortraitId =
    rawActiveId && avatarGallery.some((g) => g.id === rawActiveId)
      ? rawActiveId
      : null;

  return {
    version: 1,
    avatar: base.avatar,
    subtitle:
      typeof raw.subtitle === 'string'
        ? raw.subtitle.trim().slice(0, 120)
        : '',
    themePresetId:
      typeof raw.themePresetId === 'string' && raw.themePresetId.trim()
        ? raw.themePresetId.trim()
        : null,
    activePortraitId,
    spoilerBlur: Boolean(raw.spoilerBlur),
    externalMediaAllowed:
      raw.externalMediaAllowed !== undefined
        ? Boolean(raw.externalMediaAllowed)
        : true,
    sourceUrl: typeof raw.sourceUrl === 'string' ? raw.sourceUrl.trim() : '',
    introsMeta,
    groupIntrosMeta,
    avatarGallery,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
  };
}

export function readScenarioMeta(avatarFilename) {
  const metaFile = toMetaFilename(avatarFilename);
  if (!metaFile) return createDefaultScenarioMeta(avatarFilename);

  const fullPath = path.join(NEXUSTAVERN_CHARACTERS_DIR, metaFile);
  if (!fs.existsSync(fullPath)) {
    return createDefaultScenarioMeta(avatarFilename);
  }

  try {
    const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    return normalizeScenarioMeta(raw, avatarFilename);
  } catch {
    return createDefaultScenarioMeta(avatarFilename);
  }
}

export async function saveScenarioMeta(avatarFilename, patch = {}) {
  const metaFile = toMetaFilename(avatarFilename);
  if (!metaFile) {
    throw new Error('Invalid character avatar filename for scenario metadata');
  }

  fs.mkdirSync(NEXUSTAVERN_CHARACTERS_DIR, { recursive: true });
  const current = readScenarioMeta(avatarFilename);
  const merged = normalizeScenarioMeta(
    {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    },
    avatarFilename,
  );

  const fullPath = path.join(NEXUSTAVERN_CHARACTERS_DIR, metaFile);
  await writeFileAtomic(fullPath, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}


/**
 * Uploads an image into the scenario's portrait gallery (`data/default-user/.nexustavern/portraits/<slug>/`)
 * and appends it to `avatarGallery` inside `.nexustavern/characters/<avatar>.json`.
 */
export async function addScenarioGalleryPortrait(
  avatarFilename,
  { imageBase64, fileName = 'portrait.png', label = '' } = {},
) {
  if (!imageBase64) {
    throw new Error('imageBase64 is required to add a scenario portrait');
  }

  const slug = toPortraitSlug(avatarFilename);
  const portraitDir = path.join(NEXUSTAVERN_PORTRAITS_DIR, slug);
  fs.mkdirSync(portraitDir, { recursive: true });

  const extMatch = String(fileName).match(/\.(png|jpg|jpeg|webp|gif)$/i);
  const ext = extMatch ? extMatch[0].toLowerCase() : '.png';
  const cleanStem =
    path
      .basename(String(fileName || 'portrait'), extMatch ? extMatch[0] : '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40) || 'portrait';

  const uniqueFile = `${cleanStem}_${Date.now()}${ext}`;
  const fullPath = path.join(portraitDir, uniqueFile);

  const cleanBase64 = String(imageBase64).replace(/^data:[^,]+,/, '');
  const buf = Buffer.from(cleanBase64, 'base64');
  await writeFileAtomic(fullPath, buf);

  const publicUrl = `/user-data/.nexustavern/portraits/${encodeURIComponent(slug)}/${encodeURIComponent(uniqueFile)}`;
  const meta = readScenarioMeta(avatarFilename);
  const entry = {
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    fileName: uniqueFile,
    url: publicUrl,
    label: String(label || cleanStem),
    addedAt: Date.now(),
  };

  const nextGallery = [...meta.avatarGallery, entry];
  const updated = await saveScenarioMeta(avatarFilename, {
    avatarGallery: nextGallery,
  });

  return { entry, scenarioMeta: updated };
}

/**
 * Removes a portrait from the scenario's portrait gallery and deletes its file on disk.
 */
export async function removeScenarioGalleryPortrait(avatarFilename, portraitId) {
  const meta = readScenarioMeta(avatarFilename);
  const target = meta.avatarGallery.find((item) => item.id === portraitId);
  if (!target) return meta;

  const slug = toPortraitSlug(avatarFilename);
  if (target.fileName) {
    const filePath = path.join(
      NEXUSTAVERN_PORTRAITS_DIR,
      slug,
      path.basename(target.fileName),
    );
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  }

  const nextGallery = meta.avatarGallery.filter((item) => item.id !== portraitId);
  const nextIntrosMeta = meta.introsMeta.map((intro) =>
    intro.portraitUrl === target.url ? { ...intro, portraitUrl: null } : intro,
  );
  const nextGroupIntrosMeta = (meta.groupIntrosMeta || []).map((intro) =>
    intro.portraitUrl === target.url ? { ...intro, portraitUrl: null } : intro,
  );
  const nextActiveId =
    meta.activePortraitId === portraitId
      ? nextGallery[0]?.id || null
      : meta.activePortraitId;

  return saveScenarioMeta(avatarFilename, {
    avatarGallery: nextGallery,
    introsMeta: nextIntrosMeta,
    groupIntrosMeta: nextGroupIntrosMeta,
    activePortraitId: nextActiveId,
  });
}

/**
 * Ensures the card's original PNG buffer is backed up into `avatarGallery` before
 * replacing the main portrait or adding alternate portraits, so the original art is never lost.
 */
export async function ensureOriginalPortraitInGallery(avatarFilename, originalPngBuffer) {
  const meta = readScenarioMeta(avatarFilename);
  if (meta.avatarGallery.length > 0 || !originalPngBuffer) {
    return meta;
  }

  const slug = toPortraitSlug(avatarFilename);
  const portraitDir = path.join(NEXUSTAVERN_PORTRAITS_DIR, slug);
  fs.mkdirSync(portraitDir, { recursive: true });

  const uniqueFile = `original_${Date.now()}.png`;
  const fullPath = path.join(portraitDir, uniqueFile);
  await writeFileAtomic(fullPath, originalPngBuffer);

  const publicUrl = `/user-data/.nexustavern/portraits/${encodeURIComponent(slug)}/${encodeURIComponent(uniqueFile)}`;
  const entry = {
    id: `p_orig_${Date.now()}`,
    fileName: uniqueFile,
    url: publicUrl,
    label: 'Original',
    isOriginal: true,
    addedAt: Date.now(),
  };

  return saveScenarioMeta(avatarFilename, {
    avatarGallery: [entry],
    activePortraitId: entry.id,
  });
}

/**
 * Reads the binary buffer of a stored gallery portrait by `portraitId`.
 */
export function readScenarioGalleryPortraitBuffer(avatarFilename, portraitId) {
  const meta = readScenarioMeta(avatarFilename);
  const target = meta.avatarGallery.find((item) => item.id === portraitId);
  if (!target || !target.fileName) return null;

  const slug = toPortraitSlug(avatarFilename);
  const filePath = path.join(
    NEXUSTAVERN_PORTRAITS_DIR,
    slug,
    path.basename(target.fileName),
  );
  if (!fs.existsSync(filePath)) return null;
  return {
    entry: target,
    buffer: fs.readFileSync(filePath),
  };
}

/**
 * Copies `.nexustavern/characters/<src>.json` and its portraits folder when a card is duplicated.
 */
export async function duplicateScenarioMeta(srcAvatar, destAvatar) {
  const srcMetaFile = toMetaFilename(srcAvatar);
  if (!srcMetaFile) return null;
  const srcMetaPath = path.join(NEXUSTAVERN_CHARACTERS_DIR, srcMetaFile);
  if (!fs.existsSync(srcMetaPath)) return null;

  const meta = readScenarioMeta(srcAvatar);
  const srcSlug = toPortraitSlug(srcAvatar);
  const destSlug = toPortraitSlug(destAvatar);
  const srcPortraitDir = path.join(NEXUSTAVERN_PORTRAITS_DIR, srcSlug);
  const destPortraitDir = path.join(NEXUSTAVERN_PORTRAITS_DIR, destSlug);

  if (fs.existsSync(srcPortraitDir) && srcSlug !== destSlug) {
    fs.mkdirSync(destPortraitDir, { recursive: true });
    for (const entry of fs.readdirSync(srcPortraitDir, { withFileTypes: true })) {
      if (entry.isFile()) {
        fs.copyFileSync(
          path.join(srcPortraitDir, entry.name),
          path.join(destPortraitDir, entry.name),
        );
      }
    }
  }

  const rewriteUrl = (url) => {
    if (!url || typeof url !== 'string') return url;
    return url.replace(
      `/portraits/${encodeURIComponent(srcSlug)}/`,
      `/portraits/${encodeURIComponent(destSlug)}/`,
    );
  };

  return saveScenarioMeta(destAvatar, {
    ...meta,
    avatar: path.basename(destAvatar),
    introsMeta: meta.introsMeta.map((im) => ({
      ...im,
      portraitUrl: rewriteUrl(im.portraitUrl),
    })),
    groupIntrosMeta: (meta.groupIntrosMeta || []).map((im) => ({
      ...im,
      portraitUrl: rewriteUrl(im.portraitUrl),
    })),
    avatarGallery: meta.avatarGallery.map((g) => ({
      ...g,
      url: rewriteUrl(g.url),
    })),
  });
}

/**
 * Deletes `.nexustavern/characters/<avatar>.json` and its portraits directory when a card is deleted.
 */
export function deleteScenarioMeta(avatarFilename) {
  const metaFile = toMetaFilename(avatarFilename);
  if (metaFile) {
    const fullPath = path.join(NEXUSTAVERN_CHARACTERS_DIR, metaFile);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { force: true });
    }
  }

  const slug = toPortraitSlug(avatarFilename);
  const portraitDir = path.join(NEXUSTAVERN_PORTRAITS_DIR, slug);
  if (fs.existsSync(portraitDir)) {
    fs.rmSync(portraitDir, { recursive: true, force: true });
  }
}
