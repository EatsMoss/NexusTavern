import { Router } from 'express';
import crypto from 'node:crypto';
import {
  getRegexWorkspaceState,
  saveGlobalRegexScripts,
  setGlobalRegexMasterEnabled,
  saveCardRegexScripts,
  savePresetRegexScripts,
  saveScopeFoldersMeta,
  readGlobalRegexFromSettings,
  readCardRegexScripts,
  readPresetRegexScripts,
} from '../services/regexStore.js';
import { normalizeRegexScript } from '../../src/core/regex/regexEngine.js';
import { recordConsoleLog } from '../services/consoleLogger.js';

export const regexRouter = Router();

/**
 * GET /api/regex?cardAvatar=...&presetName=...
 * Returns Global + Card + Preset regex scripts and folder organization metadata.
 */
regexRouter.get('/', (req, res) => {
  try {
    const cardAvatar = typeof req.query.cardAvatar === 'string' ? req.query.cardAvatar : '';
    const presetName = typeof req.query.presetName === 'string' ? req.query.presetName : '';
    const state = getRegexWorkspaceState({ cardAvatar, presetName });
    res.json({ ok: true, ...state });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PATCH /api/regex/master
 * Toggles the global master switch (`extension_settings.regex_enabled`).
 */
regexRouter.patch('/master', async (req, res) => {
  try {
    if (typeof req.body?.masterEnabled !== 'boolean') {
      return res.status(400).json({ ok: false, error: '`masterEnabled` boolean is required' });
    }
    const masterEnabled = await setGlobalRegexMasterEnabled(req.body.masterEnabled);
    recordConsoleLog({
      category: 'change',
      level: 'info',
      scope: 'Regex Studio',
      title: `Regex master switch turned ${masterEnabled ? 'ON' : 'OFF'}`,
    });
    return res.json({ ok: true, masterEnabled });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/regex/scripts
 * Atomically saves the ordered script list for `global`, `card`, or `preset` scope.
 */
regexRouter.put('/scripts', async (req, res) => {
  try {
    const { scope = 'global', targetId = '', scripts, masterEnabled } = req.body || {};
    if (!Array.isArray(scripts)) {
      return res.status(400).json({ ok: false, error: '`scripts` must be an array' });
    }

    if (scope === 'global') {
      const saved = await saveGlobalRegexScripts(scripts, { masterEnabled });
      recordConsoleLog({
        category: 'change',
        level: 'info',
        scope: 'Regex Studio',
        title: `Updated Global Regex scripts (${saved.length} total)`,
      });
      return res.json({ ok: true, scope: 'global', scripts: saved });
    }
    if (scope === 'card') {
      const result = await saveCardRegexScripts(targetId, scripts);
      recordConsoleLog({
        category: 'change',
        level: 'info',
        scope: 'Regex Studio',
        title: `Updated Scenario Regex scripts (${result.scripts.length} total)`,
        summary: targetId,
      });
      return res.json({
        ok: true,
        scope: 'card',
        targetId,
        scripts: result.scripts,
        card: result.card,
      });
    }
    if (scope === 'preset') {
      const result = await savePresetRegexScripts(targetId, scripts);
      recordConsoleLog({
        category: 'change',
        level: 'info',
        scope: 'Regex Studio',
        title: `Updated Preset Regex scripts (${result.scripts.length} total)`,
        summary: targetId,
      });
      return res.json({
        ok: true,
        scope: 'preset',
        targetId,
        scripts: result.scripts,
        preset: result.preset,
      });
    }

    return res.status(400).json({ ok: false, error: `Unknown regex scope: ${scope}` });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/regex/folders
 * Saves non-destructive folder grouping metadata in `.nexustavern/regex-meta.json`.
 */
regexRouter.put('/folders', async (req, res) => {
  try {
    const { scopeKey = 'global', folders, assignments = {} } = req.body || {};
    if (!Array.isArray(folders)) {
      return res.status(400).json({ ok: false, error: '`folders` must be an array' });
    }
    const foldersMeta = await saveScopeFoldersMeta(scopeKey, { folders, assignments });
    return res.json({ ok: true, foldersMeta });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});

function readScriptsForScope(scope, targetId) {
  if (scope === 'global') return readGlobalRegexFromSettings().globalScripts;
  if (scope === 'card') return readCardRegexScripts(targetId);
  if (scope === 'preset') return readPresetRegexScripts(targetId);
  throw new Error(`Invalid regex scope: ${scope}`);
}

async function writeScriptsForScope(scope, targetId, scripts) {
  if (scope === 'global') {
    await saveGlobalRegexScripts(scripts);
    return null;
  }
  if (scope === 'card') {
    return saveCardRegexScripts(targetId, scripts);
  }
  if (scope === 'preset') {
    return savePresetRegexScripts(targetId, scripts);
  }
  throw new Error(`Invalid regex scope: ${scope}`);
}

/**
 * POST /api/regex/transfer
 * Moves or copies a Regex script between `global` <-> `card` <-> `preset` scopes.
 */
regexRouter.post('/transfer', async (req, res) => {
  try {
    const {
      fromScope,
      fromTargetId = '',
      toScope,
      toTargetId = '',
      scriptId,
      mode = 'move',
    } = req.body || {};

    if (!fromScope || !toScope || !scriptId) {
      return res.status(400).json({ ok: false, error: 'Missing transfer parameters' });
    }
    if (fromScope === toScope && fromTargetId === toTargetId) {
      return res.status(400).json({ ok: false, error: 'Source and destination scopes are identical' });
    }

    const srcList = readScriptsForScope(fromScope, fromTargetId);
    const found = srcList.find((s) => s.id === scriptId);
    if (!found) {
      return res.status(404).json({ ok: false, error: 'Regex script not found in source scope' });
    }

    const dstList = readScriptsForScope(toScope, toTargetId);
    const transferredScript = normalizeRegexScript({
      ...found,
      id: mode === 'copy' ? crypto.randomUUID() : found.id,
    });

    await writeScriptsForScope(toScope, toTargetId, [...dstList, transferredScript]);
    if (mode === 'move') {
      await writeScriptsForScope(
        fromScope,
        fromTargetId,
        srcList.filter((s) => s.id !== scriptId),
      );
    }

    const cardAvatar =
      fromScope === 'card' ? fromTargetId : toScope === 'card' ? toTargetId : '';
    const presetName =
      fromScope === 'preset' ? fromTargetId : toScope === 'preset' ? toTargetId : '';

    const state = getRegexWorkspaceState({ cardAvatar, presetName });
    return res.json({ ok: true, transferredScript, ...state });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
});
