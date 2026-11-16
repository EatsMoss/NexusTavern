import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import express from 'express';
import cors from 'cors';
import { systemRouter } from './routes/system.js';
import { charactersRouter, thumbnailsRouter } from './routes/characters.js';
import { personasRouter } from './routes/personas.js';
import { chatsRouter } from './routes/chats.js';
import { presetsRouter } from './routes/presets.js';
import { apiHubRouter } from './routes/apiHub.js';
import { regexRouter } from './routes/regex.js';
import { refusalRouter } from './routes/refusal.js';
import { recapRouter } from './routes/recap.js';
import { stImportRouter } from './routes/stImport.js';
import { customizationRouter } from './routes/customization.js';
import { getLanAddresses } from './utils/network.js';
import { securityGuard } from './utils/auth.js';
import { getTunnelStatus } from './services/tunnel.js';
import { recordConsoleLog } from './services/consoleLogger.js';
import {
  DEFAULT_USER_DIR,
  DIST_DIR,
  ensureUserDirectories,
} from './utils/paths.js';

function openBrowser(url) {
  const platform = process.platform;
  if (platform === 'win32') {
    exec(`start "" "${url}"`);
  } else if (platform === 'darwin') {
    exec(`open "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

const app = express();
const PORT = Number(process.env.NEXUSTAVERN_SERVER_PORT) || 8088;
const CLIENT_PORT = Number(process.env.NEXUSTAVERN_CLIENT_PORT) || 5173;
const PREVIEW_PORT = 4173;
const HOST = process.env.NEXUSTAVERN_HOST || '0.0.0.0';

const ALLOWED_LOCAL_PORTS = new Set([
  String(PORT),
  String(CLIENT_PORT),
  String(PREVIEW_PORT),
]);

const EXTRA_ALLOWED_ORIGINS = new Set(
  String(process.env.NEXUSTAVERN_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, '').toLowerCase())
    .filter(Boolean),
);

function isPrivateLanIpv4(hostname) {
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  const m172 = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (m172) {
    const second = Number(m172[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

function isAllowedOrigin(rawOrigin) {
  if (!rawOrigin) return true;
  const normalized = String(rawOrigin).trim().replace(/\/+$/, '').toLowerCase();
  if (!normalized || normalized === 'null') return false;
  if (EXTRA_ALLOWED_ORIGINS.has(normalized)) return true;

  const activeTunnelUrl = getTunnelStatus(false).url;
  if (activeTunnelUrl && normalized === activeTunnelUrl.replace(/\/+$/, '').toLowerCase()) {
    return true;
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const hostname = parsed.hostname;
  const effectivePort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  if (!ALLOWED_LOCAL_PORTS.has(effectivePort)) {
    return false;
  }

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  ) {
    return true;
  }

  if (isPrivateLanIpv4(hostname)) {
    return true;
  }

  const hostLanIps = getLanAddresses();
  return hostLanIps.some((item) => item.address === hostname);
}

ensureUserDirectories();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({
      ok: false,
      error: 'Cross-origin request blocked by NexusTavern Zero-Trust CORS policy.',
    });
  }
  return next();
});

app.use(
  cors({
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-BB-Auth', 'X-BB-E2EE'],
  }),
);
app.use(express.json({ limit: '50mb' }));
app.use(securityGuard);

// Zero-Trust Static Asset Guard: block direct HTTP download of secrets.json, settings.json, raw .jsonl chats, and backups
const ALLOWED_STATIC_PREFIXES = [
  '/characters/',
  '/user avatars/',
  '/backgrounds/',
  '/thumbnails/',
  '/assets/',
  '/user/',
  '/themes/',
  '/.nexustavern/portraits/',
  '/.nexustavern/fonts/',
];

app.use('/user-data', (req, res, next) => {
  const decodedPath = decodeURIComponent(req.path || '').replace(/\\/g, '/').toLowerCase();
  const isAllowedMedia = ALLOWED_STATIC_PREFIXES.some((prefix) =>
    decodedPath.startsWith(prefix),
  );
  const isUserUploadedFile = decodedPath.startsWith('/user/files/');
  const isForbiddenFile =
    decodedPath.includes('secrets') ||
    (decodedPath.endsWith('.jsonl') && !isUserUploadedFile) ||
    decodedPath.endsWith('.settings') ||
    (decodedPath.endsWith('.json') &&
      !decodedPath.startsWith('/themes/') &&
      !isUserUploadedFile);

  if (!isAllowedMedia || isForbiddenFile) {
    return res.status(403).json({
      ok: false,
      error: 'Direct static access to configuration, chat, or secret files is forbidden (Zero-Trust Policy).',
    });
  }
  return next();
});

// Static access to user media assets (avatars, characters, backgrounds, thumbnails)
app.use(
  '/user-data',
  express.static(DEFAULT_USER_DIR, {
    maxAge: '1h',
    fallthrough: true,
  }),
);

// API Routes
app.use('/api/system', systemRouter);
app.use('/api/characters', charactersRouter);
app.use('/api/personas', personasRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/presets', presetsRouter);
app.use('/api/hub', apiHubRouter);
app.use('/api/regex', regexRouter);
app.use('/api/refusal-catcher', refusalRouter);
app.use('/api/message-recap', recapRouter);
app.use('/api/st-import', stImportRouter);
app.use('/api/customization', customizationRouter);
app.use('/api/thumbnails', thumbnailsRouter);

// Serve built frontend in production / standalone mode
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/user-data')) {
      return next();
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  const lanList = getLanAddresses();
  console.log(`\n==================================================`);
  console.log(`  NexusTavern Server Core running on port ${PORT}`);
  console.log(`  Local PC:   http://localhost:${PORT}`);
  for (const net of lanList) {
    console.log(`  LAN (${net.interface}): http://${net.address}:${PORT}`);
  }
  console.log(`  User Data:  ${DEFAULT_USER_DIR}`);
  console.log(`==================================================\n`);

  recordConsoleLog({
    category: 'system',
    level: 'success',
    scope: 'Server',
    title: `NexusTavern Server Core ready on port ${PORT}`,
    summary: `User data directory: ${DEFAULT_USER_DIR}`,
    badges: [
      { label: `Port ${PORT}`, tone: 'ok' },
      ...(lanList.length > 0
        ? [{ label: `LAN ${lanList[0].address}`, tone: 'neutral' }]
        : []),
    ],
    silentTerminal: true,
  });

  if (process.argv.includes('--open')) {
    openBrowser(`http://localhost:${PORT}`);
  }
});
