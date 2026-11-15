import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_USER_DIR,
  ensureUserDirectories,
} from '../utils/paths.js';
import {
  readUserSettings,
  writeUserSettings,
  withUserSettingsLock,
  invalidateCardStoreCaches,
} from './cardStore.js';
import { invalidateChatStoreCaches } from './chatStore.js';
import { ensureThumbnailFile } from './thumbnails.js';
import { normalizeRegexScript } from '../../src/core/regex/regexEngine.js';
import {
  BACKGROUND_EXTENSIONS,
  CARD_EXTENSIONS,
  PERSONA_IMAGE_EXTENSIONS,
  normalizeFsComparePath,
  readJsonSafe,
  resolveStRootAndProfiles,
  listFlatFiles,
  collectRecursiveFiles,
  readImporterPersistedState,
  clearImporterPersistedState,
  writeImporterPersistedState,
  browseStDirectoryDialog,
  scanStDirectory,
} from './stScanner.js';

export {
  readImporterPersistedState,
  clearImporterPersistedState,
  writeImporterPersistedState,
  browseStDirectoryDialog,
  scanStDirectory,
};

const yieldEventLoop = () => new Promise((resolve) => setImmediate(resolve));

let activeJob = {
  id: '',
  running: false,
  canceled: false,
  phase: 'idle',
  label: '',
  processed: 0,
  total: 0,
  percent: 0,
  startedAt: null,
  finishedAt: null,
  error: null,
  report: null,
};

let cancelRequested = false;

export function getStImportJobSnapshot() {
  return { ...activeJob };
}

export function cancelStImportJob() {
  if (!activeJob.running) {
    return { canceled: false, job: getStImportJobSnapshot() };
  }
  cancelRequested = true;
  activeJob = {
    ...activeJob,
    label: 'Canceling import after current item...',
  };
  return { canceled: true, job: getStImportJobSnapshot() };
}

function updateJobProgress(patch = {}) {
  const processed =
    patch.processed !== undefined ? patch.processed : activeJob.processed;
  const total = patch.total !== undefined ? patch.total : activeJob.total;
  const percent =
    total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  activeJob = {
    ...activeJob,
    ...patch,
    processed,
    total,
    percent,
  };
}

async function copySingleFileWithPolicy(srcPath, destPath, overwrite = false) {
  const exists = fs.existsSync(destPath);
  if (exists && !overwrite) {
    return 'skipped';
  }
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    await fsp.mkdir(destDir, { recursive: true });
  }
  await fsp.copyFile(srcPath, destPath);
  return 'imported';
}

function createCategoryBucket() {
  return {
    imported: 0,
    skipped: 0,
    errors: 0,
    details: {},
  };
}

