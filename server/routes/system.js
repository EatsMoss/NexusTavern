import { Router } from 'express';
import { getLanAddresses } from '../utils/network.js';
import { isLocalHostRequest, encryptJsonPayload } from '../utils/auth.js';
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
import {
  recordConsoleLog,
  getConsoleLogsSnapshot,
  clearConsoleLogs,
  subscribeConsoleLogs,
} from '../services/consoleLogger.js';

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
    recordConsoleLog({
      category: 'system',
      level: 'success',
      scope: 'Tunnel',
      title: 'SSH Tunnel started',
      summary: status?.publicUrl || 'Remote E2EE mobile tunnel is online',
      badges: [{ label: 'E2EE', tone: 'ok' }],
    });
    res.json({ ok: true, tunnel: status });
  } catch (err) {
    recordConsoleLog({
      category: 'error',
      level: 'error',
      scope: 'Tunnel',
      title: 'Failed to start SSH Tunnel',
      summary: err.message,
    });
    res.status(500).json({ ok: false, error: err.message });
  }
});

systemRouter.post('/tunnel/stop', async (req, res) => {
  if (!isLocalHostRequest(req)) {
    return res.status(403).json({ ok: false, error: 'Tunnel management is restricted to the host PC.' });
  }
  try {
    const status = await stopTunnel();
    recordConsoleLog({
      category: 'system',
      level: 'info',
      scope: 'Tunnel',
      title: 'SSH Tunnel stopped',
    });
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

/**
 * GET /api/system/logs
 * Returns buffered console output entries (`afterSeq` optional).
 */
systemRouter.get('/logs', (req, res) => {
  const afterSeq = Number(req.query.afterSeq) || 0;
  const snapshot = getConsoleLogsSnapshot({ afterSeq });
  res.json({ ok: true, ...snapshot });
});

/**
 * POST /api/system/logs/clear
 * Clears the in-memory console log buffer and notifies open console drawers.
 */
systemRouter.post('/logs/clear', (_req, res) => {
  const result = clearConsoleLogs();
  res.json({ ok: true, ...result });
});

/**
 * POST /api/system/logs/client
 * Records a workspace change or important UI event emitted by the frontend.
 */
systemRouter.post('/logs/client', (req, res) => {
  const {
    category = 'change',
    level = 'info',
    scope = 'Workspace',
    title = 'Workspace event',
    summary = '',
    badges = [],
    details = null,
  } = req.body || {};
  const allowedCategories = ['change', 'system', 'error'];
  const safeCategory = allowedCategories.includes(category) ? category : 'change';
  const entry = recordConsoleLog({
    category: safeCategory,
    level,
    scope,
    title,
    summary,
    badges,
    details,
  });
  res.json({ ok: true, entry });
});

/**
 * POST & GET /api/system/logs/stream
 * Live SSE stream of console events (compatible with `apiFetchSse` + E2EE tunnel).
 */
function handleLogsSseStream(req, res) {
  const useE2EE = req.headers['x-bb-e2ee'] === '1';
  const afterSeq = Number(req.body?.afterSeq ?? req.query?.afterSeq ?? 0) || 0;
  const freshSession = Boolean(
    req.body?.freshSession === true || req.query?.freshSession === '1',
  );

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const writeSse = (payload) => {
    if (res.writableEnded) return;
    const wire = useE2EE ? encryptJsonPayload(payload) : payload;
    res.write(`data: ${JSON.stringify(wire)}\n\n`);
  };

  const initial = getConsoleLogsSnapshot({ afterSeq, freshSession });
  writeSse({
    type: 'snapshot',
    entries: initial.entries,
    latestSeq: initial.latestSeq,
  });

  const unsubscribe = subscribeConsoleLogs((evt) => {
    writeSse(evt);
  });

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': ping\n\n');
    }
  }, 20000);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.on('aborted', cleanup);
  res.on('close', cleanup);
}

systemRouter.post('/logs/stream', handleLogsSseStream);
systemRouter.get('/logs/stream', handleLogsSseStream);


