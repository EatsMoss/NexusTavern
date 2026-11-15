import { Router } from 'express';
import {
  readMessageRecapConfig,
  saveMessageRecapConfig,
  resetMessageRecapConfig,
} from '../services/recapStore.js';
import { recordConsoleLog } from '../services/consoleLogger.js';

export const recapRouter = Router();

/**
 * GET /api/message-recap
 * Returns current Message Recap plugin configuration.
 */
recapRouter.get('/', (_req, res) => {
  try {
    const config = readMessageRecapConfig();
    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/message-recap
 * Atomically updates Message Recap settings (prompts, roles, positions, strip regex, depth).
 */
recapRouter.put('/', async (req, res) => {
  try {
    const config = await saveMessageRecapConfig(req.body || {});
    recordConsoleLog({
      category: 'change',
      level: 'info',
      scope: 'Message Recap',
      title: 'Updated Message Recap configuration',
      summary: `Enabled: ${config.enabled ? 'ON' : 'OFF'} • Strip: ${config.stripEnabled ? `ON (depth >= ${config.keepFullDepth})` : 'OFF'}`,
    });
    res.json({ ok: true, config });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/message-recap/reset
 * Restores factory default prompts, depth, and strip regex.
 */
recapRouter.post('/reset', async (req, res) => {
  try {
    const config = await resetMessageRecapConfig(req.body || {});
    recordConsoleLog({
      category: 'change',
      level: 'info',
      scope: 'Message Recap',
      title: 'Restored Message Recap defaults',
      summary: `Enabled: ${config.enabled ? 'ON' : 'OFF'} • Depth >= ${config.keepFullDepth}`,
    });
    res.json({ ok: true, config });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});