function mergeTagsIntoSettings(settings, sourceSettings, overwrite, report) {
  if (!Array.isArray(settings.tags)) settings.tags = [];
  if (!settings.tag_map || typeof settings.tag_map !== 'object') {
    settings.tag_map = {};
  }

  const srcTags = Array.isArray(sourceSettings?.tags) ? sourceSettings.tags : [];
  const srcTagMap =
    sourceSettings?.tag_map && typeof sourceSettings.tag_map === 'object'
      ? sourceSettings.tag_map
      : {};

  const existingById = new Map(
    settings.tags.filter((t) => t && t.id).map((t) => [String(t.id), t]),
  );
  const existingByName = new Map(
    settings.tags
      .filter((t) => t && t.name)
      .map((t) => [String(t.name).trim().toLowerCase(), t]),
  );

  const tagIdRemap = new Map();
  let tagsImported = 0;
  let tagsSkipped = 0;
  let dirty = false;

  for (const rawTag of srcTags) {
    if (!rawTag || typeof rawTag !== 'object' || !rawTag.name) continue;
    const srcId = String(rawTag.id || '').trim();
    const cleanName = String(rawTag.name).trim();
    if (!cleanName) continue;

    const matched =
      (srcId && existingById.get(srcId)) ||
      existingByName.get(cleanName.toLowerCase());

    if (matched) {
      if (srcId) tagIdRemap.set(srcId, String(matched.id));
      if (overwrite) {
        matched.color = String(rawTag.color ?? matched.color ?? '');
        matched.color2 = String(rawTag.color2 ?? matched.color2 ?? '');
        if (rawTag.folder_type) matched.folder_type = rawTag.folder_type;
        dirty = true;
        tagsImported += 1;
      } else {
        tagsSkipped += 1;
      }
    } else {
      const newId = srcId && !existingById.has(srcId) ? srcId : randomUUID();
      const createdTag = {
        id: newId,
        name: cleanName,
        folder_type: rawTag.folder_type || 'NONE',
        filter_state: 'UNDEFINED',
        sort_order: Number(rawTag.sort_order ?? settings.tags.length),
        color: String(rawTag.color || ''),
        color2: String(rawTag.color2 || ''),
        create_date: Number(rawTag.create_date ?? Date.now()),
      };
      settings.tags.push(createdTag);
      existingById.set(newId, createdTag);
      existingByName.set(cleanName.toLowerCase(), createdTag);
      if (srcId) tagIdRemap.set(srcId, newId);
      dirty = true;
      tagsImported += 1;
    }
  }

  const knownTagIds = new Set(settings.tags.map((t) => String(t.id)));
  let tagBindingsUpdated = 0;

  for (const [avatar, rawIds] of Object.entries(srcTagMap)) {
    if (!Array.isArray(rawIds) || rawIds.length === 0) continue;
    const safeAvatar = path.basename(String(avatar || ''));
    if (!safeAvatar) continue;
    if (!fs.existsSync(path.join(DEFAULT_USER_DIR, 'characters', safeAvatar))) {
      continue;
    }

    const remapped = rawIds
      .map((id) => tagIdRemap.get(String(id)) || String(id))
      .filter((id) => knownTagIds.has(id));
    if (remapped.length === 0) continue;

    const currentIds = Array.isArray(settings.tag_map[safeAvatar])
      ? settings.tag_map[safeAvatar].map(String)
      : [];
    const nextIds = overwrite
      ? Array.from(new Set(remapped))
      : Array.from(new Set([...currentIds, ...remapped]));

    if (
      nextIds.length !== currentIds.length ||
      nextIds.some((id, idx) => id !== currentIds[idx])
    ) {
      settings.tag_map[safeAvatar] = nextIds;
      dirty = true;
      tagBindingsUpdated += 1;
    }
  }

  report.categories.characters.details.tagsImported = tagsImported;
  report.categories.characters.details.tagsSkipped = tagsSkipped;
  report.categories.characters.details.tagBindingsUpdated = tagBindingsUpdated;
  return dirty;
}

