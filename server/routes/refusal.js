import { Router } from 'express';
import {
  readRefusalCatcherConfig,
  saveRefusalCatcherConfig,
  appendRefusalPhrase,
  deleteRefusalPhrase,
} from '../services/refusalStore.js';
import { recordConsoleLog } from '../services/consoleLogger.js';

export const refusalRouter = Router();

/**
 * GET /api/refusal-catcher
 * Returns current Refusal Catcher configuration and banned phrases list.
 */
refusalRouter.get('/', (_req, res) => {
  try {
    const config = readRefusalCatcherConfig();
    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/refusal-catcher
 * Updates enabled state, streaming delay, head window, or full banned phrases array.
 */
refusalRouter.put('/', async (req, res) => {
  try {
    const config = await saveRefusalCatcherConfig(req.body || {});
    recordConsoleLog({
      category: 'change',
      level: 'info',
      scope: 'Refusal Catcher',
      title: `Updated Refusal Catcher configuration`,
      summary: `Enabled: ${config.enabled ? 'ON' : 'OFF'} • Fallback: ${config.fallbackEnabled ? 'ON' : 'OFF'} • Phrases: ${config.bannedPhrases?.length || 0}`,
    });
    res.json({ ok: true, config });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/refusal-catcher/phrases
 * Adds a single banned phrase to the top of the list.
 */
refusalRouter.post('/phrases', async (req, res) => {
  try {
    const result = await appendRefusalPhrase(req.body?.phrase);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/refusal-catcher/phrases
 * Removes a banned phrase from the list.
 */
refusalRouter.delete('/phrases', async (req, res) => {
  try {
    const phrase = req.body?.phrase ?? req.query?.phrase ?? '';
    const result = await deleteRefusalPhrase(phrase);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});
