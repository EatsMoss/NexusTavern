import { apiFetchJson, getAuthorizedAssetUrl } from '@core/api/apiClient.js';

export function isDemoCardId(id) {
  return /^(?:c\d+|c_\d+)$/.test(String(id || ''));
}

function appendCacheVersion(url, lastModified) {
  if (!url) return url;
  const ts = lastModified ? new Date(lastModified).getTime() : 0;
  const sep = url.includes('?') ? '&' : '?';
  return ts ? `${url}${sep}v=${ts}&tv=3` : `${url}${sep}tv=3`;
}

/**
 * Rewrites a full-resolution or gallery thumbnail URL into its dedicated
 * smooth 128px chat portrait thumbnail URL (`?size=chat&tv=3` or `/api/thumbnails/portrait/...`).
 */
export function toChatPortraitUrl(inputUrl) {
  if (!inputUrl || typeof inputUrl !== 'string') return inputUrl || null;
  if (inputUrl.startsWith('data:') || inputUrl.startsWith('blob:')) {
    return inputUrl;
  }

  const qIdx = inputUrl.indexOf('?');
  const pathPart = qIdx !== -1 ? inputUrl.slice(0, qIdx) : inputUrl;
  const queryStr = qIdx !== -1 ? inputUrl.slice(qIdx + 1) : '';
  const params = new URLSearchParams(queryStr);

  // 1. Existing /api/thumbnails/avatar/:file or /api/thumbnails/persona/:file
  if (
    pathPart.startsWith('/api/thumbnails/avatar/') ||
    pathPart.startsWith('/api/thumbnails/persona/')
  ) {
    params.set('size', 'chat');
    params.set('tv', '3');
    return `${pathPart}?${params.toString()}`;
  }

  // 2. Already a custom portrait thumbnail
  if (pathPart.startsWith('/api/thumbnails/portrait/')) {
    params.set('tv', '3');
    return `${pathPart}?${params.toString()}`;
  }

  // 3. Custom scenario/intro portrait `/user-data/.nexustavern/portraits/:slug/:file`
  const portraitPrefix = '/user-data/.nexustavern/portraits/';
  if (pathPart.startsWith(portraitPrefix)) {
    const rest = pathPart.slice(portraitPrefix.length);
    const slashIdx = rest.indexOf('/');
    if (slashIdx > 0) {
      const slug = rest.slice(0, slashIdx);
      const file = rest.slice(slashIdx + 1);
      params.set('tv', '3');
      const nextUrl = `/api/thumbnails/portrait/${slug}/${file}?${params.toString()}`;
      return getAuthorizedAssetUrl(nextUrl);
    }
  }

  // 4. Full character PNG `/user-data/characters/:file`
  const charPrefix = '/user-data/characters/';
  if (pathPart.startsWith(charPrefix)) {
    const file = pathPart.slice(charPrefix.length);
    params.set('size', 'chat');
    params.set('tv', '3');
    return getAuthorizedAssetUrl(`/api/thumbnails/avatar/${file}?${params.toString()}`);
  }

  // 5. Full persona avatar `/user-data/User%20Avatars/:file`
  const personaPrefix = '/user-data/User%20Avatars/';
  if (pathPart.startsWith(personaPrefix)) {
    const file = pathPart.slice(personaPrefix.length);
    params.set('size', 'chat');
    params.set('tv', '3');
    return getAuthorizedAssetUrl(`/api/thumbnails/persona/${file}?${params.toString()}`);
  }

  return inputUrl;
}

/**
 * Fetches lightweight summaries of all character & scenario cards (`GET /api/characters`).
 */
export async function fetchCharacterSummaries() {
  const res = await apiFetchJson('/api/characters');
  const characters = (res?.characters || []).map((c) => ({
    ...c,
    id: c.avatar,
    subtitle: String(c.subtitle || ''),
    latestChatPreview: String(c.latestChatPreview || ''),
    latestChatSender: String(c.latestChatSender || ''),
    latestChatIsUser: Boolean(c.latestChatIsUser),
    initials: String(c.name || 'CH').slice(0, 2).toUpperCase(),
    pinned: Boolean(c.fav),
    thumbnailUrl: appendCacheVersion(
      getAuthorizedAssetUrl(c.thumbnailUrl),
      c.lastModified,
    ),
    avatarUrl: appendCacheVersion(
      getAuthorizedAssetUrl(c.avatarUrl),
      c.lastModified,
    ),
  }));
  return {
    count: res?.count || characters.length,
    elapsedMs: res?.elapsedMs || 0,
    characters,
  };
}

