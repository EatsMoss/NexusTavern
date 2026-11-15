import { Router } from 'express';
import {
  listPersonas,
  createPersona,
  savePersona,
  uploadPersonaAvatar,
  duplicatePersona,
  deletePersona,
  selectActivePersona,
} from '../services/cardStore.js';

export const personasRouter = Router();

/**
 * GET /api/personas
 * Lists all user personas from `User Avatars/` and `settings.json -> power_user.personas`.
 */
personasRouter.get('/', async (_req, res) => {
  try {
    const data = await listPersonas();
    res.json({
      ok: true,
      ...data,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/personas
 * Creates a new user persona (`User Avatars/` + `settings.json`).
 */
personasRouter.post('/', async (req, res) => {
  try {
    const data = await createPersona(req.body || {});
    res.json({
      ok: true,
      ...data,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/personas/select
 * Sets the active user persona (`user_avatar` in `settings.json`).
 */
personasRouter.post('/select', async (req, res) => {
  try {
    const avatar = req.body?.avatar;
    if (!avatar) {
      return res.status(400).json({ ok: false, error: 'Missing persona avatar filename' });
    }
    const data = await selectActivePersona(avatar);
    res.json({
      ok: true,
      ...data,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/personas/:avatar
 * Updates persona display name, subtitle, description, and connections in `settings.json`.
 */
personasRouter.put('/:avatar', async (req, res) => {
  try {
    const data = await savePersona(req.params.avatar, req.body || {});
    res.json({
      ok: true,
      ...data,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/personas/:avatar/avatar
 * Uploads / replaces the image of an existing persona.
 */
personasRouter.post('/:avatar/avatar', async (req, res) => {
  try {
    const data = await uploadPersonaAvatar(req.params.avatar, req.body || {});
    res.json({
      ok: true,
      ...data,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /api/personas/:avatar/duplicate
 * Clones an existing persona.
 */
personasRouter.post('/:avatar/duplicate', async (req, res) => {
  try {
    const data = await duplicatePersona(req.params.avatar);
    res.json({
      ok: true,
      ...data,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /api/personas/:avatar
 * Removes a persona from `settings.json` and `User Avatars/`.
 */
personasRouter.delete('/:avatar', async (req, res) => {
  try {
    const data = await deletePersona(req.params.avatar);
    res.json({
      ok: true,
      ...data,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});
