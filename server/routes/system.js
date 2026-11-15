import { Router } from 'express';
import { getLanAddresses } from '../utils/network.js';
import { isLocalHostRequest } from '../utils/auth.js';
import {
  DEFAULT_USER_DIR,
  ensureUserDirectories,
  countFilesInUserDir,
} from '../utils/paths.js';
import {
  getTunnelStatus,
  startTunnel,
  stopTunnel,
} from '../services/tunnel.js';
import { readSession, saveSession } from '../services/sessionStore.js';

export const systemRouter = Router();

systemRouter.get('/status', (req, res) => {
  const directories = ensureUserDirectories();
  const lanAddresses = getLanAddresses();
  const serverPort = Number(process.env.NEXUSTAVERN_SERVER_PORT) || 8088;
  const clientPort = Number(process.env.NEXUSTAVERN_CLIENT_PORT) || 5173;
  const isLocalHost = isLocalHostRequest(req);

  res.json({
    ok: true,
    app: 'NexusTavern',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    serverPort,
    clientPort,
    isLocalHost,
    security: {
      qrTokenProtected: true,
      secretsIsolatedOnServer: true,
    },
    tunnel: getTunnelStatus(isLocalHost),
    lanAddresses: lanAddresses.map((item) => ({
      ...item,
      devUrl: `http://${item.address}:${clientPort}`,
      serverUrl: `http://${item.address}:${serverPort}`,
    })),
    storage: {
      root: DEFAULT_USER_DIR,
      totalDirectories: directories.length,
      readyDirectories: directories.filter((d) => d.exists).length,
      directories,
      counts: {
        characters: countFilesInUserDir('characters', ['.png', '.json']),
        personas: countFilesInUserDir('User Avatars', ['.png', '.jpg', '.jpeg', '.webp']),
        backgrounds: countFilesInUserDir('backgrounds', ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4']),
        openaiPresets: countFilesInUserDir('OpenAI Settings', ['.json']),
        textgenPresets: countFilesInUserDir('TextGen Settings', ['.json']),
        worlds: countFilesInUserDir('worlds', ['.json']),
        themes: countFilesInUserDir('themes', ['.json']),
      },
    },
  });
});

systemRouter.post('/tunnel/start', async (req, res) => {
  if (!isLocalHostRequest(req)) {
    return res.status(403).json({ ok: false, error: 'Tunnel management is restricted to the host PC.' });
  }
  try {
    const serverPort = Number(process.env.NEXUSTAVERN_SERVER_PORT) || 8088;
    const rotate = Boolean(req.body?.rotateToken);
    const status = await startTunnel(serverPort, rotate);
    res.json({ ok: true, tunnel: status });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

systemRouter.post('/tunnel/stop', async (req, res) => {
  if (!isLocalHostRequest(req)) {
    return res.status(403).json({ ok: false, error: 'Tunnel management is restricted to the host PC.' });
  }
  try {
    const status = await stopTunnel();
    res.json({ ok: true, tunnel: status });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


/**
 * GET /api/system/session
 * Returns the persisted UI session pointer used to restore the last opened chat on boot.
 */
systemRouter.get('/session', (_req, res) => {
  try {
    const session = readSession();
    res.json({ ok: true, session });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /api/system/session
 * Partially updates persisted UI session state (`lastChat`, `lastChats`, `uiState`, `presetDraft`).
 */
systemRouter.put('/session', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const patch = {};
    if ('lastChat' in body) patch.lastChat = body.lastChat;
    if ('lastChats' in body) patch.lastChats = body.lastChats;
    if ('uiState' in body) patch.uiState = body.uiState;
    if ('presetDraft' in body) patch.presetDraft = body.presetDraft;
    const session = await saveSession(patch);
    res.json({ ok: true, session });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


