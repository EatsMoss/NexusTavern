import { apiFetchJson } from '@core/api/apiClient.js';

/**
 * Fetches active preset selections, connection profile settings from `settings.json`,
 * category counts, and Zero-Trust `secrets.json` status.
 */
export async function fetchPresetsOverview() {
  return apiFetchJson('/api/presets/overview');
}

/**
 * Updates active preset bindings (`activePresets`), `mainApi`, or `connection` settings in `settings.json`.
 */
export async function patchPresetAndConnectionSettings(patch) {
  return apiFetchJson('/api/presets/settings', {
    method: 'PATCH',
    body: patch,
  });
}

/**
 * Lists all presets in a category (`openai`, `textgen`, `instruct`, `context`, `sysprompt`, `reasoning`, `kobold`, `novel`).
 */
export async function fetchCategoryPresets(category) {
  return apiFetchJson(`/api/presets/${encodeURIComponent(category)}`);
}

/**
 * Loads a single preset by category and name (with Zero-Trust `proxy_password` masking
 * and normalized Prompt Manager `orderedPrompts` array).
 */
export async function fetchPresetDetails(category, name) {
  return apiFetchJson(
    `/api/presets/${encodeURIComponent(category)}/${encodeURIComponent(name)}`,
  );
}

/**
 * Saves or creates a preset in `data/default-user/<CategoryFolder>/<name>.json`.
 */
export async function savePresetDetails(category, name, payload) {
  return apiFetchJson(
    `/api/presets/${encodeURIComponent(category)}/${encodeURIComponent(name)}`,
    {
      method: 'PUT',
      body: payload,
    },
  );
}

/**
 * Deletes a preset file (automatically backed up to `data/default-user/backups/`).
 */
export async function removePresetFile(category, name) {
  return apiFetchJson(
    `/api/presets/${encodeURIComponent(category)}/${encodeURIComponent(name)}`,
    {
      method: 'DELETE',
    },
  );
}

/**
 * Renames a preset file on disk and updates active preset binding if applicable.
 */
export async function renamePresetFile(category, oldName, newName) {
  return apiFetchJson(
    `/api/presets/${encodeURIComponent(category)}/${encodeURIComponent(oldName)}/rename`,
    {
      method: 'POST',
      body: { newName },
    },
  );
}

/**
 * Duplicates a preset file under a new name.
 */
export async function duplicatePresetFile(category, sourceName, newName = '') {
  return apiFetchJson(
    `/api/presets/${encodeURIComponent(category)}/${encodeURIComponent(sourceName)}/duplicate`,
    {
      method: 'POST',
      body: { newName },
    },
  );
}

/**
 * Exports a preset as a SillyTavern-compatible JSON object (`includeConnection` controls
 * whether API source / model / proxy fields are included).
 */
export async function exportPresetFile(category, name, includeConnection = false) {
  const flag = includeConnection ? '1' : '0';
  return apiFetchJson(
    `/api/presets/${encodeURIComponent(category)}/${encodeURIComponent(name)}/export?includeConnection=${flag}`,
  );
}

/**
 * Imports one or more JSON preset objects (`[{ name, data }]`) into the given category.
 */
export async function importPresetFiles(category, items) {
  return apiFetchJson(`/api/presets/${encodeURIComponent(category)}/import`, {
    method: 'POST',
    body: { items },
  });
}

/**
 * Bulk-deletes multiple presets in a category (each backed up to `data/default-user/backups/`).
 */
export async function bulkRemovePresetFiles(category, names) {
  return apiFetchJson(
    `/api/presets/${encodeURIComponent(category)}/bulk-delete`,
    {
      method: 'POST',
      body: { names },
    },
  );
}

/**
 * Updates preset organization & character binding metadata for a category.
 */
export async function patchCategoryPresetsMeta(category, patch) {
  return apiFetchJson(`/api/presets/${encodeURIComponent(category)}/meta`, {
    method: 'PATCH',
    body: patch,
  });
}

/**
 * Resolves the preset name bound to a character avatar (`1 character -> max 1 preset`).
 */
export function resolveCharacterBoundPreset(characterBindings, cardAvatar) {
  if (!characterBindings || typeof characterBindings !== 'object' || !cardAvatar) {
    return '';
  }
  const cleanAvatar = String(cardAvatar).trim();
  if (!cleanAvatar) return '';
  if (characterBindings[cleanAvatar]) {
    return String(characterBindings[cleanAvatar]);
  }
  const stem = cleanAvatar.replace(/\.(png|json)$/i, '');
  if (stem && characterBindings[stem]) {
    return String(characterBindings[stem]);
  }
  return '';
}

/**
 * Fetches Zero-Trust status of server-side `secrets.json`.
 */
export async function fetchSecretsStatus() {
  return apiFetchJson('/api/presets/secrets/status');
}

/**
 * Stores or updates an API key in server-side `secrets.json`.
 */
export async function saveSecretApiKey(secretKey, rawValue) {
  return apiFetchJson(`/api/presets/secrets/${encodeURIComponent(secretKey)}`, {
    method: 'PUT',
    body: { value: rawValue },
  });
}

/**
 * Deletes an API key from server-side `secrets.json`.
 */
export async function clearSecretApiKey(secretKey) {
  return apiFetchJson(`/api/presets/secrets/${encodeURIComponent(secretKey)}`, {
    method: 'DELETE',
  });
}