function mergePersonasIntoSettings(
  settings,
  sourceSettings,
  allPersonaKeys,
  sourcePersonasMap,
  sourcePersonaDescMap,
  overwrite,
  report,
) {
  let dirty = false;
  if (!settings.power_user || typeof settings.power_user !== 'object') {
    settings.power_user = {};
  }
  if (!settings.power_user.personas || typeof settings.power_user.personas !== 'object') {
    settings.power_user.personas = {};
  }
  if (
    !settings.power_user.persona_descriptions ||
    typeof settings.power_user.persona_descriptions !== 'object'
  ) {
    settings.power_user.persona_descriptions = {};
  }

  for (const rawAvatar of allPersonaKeys) {
    const avatar = path.basename(String(rawAvatar || '').trim());
    if (!avatar) continue;

    const srcName =
      sourcePersonasMap[rawAvatar] ||
      sourcePersonasMap[avatar] ||
      avatar.replace(/\.(png|jpg|jpeg|webp)$/i, '');
    const srcMeta =
      sourcePersonaDescMap[rawAvatar] || sourcePersonaDescMap[avatar] || {};

    const alreadyRegistered = Object.prototype.hasOwnProperty.call(
      settings.power_user.personas,
      avatar,
    );

    if (alreadyRegistered && !overwrite) {
      report.categories.personas.skipped += 1;
      continue;
    }

    settings.power_user.personas[avatar] = String(srcName).trim() || avatar;
    const prevMeta = settings.power_user.persona_descriptions[avatar] || {};
    settings.power_user.persona_descriptions[avatar] = {
      ...prevMeta,
      description: String(srcMeta.description ?? prevMeta.description ?? ''),
      title: String(srcMeta.title ?? prevMeta.title ?? ''),
      position: Number(srcMeta.position ?? prevMeta.position ?? 0),
      depth: Number(srcMeta.depth ?? prevMeta.depth ?? 2),
      role: Number(srcMeta.role ?? prevMeta.role ?? 0),
      lorebook: String(srcMeta.lorebook ?? prevMeta.lorebook ?? ''),
      connections: Array.isArray(srcMeta.connections)
        ? srcMeta.connections
        : Array.isArray(prevMeta.connections)
          ? prevMeta.connections
          : [],
    };

    dirty = true;
    report.categories.personas.imported += 1;
  }

  const currentActiveAvatar = String(settings.user_avatar || '');
  const currentActiveExists =
    currentActiveAvatar &&
    fs.existsSync(path.join(DEFAULT_USER_DIR, 'User Avatars', currentActiveAvatar));
  const sourceActiveAvatar = path.basename(String(sourceSettings?.user_avatar || ''));
  if (
    (!currentActiveExists || overwrite) &&
    sourceActiveAvatar &&
    fs.existsSync(path.join(DEFAULT_USER_DIR, 'User Avatars', sourceActiveAvatar))
  ) {
    settings.user_avatar = sourceActiveAvatar;
    dirty = true;
  }

  return dirty;
}

function mergeRegexIntoSettings(settings, sourceRegexList, overwrite, report) {
  let dirty = false;
  if (!settings.extension_settings || typeof settings.extension_settings !== 'object') {
    settings.extension_settings = {};
  }
  const currentRegex = Array.isArray(settings.extension_settings.regex)
    ? settings.extension_settings.regex
        .filter((r) => r && typeof r === 'object')
        .map((r) => normalizeRegexScript(r))
    : [];

  const indexById = new Map();
  const indexBySignature = new Map();
  currentRegex.forEach((rule, idx) => {
    if (rule.id) indexById.set(String(rule.id), idx);
    const sig = `${String(rule.scriptName || '').trim().toLowerCase()}::${String(rule.findRegex || '')}`;
    indexBySignature.set(sig, idx);
  });

  for (const rawRule of sourceRegexList) {
    try {
      const normalized = normalizeRegexScript(rawRule);
      const sig = `${String(normalized.scriptName || '').trim().toLowerCase()}::${String(normalized.findRegex || '')}`;
      const existingIdx =
        rawRule.id && indexById.has(String(rawRule.id))
          ? indexById.get(String(rawRule.id))
          : indexBySignature.has(sig)
            ? indexBySignature.get(sig)
            : -1;

      if (existingIdx >= 0) {
        if (overwrite) {
          const preservedId = currentRegex[existingIdx].id || normalized.id;
          currentRegex[existingIdx] = { ...normalized, id: preservedId };
          dirty = true;
          report.categories.regex.imported += 1;
        } else {
          report.categories.regex.skipped += 1;
        }
      } else {
        currentRegex.push(normalized);
        indexById.set(String(normalized.id), currentRegex.length - 1);
        indexBySignature.set(sig, currentRegex.length - 1);
        dirty = true;
        report.categories.regex.imported += 1;
      }
    } catch {
      report.categories.regex.errors += 1;
    }
  }

  settings.extension_settings.regex = currentRegex;
  if (settings.extension_settings.regex_enabled === undefined) {
    settings.extension_settings.regex_enabled = true;
    dirty = true;
  }
  return dirty;
}

