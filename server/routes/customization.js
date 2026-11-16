import { Router } from 'express';
import {
  readCustomizationConfig,
  writeCustomizationConfig,
  listCustomThemePresets,
  upsertCustomThemePreset,
  removeCustomThemePreset,
  saveUploadedFont,
  removeUploadedFont,
  importCustomizationWorkspaceBackup,
} from '../services/customizationStore.js';
import { BUILTIN_THEME_PRESETS } from '../../src/core/customization/customizationDefaults.js';

export const customizationRouter = Router();

customizationRouter.get('/', (_req, res) => {
  try {
    const config = readCustomizationConfig();
    const customPresets = listCustomThemePresets();
    res.json({
      ok: true,
      config,
      builtinPresets: BUILTIN_THEME_PRESETS,
      customPresets,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

customizationRouter.put('/', async (req, res) => {
  try {
    const incoming = req.body?.config && typeof req.body.config === 'object' ? req.body.config : req.body;
    const config = await writeCustomizationConfig(incoming || {});
    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

customizationRouter.post('/presets', async (req, res) => {
  try {
    const rawPreset = req.body?.preset;
    const saved = await upsertCustomThemePreset(rawPreset);
    const customPresets = listCustomThemePresets();
    res.json({ ok: true, preset: saved, customPresets });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

customizationRouter.delete('/presets/:id', async (req, res) => {
  try {
    const removed = await removeCustomThemePreset(req.params.id);
    const customPresets = listCustomThemePresets();
    res.json({ ok: true, removed, customPresets });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

customizationRouter.post('/fonts', async (req, res) => {
  try {
    const { fileName, dataUrl, family } = req.body || {};
    const fontEntry = await saveUploadedFont({ fileName, dataUrl, family });
    res.json({ ok: true, font: fontEntry });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

customizationRouter.delete('/fonts/:id', async (req, res) => {
  try {
    const removed = await removeUploadedFont(req.params.id);
    res.json({ ok: true, removed });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

customizationRouter.post('/backup/import', async (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const configCandidate =
      payload.config && typeof payload.config === 'object' ? payload.config : payload;
    const presetsCandidate = Array.isArray(payload.customPresets) ? payload.customPresets : [];
    const result = await importCustomizationWorkspaceBackup({
      config: configCandidate,
      customPresets: presetsCandidate,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});