function mapIntroMetaUrls(list) {
  if (!Array.isArray(list)) return [];
  return list.map((im) => ({
    ...im,
    rawPortraitUrl: im?.portraitUrl || null,
    portraitUrl: im?.portraitUrl ? getAuthorizedAssetUrl(im.portraitUrl) : null,
  }));
}

function normalizeScenarioMetaUrls(scenarioMeta) {
  if (!scenarioMeta || typeof scenarioMeta !== 'object') return null;
  return {
    ...scenarioMeta,
    introsMeta: mapIntroMetaUrls(scenarioMeta.introsMeta),
    groupIntrosMeta: mapIntroMetaUrls(scenarioMeta.groupIntrosMeta),
    avatarGallery: Array.isArray(scenarioMeta.avatarGallery)
      ? scenarioMeta.avatarGallery.map((g) => ({
          ...g,
          rawUrl: g.url,
          url: getAuthorizedAssetUrl(g.url),
        }))
      : [],
  };
}

function normalizeFullCard(card) {
  if (!card) return null;
  const scenarioMeta = normalizeScenarioMetaUrls(card.scenarioMeta);
  return {
    ...card,
    id: card.avatar,
    subtitle: String(scenarioMeta?.subtitle || card.subtitle || ''),
    initials: String(card.name || 'CH').slice(0, 2).toUpperCase(),
    pinned: Boolean(card.fav),
    thumbnailUrl: appendCacheVersion(
      getAuthorizedAssetUrl(card.thumbnailUrl),
      card.lastModified,
    ),
    avatarUrl: appendCacheVersion(
      getAuthorizedAssetUrl(card.avatarUrl),
      card.lastModified,
    ),
    scenarioMeta,
  };
}

/**
 * Fetches the full V2/V3 metadata for a single character card (`GET /api/characters/:avatar`).
 */
export async function fetchCharacterCard(avatarFilename) {
  const res = await apiFetchJson(`/api/characters/${encodeURIComponent(avatarFilename)}`);
  return normalizeFullCard(res?.card);
}

/**
 * Atomically updates a character card's PNG chunks (`chara`/`ccv3`) (`PUT /api/characters/:avatar`).
 */
export async function updateCharacterCard(avatarFilename, updates) {
  const res = await apiFetchJson(`/api/characters/${encodeURIComponent(avatarFilename)}`, {
    method: 'PUT',
    body: updates,
  });
  return normalizeFullCard(res?.card);
}

/**
 * Creates a new character/scenario card (`POST /api/characters`).
 */
export async function createCharacterCard({
  fields = {},
  avatarBase64 = null,
  scenarioMeta = null,
  asJson = false,
} = {}) {
  const res = await apiFetchJson('/api/characters', {
    method: 'POST',
    body: { fields, avatarBase64, scenarioMeta, asJson },
  });
  return {
    card: normalizeFullCard(res?.card),
    tags: res?.tags || [],
    tagMap: res?.tagMap || {},
  };
}

/**
 * Imports one or more `.png` (v2/v3) or `.json` character cards (`POST /api/characters/import`).
 */
export async function importCharacterCards(
  items = [],
  { importEmbeddedTags = true } = {},
) {
  const res = await apiFetchJson('/api/characters/import', {
    method: 'POST',
    body: { items, importEmbeddedTags },
  });
  return {
    count: res?.count || 0,
    imported: (res?.imported || []).map(normalizeFullCard).filter(Boolean),
    tags: res?.tags || [],
    tagMap: res?.tagMap || {},
  };
}

function mapPersonasResponse(res) {
  const personas = (res?.personas || []).map((p) => ({
    ...p,
    thumbnailUrl: p.thumbnailUrl ? getAuthorizedAssetUrl(p.thumbnailUrl) : null,
    avatarUrl: p.avatarUrl ? getAuthorizedAssetUrl(p.avatarUrl) : null,
  }));
  return {
    createdPersonaAvatar: res?.createdPersonaAvatar || null,
    activePersonaAvatar: res?.activePersonaAvatar || null,
    personas,
  };
}

/**
 * Fetches all user personas (`GET /api/personas`).
 */
export async function fetchPersonas() {
  const res = await apiFetchJson('/api/personas');
  return mapPersonasResponse(res);
}

/**
 * Creates a new user persona (`POST /api/personas`).
 */
export async function createPersona(payload) {
  const res = await apiFetchJson('/api/personas', {
    method: 'POST',
    body: payload,
  });
  return mapPersonasResponse(res);
}

/**
 * Updates a persona's display name, subtitle, description, and connections (`PUT /api/personas/:avatar`).
 */