async function executeImportPipeline({
  sourceProfileDir,
  resolvedRoot,
  profileId,
  categories,
  conflictMode,
}) {
  ensureUserDirectories();
  const overwrite = conflictMode === 'overwrite';
  const sourceSettings = readJsonSafe(path.join(sourceProfileDir, 'settings.json')) || {};

  const wantBackgrounds = Boolean(categories?.backgrounds);
  const wantCharacters = Boolean(categories?.characters);
  const wantPersonas = Boolean(categories?.personas);
  const wantRegex = Boolean(categories?.regex);
  const wantChats = Boolean(categories?.chats);

  const bgFiles = wantBackgrounds
    ? listFlatFiles(path.join(sourceProfileDir, 'backgrounds'), BACKGROUND_EXTENSIONS)
    : [];
  const cardFiles = wantCharacters
    ? listFlatFiles(path.join(sourceProfileDir, 'characters'), CARD_EXTENSIONS)
    : [];
  const groupFiles =
    wantCharacters || wantChats
      ? listFlatFiles(path.join(sourceProfileDir, 'groups'), new Set(['.json']))
      : [];
  const personaFiles = wantPersonas
    ? listFlatFiles(path.join(sourceProfileDir, 'User Avatars'), PERSONA_IMAGE_EXTENSIONS)
    : [];

  const sourcePersonasMap =
    wantPersonas &&
    sourceSettings?.power_user?.personas &&
    typeof sourceSettings.power_user.personas === 'object'
      ? sourceSettings.power_user.personas
      : {};
  const sourcePersonaDescMap =
    wantPersonas &&
    sourceSettings?.power_user?.persona_descriptions &&
    typeof sourceSettings.power_user.persona_descriptions === 'object'
      ? sourceSettings.power_user.persona_descriptions
      : {};
  const allPersonaKeys = wantPersonas
    ? Array.from(new Set([...Object.keys(sourcePersonasMap), ...personaFiles]))
    : [];

  const sourceRegexList =
    wantRegex && Array.isArray(sourceSettings?.extension_settings?.regex)
      ? sourceSettings.extension_settings.regex.filter((r) => r && typeof r === 'object')
      : [];

  const chatJsonlList = wantChats
    ? collectRecursiveFiles(path.join(sourceProfileDir, 'chats'), new Set(['.jsonl']))
    : [];
  const groupChatList = wantChats
    ? listFlatFiles(path.join(sourceProfileDir, 'group chats'), new Set(['.jsonl']))
    : [];
  const userImgList = wantChats
    ? collectRecursiveFiles(path.join(sourceProfileDir, 'user', 'images'), null)
    : [];
  const userFileList = wantChats
    ? collectRecursiveFiles(path.join(sourceProfileDir, 'user', 'files'), null)
    : [];

  const settingsSteps =
    (wantCharacters ? 1 : 0) + (wantPersonas ? 1 : 0) + (wantRegex ? 1 : 0);

  const totalUnits =
    bgFiles.length +
    cardFiles.length +
    groupFiles.length +
    personaFiles.length +
    chatJsonlList.length +
    groupChatList.length +
    userImgList.length +
    userFileList.length +
    settingsSteps;

  updateJobProgress({
    phase: 'preparing',
    label: 'Preparing SillyTavern import...',
    processed: 0,
    total: Math.max(1, totalUnits),
  });

  const report = {
    rootPath: resolvedRoot,
    profile: profileId,
    conflictMode: overwrite ? 'overwrite' : 'skip',
    completedAt: null,
    canceled: false,
    totals: { imported: 0, skipped: 0, errors: 0 },
    categories: {
      backgrounds: createCategoryBucket(),
      characters: createCategoryBucket(),
      personas: createCategoryBucket(),
      regex: createCategoryBucket(),
      chats: createCategoryBucket(),
    },
  };

  let doneUnits = 0;
  const stepUnit = async (label) => {
    doneUnits += 1;
    if (doneUnits % 32 === 0 || doneUnits === totalUnits) {
      updateJobProgress({ processed: doneUnits, ...(label ? { label } : {}) });
      await yieldEventLoop();
    } else if (label) {
      updateJobProgress({ processed: doneUnits, label });
    }
  };

  if (wantBackgrounds && !cancelRequested) {
    updateJobProgress({
      phase: 'backgrounds',
      label: `Importing backgrounds (0 / ${bgFiles.length})...`,
    });
    const srcBgDir = path.join(sourceProfileDir, 'backgrounds');
    const dstBgDir = path.join(DEFAULT_USER_DIR, 'backgrounds');

    for (let i = 0; i < bgFiles.length; i += 1) {
      if (cancelRequested) break;
      const fileName = bgFiles[i];
      try {
        const outcome = await copySingleFileWithPolicy(
          path.join(srcBgDir, fileName),
          path.join(dstBgDir, fileName),
          overwrite,
        );
        report.categories.backgrounds[outcome] += 1;
      } catch {
        report.categories.backgrounds.errors += 1;
      }
      await stepUnit(`Importing backgrounds (${i + 1} / ${bgFiles.length})...`);
    }
  }

  if (wantCharacters && !cancelRequested) {
    updateJobProgress({
      phase: 'characters',
      label: `Importing character cards (0 / ${cardFiles.length})...`,
    });
    const srcCharDir = path.join(sourceProfileDir, 'characters');
    const dstCharDir = path.join(DEFAULT_USER_DIR, 'characters');

    for (let i = 0; i < cardFiles.length; i += 1) {
      if (cancelRequested) break;
      const fileName = cardFiles[i];
      try {
        const outcome = await copySingleFileWithPolicy(
          path.join(srcCharDir, fileName),
          path.join(dstCharDir, fileName),
          overwrite,
        );
        report.categories.characters[outcome] += 1;
        if (outcome === 'imported' && fileName.toLowerCase().endsWith('.png')) {
          await ensureThumbnailFile('avatar', fileName);
        }
      } catch {
        report.categories.characters.errors += 1;
      }
      await stepUnit(`Importing character cards (${i + 1} / ${cardFiles.length})...`);
    }
  }

  if ((wantCharacters || wantChats) && groupFiles.length > 0 && !cancelRequested) {
    const srcGroupDir = path.join(sourceProfileDir, 'groups');
    const dstGroupDir = path.join(DEFAULT_USER_DIR, 'groups');
    let groupsImported = 0;
    let groupsSkipped = 0;

    for (let i = 0; i < groupFiles.length; i += 1) {
      if (cancelRequested) break;
      const fileName = groupFiles[i];
      try {
        const outcome = await copySingleFileWithPolicy(
          path.join(srcGroupDir, fileName),
          path.join(dstGroupDir, fileName),
          overwrite,
        );
        if (outcome === 'imported') groupsImported += 1;
        else groupsSkipped += 1;
      } catch {
        if (wantCharacters) report.categories.characters.errors += 1;
      }
      await stepUnit(`Importing group definitions (${i + 1} / ${groupFiles.length})...`);
    }

    if (wantCharacters) {
      report.categories.characters.details.groupsImported = groupsImported;
      report.categories.characters.details.groupsSkipped = groupsSkipped;
    } else {
      report.categories.chats.details.groupsImported = groupsImported;
    }
  }

  if (wantPersonas && !cancelRequested) {
    updateJobProgress({
      phase: 'personas',
      label: `Importing persona avatars (0 / ${personaFiles.length})...`,
    });
    const srcAvatarDir = path.join(sourceProfileDir, 'User Avatars');
    const dstAvatarDir = path.join(DEFAULT_USER_DIR, 'User Avatars');
    let avatarsCopied = 0;

    for (let i = 0; i < personaFiles.length; i += 1) {
      if (cancelRequested) break;
      const fileName = personaFiles[i];
      try {
        const outcome = await copySingleFileWithPolicy(
          path.join(srcAvatarDir, fileName),
          path.join(dstAvatarDir, fileName),
          overwrite,
        );
        if (outcome === 'imported') {
          avatarsCopied += 1;
          if (fileName.toLowerCase().endsWith('.png')) {
            await ensureThumbnailFile('persona', fileName);
          }
        }
      } catch {
        report.categories.personas.errors += 1;
      }
      await stepUnit(`Importing persona avatars (${i + 1} / ${personaFiles.length})...`);
    }
    report.categories.personas.details.avatarsCopied = avatarsCopied;
  }

  if ((wantCharacters || wantPersonas || wantRegex) && !cancelRequested) {
    updateJobProgress({
      phase: 'settings',
      label: 'Merging tags, personas & regex rules...',
    });

    await withUserSettingsLock(async () => {
      const settings = readUserSettings();
      let dirty = false;
      if (wantCharacters) {
        dirty = mergeTagsIntoSettings(settings, sourceSettings, overwrite, report) || dirty;
      }
      if (wantPersonas) {
        dirty =
          mergePersonasIntoSettings(
            settings,
            sourceSettings,
            allPersonaKeys,
            sourcePersonasMap,
            sourcePersonaDescMap,
            overwrite,
            report,
          ) || dirty;
      }
      if (wantRegex) {
        dirty = mergeRegexIntoSettings(settings, sourceRegexList, overwrite, report) || dirty;
      }
      if (dirty) {
        await writeUserSettings(settings);
      }
    });

    for (let s = 0; s < settingsSteps; s += 1) {
      await stepUnit('Merged settings metadata...');
    }
  }

  if (wantChats && !cancelRequested) {
    const totalChatFiles = chatJsonlList.length + groupChatList.length;
    updateJobProgress({
      phase: 'chats',
      label: `Importing chats (0 / ${totalChatFiles})...`,
    });

    const dstChatsRoot = path.join(DEFAULT_USER_DIR, 'chats');
    for (let i = 0; i < chatJsonlList.length; i += 1) {
      if (cancelRequested) break;
      const item = chatJsonlList[i];
      try {
        const outcome = await copySingleFileWithPolicy(
          item.absPath,
          path.join(dstChatsRoot, item.relPath),
          overwrite,
        );
        report.categories.chats[outcome] += 1;
      } catch {
        report.categories.chats.errors += 1;
      }
      await stepUnit(`Importing character chats (${i + 1} / ${chatJsonlList.length})...`);
    }

    const srcGroupChatsDir = path.join(sourceProfileDir, 'group chats');
    const dstGroupChatsDir = path.join(DEFAULT_USER_DIR, 'group chats');
    let groupChatsImported = 0;
    let groupChatsSkipped = 0;

    for (let i = 0; i < groupChatList.length; i += 1) {
      if (cancelRequested) break;
      const fileName = groupChatList[i];
      try {
        const outcome = await copySingleFileWithPolicy(
          path.join(srcGroupChatsDir, fileName),
          path.join(dstGroupChatsDir, fileName),
          overwrite,
        );
        report.categories.chats[outcome] += 1;
        if (outcome === 'imported') groupChatsImported += 1;
        else groupChatsSkipped += 1;
      } catch {
        report.categories.chats.errors += 1;
      }
      await stepUnit(`Importing group chats (${i + 1} / ${groupChatList.length})...`);
    }

    let attachmentsImported = 0;
    let attachmentsSkipped = 0;
    const dstUserImages = path.join(DEFAULT_USER_DIR, 'user', 'images');
    const dstUserFiles = path.join(DEFAULT_USER_DIR, 'user', 'files');

    for (let i = 0; i < userImgList.length; i += 1) {
      if (cancelRequested) break;
      const item = userImgList[i];
      try {
        const outcome = await copySingleFileWithPolicy(
          item.absPath,
          path.join(dstUserImages, item.relPath),
          overwrite,
        );
        if (outcome === 'imported') attachmentsImported += 1;
        else attachmentsSkipped += 1;
      } catch {
        report.categories.chats.errors += 1;
      }
      await stepUnit(`Importing chat images (${i + 1} / ${userImgList.length})...`);
    }

    for (let i = 0; i < userFileList.length; i += 1) {
      if (cancelRequested) break;
      const item = userFileList[i];
      try {
        const outcome = await copySingleFileWithPolicy(
          item.absPath,
          path.join(dstUserFiles, item.relPath),
          overwrite,
        );
        if (outcome === 'imported') attachmentsImported += 1;
        else attachmentsSkipped += 1;
      } catch {
        report.categories.chats.errors += 1;
      }
      await stepUnit(`Importing chat files (${i + 1} / ${userFileList.length})...`);
    }

    report.categories.chats.details.groupChatsImported = groupChatsImported;
    report.categories.chats.details.groupChatsSkipped = groupChatsSkipped;
    report.categories.chats.details.attachmentsImported = attachmentsImported;
    report.categories.chats.details.attachmentsSkipped = attachmentsSkipped;
  }

  invalidateCardStoreCaches();
  invalidateChatStoreCaches();

  for (const bucket of Object.values(report.categories)) {
    report.totals.imported += bucket.imported;
    report.totals.skipped += bucket.skipped;
    report.totals.errors += bucket.errors;
  }

  report.canceled = cancelRequested;
  report.completedAt = new Date().toISOString();

  await writeImporterPersistedState({
    lastRootPath: resolvedRoot,
    lastProfile: profileId,
    lastReport: report,
  });

  return report;
}

