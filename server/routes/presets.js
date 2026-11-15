import { Router } from 'express';
import {
  PRESET_CATEGORIES,
  ST_DEFAULT_SYSTEM_PROMPTS,
  listCategoryPresets,
  getPresetByName,
  savePresetByName,
  deletePresetByName,
  bulkDeletePresetsByName,
  renamePresetByName,
  duplicatePresetByName,
  exportPresetByName,
  importPresetsToCategory,
  updateCategoryPresetsMeta,
  getConnectionAndPresetSettings,
  updateConnectionAndPresetSettings,
} from '../services/presetStore.js';
import {
  getSecretsZeroTrustStatus,
  setSecretValue,
  deleteSecretValue,
} from '../services/secretsStore.js';

export const presetsRouter = Router();

/**
 * GET /api/presets/overview
 * Returns active preset bindings, connection profile settings from `settings.json`,
 * category counts, default ST system prompts metadata, and Zero-Trust secrets vault status.
 */
presetsRouter.get('/overview', (_req, res) => {
  try {
    const t0 = performance.now();
    const settingsState = getConnectionAndPresetSettings();
    const secretsState = getSecretsZeroTrustStatus();

    res.json({
      ok: true,
      elapsedMs: Number((performance.now() - t0).toFixed(2)),
      categories: Object.values(PRESET_CATEGORIES),
      defaultSystemPrompts: ST_DEFAULT_SYSTEM_PROMPTS,
      ...settingsState,
      secrets: secretsState,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PATCH /api/presets/settings
 * Updates active preset bindings (`activePresets`), `mainApi`, or `connection` fields in `settings.json`.
 */
presetsRouter.patch('/settings', async (req, res) => {
  try {
    const updated = await updateConnectionAndPresetSettings(req.body || {});
    res.json({
      ok: true,
      ...updated,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/presets/secrets/status
 * Returns Zero-Trust status of `secrets.json` (boolean flags + masked strings, never raw keys).
 */
presetsRouter.get('/secrets/status', (_req, res) => {
  try {
    const status = getSecretsZeroTrustStatus();
    res.json({
      ok: true,
      ...status,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/presets/secrets/:key
 * Writes or updates a secret API key in server-side `secrets.json` (0o600 permissions).
 */
presetsRouter.put('/secrets/:key', async (req, res) => {
  try {
    const key = req.params.key;
    const value = req.body?.value ?? '';
    const status = await setSecretValue(key, value);
    res.json({
      ok: true,
      ...status,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/presets/secrets/:key
 * Removes a secret API key from server-side `secrets.json`.
 */
presetsRouter.delete('/secrets/:key', async (req, res) => {
  try {
    const status = await deleteSecretValue(req.params.key);
    res.json({
      ok: true,
      ...status,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/presets/:category
 * Lists all presets inside a category (`openai`, `textgen`, `instruct`, `context`, `sysprompt`, `reasoning`, `kobold`, `novel`).
 */
presetsRouter.get('/:category', (req, res) => {
  try {
    const data = listCategoryPresets(req.params.category);
    res.json({
      ok: true,
      ...data,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/presets/:category/:name
 * Reads a full preset file with Zero-Trust `proxy_password` masking and normalized Prompt Manager order.
 */
presetsRouter.get('/:category/:name', (req, res) => {
  try {
    const preset = getPresetByName(req.params.category, req.params.name);
    if (!preset) {
      return res.status(404).json({ ok: false, error: 'Preset not found' });
    }
    res.json({
      ok: true,
      preset,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/presets/:category/:name
 * Saves or creates a preset file in `data/default-user/<CategoryFolder>/`,
 * preserving untouched `proxy_password` on disk and creating a backup in `backups/`.
 */
presetsRouter.put('/:category/:name', async (req, res) => {
  try {
    const saved = await savePresetByName(
      req.params.category,
      req.params.name,
      req.body || {},
    );
    res.json({
      ok: true,
      preset: saved,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * PATCH /api/presets/:category/meta
 * Updates preset folders, folder assignments, and starred presets for a category.
 */
presetsRouter.patch('/:category/meta', async (req, res) => {
  try {
    const meta = await updateCategoryPresetsMeta(req.params.category, req.body || {});
    const listing = listCategoryPresets(req.params.category);
    res.json({
      ok: true,
      meta,
      presets: listing.presets,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/presets/:category/bulk-delete
 * Bulk-deletes multiple preset files (backing up each to `backups/`).
 */
presetsRouter.post('/:category/bulk-delete', async (req, res) => {
  try {
    const names = Array.isArray(req.body?.names) ? req.body.names : [];
    const result = await bulkDeletePresetsByName(req.params.category, names);
    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/presets/:category/import
 * Imports one or more JSON preset files into `data/default-user/<CategoryFolder>/`.
 */
presetsRouter.post('/:category/import', async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items)
      ? req.body.items
      : req.body?.preset
        ? [req.body.preset]
        : [];
    const result = await importPresetsToCategory(req.params.category, items);
    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/presets/:category/:name/export
 * Returns a clean SillyTavern-compatible JSON object for preset download.
 * Query `?includeConnection=1` keeps connection/proxy fields; default `0` strips them.
 */
presetsRouter.get('/:category/:name/export', (req, res) => {
  try {
    const includeConnection =
      req.query.includeConnection === '1' || req.query.includeConnection === 'true';
    const exported = exportPresetByName(req.params.category, req.params.name, {
      includeConnection,
    });
    if (!exported) {
      return res.status(404).json({ ok: false, error: 'Preset not found' });
    }
    res.json({
      ok: true,
      ...exported,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/presets/:category/:name/rename
 * Renames a preset file on disk and updates `settings.json` if active.
 */
presetsRouter.post('/:category/:name/rename', async (req, res) => {
  try {
    const newName = req.body?.newName;
    const result = await renamePresetByName(
      req.params.category,
      req.params.name,
      newName,
    );
    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/presets/:category/:name/duplicate
 * Clones a preset file under a new name (`<name> (Copy)` by default).
 */
presetsRouter.post('/:category/:name/duplicate', async (req, res) => {
  try {
    const newName = req.body?.newName;
    const result = await duplicatePresetByName(
      req.params.category,
      req.params.name,
      newName,
    );
    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/presets/:category/:name
 * Deletes a preset file after backing it up to `backups/`.
 */
presetsRouter.delete('/:category/:name', (req, res) => {
  try {
    const result = deletePresetByName(req.params.category, req.params.name);
    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});