export async function updatePersona(avatarFilename, updates) {
  const res = await apiFetchJson(`/api/personas/${encodeURIComponent(avatarFilename)}`, {
    method: 'PUT',
    body: updates,
  });
  return mapPersonasResponse(res);
}

/**
 * Uploads/replaces the image of an existing persona (`POST /api/personas/:avatar/avatar`).
 */
export async function uploadPersonaAvatar(avatarFilename, imageBase64) {
  const res = await apiFetchJson(
    `/api/personas/${encodeURIComponent(avatarFilename)}/avatar`,
    {
      method: 'POST',
      body: { imageBase64 },
    },
  );
  return mapPersonasResponse(res);
}

/**
 * Duplicates an existing persona (`POST /api/personas/:avatar/duplicate`).
 */
export async function duplicatePersona(avatarFilename) {
  const res = await apiFetchJson(
    `/api/personas/${encodeURIComponent(avatarFilename)}/duplicate`,
    {
      method: 'POST',
    },
  );
  return mapPersonasResponse(res);
}

/**
 * Deletes a persona (`DELETE /api/personas/:avatar`).
 */
export async function deletePersona(avatarFilename) {
  const res = await apiFetchJson(`/api/personas/${encodeURIComponent(avatarFilename)}`, {
    method: 'DELETE',
  });
  return mapPersonasResponse(res);
}

/**
 * Selects the active user persona (`POST /api/personas/select`).
 */
export async function selectPersona(avatarFilename) {
  const res = await apiFetchJson('/api/personas/select', {
    method: 'POST',
    body: { avatar: avatarFilename },
  });
  return mapPersonasResponse(res);
}

/**
 * Fetches `settings.json -> tags` plus the raw avatar -> tag-id assignments
 * (`GET /api/characters/tags`).
 */
export async function fetchTags() {
  const res = await apiFetchJson('/api/characters/tags');
  return {
    tags: res?.tags || [],
    tagMap: res?.tagMap || {},
  };
}

/**
 * Creates a tag (`POST /api/characters/tags`).
 */
export async function createTag(name, folderType = 'NONE') {
  const res = await apiFetchJson('/api/characters/tags', {
    method: 'POST',
    body: { name, folderType },
  });
  return { tags: res?.tags || [], tagMap: res?.tagMap || {} };
}

/**
 * Renames a tag (`PATCH /api/characters/tags/:tagId`).
 */
export async function renameTag(tagId, name) {
  const res = await apiFetchJson(`/api/characters/tags/${encodeURIComponent(tagId)}`, {
    method: 'PATCH',
    body: { name },
  });
  return { tags: res?.tags || [], tagMap: res?.tagMap || {} };
}

/**
 * Deletes a tag and detaches it from every card (`DELETE /api/characters/tags/:tagId`).
 */
export async function deleteTag(tagId) {
  const res = await apiFetchJson(`/api/characters/tags/${encodeURIComponent(tagId)}`, {
    method: 'DELETE',
  });
  return { tags: res?.tags || [], tagMap: res?.tagMap || {} };
}

/**
 * Replaces the tag-id list assigned to one card (`PUT /api/characters/:avatar/tags`).
 */
export async function setCardTags(avatarFilename, tagIds = []) {
  const res = await apiFetchJson(
    `/api/characters/${encodeURIComponent(avatarFilename)}/tags`,
    { method: 'PUT', body: { tagIds } },
  );
  return { tags: res?.tags || [], tagMap: res?.tagMap || {} };
}

/**
 * Applies one tag operation to many cards (`POST /api/characters/tags/bulk`).
 * mode: 'add' | 'remove' | 'replace'
 */
export async function bulkSetCardTags(avatars = [], tagId, mode = 'add') {
  const res = await apiFetchJson('/api/characters/tags/bulk', {
    method: 'POST',
    body: { avatars, tagId, mode },
  });
  return { tags: res?.tags || [], tagMap: res?.tagMap || {} };
}

/**
 * Fetches group definitions from `data/default-user/groups` (`GET /api/characters/groups`).
 */
export async function fetchGroups() {
  const res = await apiFetchJson('/api/characters/groups');
  const groups = (res?.groups || []).map((g) => ({
    ...g,
    id: g.id,
    pinned: Boolean(g.fav),
    avatarUrl: getAuthorizedAssetUrl(g.avatarUrl),
  }));
  return { count: res?.count || groups.length, groups };
}

/**
 * Creates a new group chat definition (`POST /api/characters/groups`).
 */