export function startStImportJob({
  rootPath = '',
  profile = '',
  categories = {},
  conflictMode = 'skip',
} = {}) {
  if (activeJob.running) {
    throw new Error('An import job is already running.');
  }

  const anyCategorySelected = Object.values(categories || {}).some(Boolean);
  if (!anyCategorySelected) {
    throw new Error('Select at least one category to import.');
  }

  const { resolvedRoot, profiles } = resolveStRootAndProfiles(rootPath);
  const chosenProfile = profiles.find((p) => p.id === profile) || profiles[0];
  if (!chosenProfile) {
    throw new Error('Selected SillyTavern user profile was not found.');
  }

  if (normalizeFsComparePath(chosenProfile.path) === normalizeFsComparePath(DEFAULT_USER_DIR)) {
    throw new Error(
      'Selected directory points to this NexusTavern workspace itself. Please select an external SillyTavern installation.',
    );
  }

  const jobId = randomUUID();
  cancelRequested = false;
  activeJob = {
    id: jobId,
    running: true,
    canceled: false,
    phase: 'starting',
    label: 'Initializing SillyTavern import...',
    processed: 0,
    total: 1,
    percent: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    report: null,
  };

  executeImportPipeline({
    sourceProfileDir: chosenProfile.path,
    resolvedRoot,
    profileId: chosenProfile.id,
    categories,
    conflictMode: conflictMode === 'overwrite' ? 'overwrite' : 'skip',
  })
    .then((report) => {
      activeJob = {
        ...activeJob,
        running: false,
        canceled: Boolean(report.canceled),
        phase: report.canceled ? 'canceled' : 'completed',
        label: report.canceled ? 'Import canceled' : 'Import complete',
        processed: activeJob.total,
        percent: 100,
        finishedAt: new Date().toISOString(),
        report,
      };
    })
    .catch((err) => {
      activeJob = {
        ...activeJob,
        running: false,
        phase: 'error',
        label: 'Import failed',
        finishedAt: new Date().toISOString(),
        error: err?.message || 'Unexpected error during SillyTavern import',
      };
    });

  return getStImportJobSnapshot();
}


