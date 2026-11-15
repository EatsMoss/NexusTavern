import { Router } from 'express';
import { isLocalHostRequest } from '../utils/auth.js';
import {
  readImporterPersistedState,
  clearImporterPersistedState,
  browseStDirectoryDialog,
  scanStDirectory,
  startStImportJob,
  getStImportJobSnapshot,
  cancelStImportJob,
} from '../services/stImporter.js';

export const stImportRouter = Router();

function ensureHostOnly(req, res, next) {
  if (!isLocalHostRequest(req)) {
    return res.status(403).json({
      ok: false,
      error: 'SillyTavern directory import is restricted to the host PC (Zero-Trust Policy).',
    });
  }
  return next();
}

/**
 * GET /api/st-import/state
 * Returns persisted root path, last scan summary, last import report, and active job state.
 */
stImportRouter.get('/state', (req, res) => {
  const isLocalHost = isLocalHostRequest(req);
  if (!isLocalHost) {
    return res.json({
      ok: true,
      isLocalHost: false,
      canBrowseNative: false,
      persisted: null,
      job: null,
    });
  }

  const persisted = readImporterPersistedState();
  return res.json({
    ok: true,
    isLocalHost: true,
    canBrowseNative: true,
    persisted,
    job: getStImportJobSnapshot(),
  });
});

/**
 * DELETE /api/st-import/state
 * Clears persisted root path and scan/report history.
 */
stImportRouter.delete('/state', ensureHostOnly, async (_req, res) => {
  try {
    const persisted = await clearImporterPersistedState();
    res.json({ ok: true, persisted });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/st-import/browse
 * Opens native OS directory picker on the host PC.
 */
stImportRouter.post('/browse', ensureHostOnly, async (req, res) => {
  try {
    const initialPath = String(req.body?.initialPath || '');
    const result = await browseStDirectoryDialog(initialPath);
    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/st-import/scan
 * Validates a SillyTavern root directory and counts items across all categories.
 */
stImportRouter.post('/scan', ensureHostOnly, async (req, res) => {
  try {
    const rootPath = String(req.body?.rootPath || '');
    const profile = String(req.body?.profile || '');
    const scan = await scanStDirectory(rootPath, profile);
    res.json({
      ok: true,
      scan,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/st-import/start
 * Launches an asynchronous import job for the selected categories.
 */
stImportRouter.post('/start', ensureHostOnly, (req, res) => {
  try {
    const { rootPath, profile, categories, conflictMode } = req.body || {};
    const job = startStImportJob({
      rootPath,
      profile,
      categories,
      conflictMode,
    });
    res.json({
      ok: true,
      job,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/st-import/job
 * Returns live progress of the current or most recent import job.
 */
stImportRouter.get('/job', ensureHostOnly, (_req, res) => {
  res.json({
    ok: true,
    job: getStImportJobSnapshot(),
  });
});

/**
 * POST /api/st-import/cancel
 * Signals the running import job to stop gracefully.
 */
stImportRouter.post('/cancel', ensureHostOnly, (_req, res) => {
  const result = cancelStImportJob();
  res.json({
    ok: true,
    ...result,
  });
});