export async function createGroupChat({ name, members = [], fav = false } = {}) {
  const res = await apiFetchJson('/api/characters/groups', {
    method: 'POST',
    body: { name, members, fav },
  });
  const groups = (res?.groups || []).map((g) => ({
    ...g,
    id: g.id,
    pinned: Boolean(g.fav),
    avatarUrl: getAuthorizedAssetUrl(g.avatarUrl),
  }));
  return {
    group: res?.group
      ? {
          ...res.group,
          id: res.group.id,
          pinned: Boolean(res.group.fav),
          avatarUrl: getAuthorizedAssetUrl(res.group.avatarUrl),
        }
      : null,
    groups,
  };
}

/**
 * Duplicates a card file together with its tag assignments
 * (`POST /api/characters/:avatar/duplicate`).
 */
export async function duplicateCharacterCard(avatarFilename) {
  const res = await apiFetchJson(
    `/api/characters/${encodeURIComponent(avatarFilename)}/duplicate`,
    { method: 'POST' },
  );
  return res?.card || null;
}

/**
 * Deletes one card together with its thumbnail, tags and (optionally) chat folder
 * (`DELETE /api/characters/:avatar?deleteChats=true|false`).
 */
export async function deleteCharacterCard(avatarFilename, { deleteChats = true } = {}) {
  const params = new URLSearchParams({
    deleteChats: deleteChats ? 'true' : 'false',
  });
  const res = await apiFetchJson(
    `/api/characters/${encodeURIComponent(avatarFilename)}?${params.toString()}`,
    { method: 'DELETE' },
  );
  return res?.deleted || [];
}

/**
 * Deletes many cards and/or groups at once (`POST /api/characters/bulk/delete`).
 */
export async function deleteCharacterCards(
  avatars = [],
  { groupIds = [], deleteChats = true } = {},
) {
  const res = await apiFetchJson('/api/characters/bulk/delete', {
    method: 'POST',
    body: { avatars, groupIds, deleteChats },
  });
  return {
    deleted: res?.deleted || [],
    deletedGroups: res?.deletedGroups || [],
    count: res?.count || 0,
  };
}

/**
 * Builds the authenticated URL that streams a card export
 * (`GET /api/characters/:avatar/export?format=png|json`).
 */
export function getCardExportUrl(avatarFilename, format = 'png') {
  return getAuthorizedAssetUrl(
    `/api/characters/${encodeURIComponent(avatarFilename)}/export?format=${format}`,
  );
}

/**
 * Downloads multiple character cards as a single `.zip` archive (`png` or `json` format).
 */
export async function downloadCharacterCardsZip(avatars = [], format = 'png') {
  const res = await apiFetchJson('/api/characters/bulk/export-zip', {
    method: 'POST',
    body: { avatars, format },
  });
  if (!res?.zipBase64) {
    throw new Error('Failed to build ZIP archive');
  }

  const binString = window.atob(res.zipBase64);
  const bytes = new Uint8Array(binString.length);
  for (let i = 0; i < binString.length; i += 1) {
    bytes[i] = binString.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: 'application/zip' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = res.fileName || `scenarios-${format}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

  return { fileName: res.fileName, count: res.count };
}

/**
 * Updates an existing group chat definition (`PATCH /api/characters/groups/:groupId`).
 */
export async function updateGroupChat(groupId, patch = {}) {
  const res = await apiFetchJson(
    `/api/characters/groups/${encodeURIComponent(groupId)}`,
    {
      method: 'PATCH',
      body: patch,
    },
  );
  const groups = (res?.groups || []).map((g) => ({
    ...g,
    id: g.id,
    pinned: Boolean(g.fav),
    avatarUrl: getAuthorizedAssetUrl(g.avatarUrl),
  }));
  return {
    group: res?.group
      ? {
          ...res.group,
          id: res.group.id,
          pinned: Boolean(res.group.fav),
          avatarUrl: getAuthorizedAssetUrl(res.group.avatarUrl),
        }
      : null,
    groups,
  };
}

/**
 * Replaces the main PNG portrait of a card (`POST /api/characters/:avatar/avatar`).
 */
export async function replaceCharacterCardAvatar(avatarFilename, imageBase64) {
  const res = await apiFetchJson(
    `/api/characters/${encodeURIComponent(avatarFilename)}/avatar`,
    {
      method: 'POST',
      body: { imageBase64 },
    },
  );
  return normalizeFullCard(res?.card);
}

/**
 * Replaces/updates an existing character card from a newly uploaded `.png` or `.json` file
 * (`POST /api/characters/:avatar/replace`).
 */
export async function replaceCharacterCardFromFile(
  avatarFilename,
  { fileBase64, jsonPayload } = {},
) {
  const res = await apiFetchJson(
    `/api/characters/${encodeURIComponent(avatarFilename)}/replace`,
    {
      method: 'POST',
      body: { fileBase64, jsonPayload },
    },
  );
  return normalizeFullCard(res?.card);
}

/**
 * Imports the card's embedded `data.tags` into `settings.json -> tags` and `tag_map`
 * (`POST /api/characters/:avatar/tags/import-embedded`).
 */
export async function importEmbeddedCardTags(avatarFilename) {
  const res = await apiFetchJson(
    `/api/characters/${encodeURIComponent(avatarFilename)}/tags/import-embedded`,
    { method: 'POST' },
  );
  return {
    card: normalizeFullCard(res?.card),
    tags: res?.tags || [],
    tagMap: res?.tagMap || {},
  };
}

/**
 * Updates `.nexustavern/characters/<avatar>.json` metadata (`PUT /api/characters/:avatar/meta`).
 */
export async function updateCharacterScenarioMeta(avatarFilename, patch = {}) {
  const res = await apiFetchJson(
    `/api/characters/${encodeURIComponent(avatarFilename)}/meta`,
    {
      method: 'PUT',
      body: patch,
    },
  );
  return normalizeScenarioMetaUrls(res?.scenarioMeta);
}

/**
 * Uploads a portrait into the scenario's gallery (`POST /api/characters/:avatar/portraits`).
 */
export async function uploadScenarioGalleryPortrait(
  avatarFilename,
  { imageBase64, fileName, label } = {},
) {
  const res = await apiFetchJson(
    `/api/characters/${encodeURIComponent(avatarFilename)}/portraits`,
    {
      method: 'POST',
      body: { imageBase64, fileName, label },
    },
  );
  return {
    entry: res?.entry
      ? {
          ...res.entry,
          rawUrl: res.entry.url,
          url: getAuthorizedAssetUrl(res.entry.url),
        }
      : null,
    scenarioMeta: normalizeScenarioMetaUrls(res?.scenarioMeta),
  };
}

/**
 * Removes a portrait from the scenario's gallery (`DELETE /api/characters/:avatar/portraits/:portraitId`).
 */
export async function removeScenarioGalleryPortrait(avatarFilename, portraitId) {
  const res = await apiFetchJson(
    `/api/characters/${encodeURIComponent(avatarFilename)}/portraits/${encodeURIComponent(portraitId)}`,
    { method: 'DELETE' },
  );
  return {
    scenarioMeta: normalizeScenarioMetaUrls(res?.scenarioMeta),
    card: res?.card ? normalizeFullCard(res.card) : null,
  };
}

/**
 * Switches the card's main PNG portrait to an item from `avatarGallery` (`POST /api/characters/:avatar/portraits/:portraitId/apply`).
 */
export async function applyScenarioGalleryPortrait(avatarFilename, portraitId) {
  const res = await apiFetchJson(
    `/api/characters/${encodeURIComponent(avatarFilename)}/portraits/${encodeURIComponent(portraitId)}/apply`,
    { method: 'POST' },
  );
  return normalizeFullCard(res?.card);
}

/**
 * Converts a character card into a SillyTavern user persona (`POST /api/characters/:avatar/convert-to-persona`).
 */
export async function convertCardToPersona(avatarFilename) {
  const res = await apiFetchJson(
    `/api/characters/${encodeURIComponent(avatarFilename)}/convert-to-persona`,
    { method: 'POST' },
  );
  return mapPersonasResponse(res);
}

/**
 * Lists available World Info / Lorebook files (`GET /api/characters/worlds/list`).
 */
export async function fetchAvailableWorlds() {
  const res = await apiFetchJson('/api/characters/worlds/list');
  return res?.worlds || [];
}

/**
 * Updates `extensions.world` and/or `world_info.charLore` (`PUT /api/characters/:avatar/lore-bindings`).
 */
export async function updateCharacterLoreBindings(avatarFilename, payload = {}) {
  const res = await apiFetchJson(
    `/api/characters/${encodeURIComponent(avatarFilename)}/lore-bindings`,
    {
      method: 'PUT',
      body: payload,
    },
  );
  return normalizeFullCard(res?.card);
}

/**
 * Extracts embedded `character_book` into `worlds/<Name>.json` (`POST /api/characters/:avatar/import-embedded-lore`).
 */
export async function importEmbeddedCardLore(avatarFilename) {
  const res = await apiFetchJson(
    `/api/characters/${encodeURIComponent(avatarFilename)}/import-embedded-lore`,
    { method: 'POST' },
  );
  return {
    worldName: res?.worldName || '',
    entriesCount: res?.entriesCount || 0,
    card: normalizeFullCard(res?.card),
    worlds: res?.worlds || [],
  };
}
