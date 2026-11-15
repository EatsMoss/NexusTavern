import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import express from 'express';
import cors from 'cors';
import { Router } from 'express';
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
import { getLanAddresses } from './utils/network.js';
import { securityGuard } from './utils/auth.js';
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
const HOST = process.env.NEXUSTAVERN_HOST || '0.0.0.0';

ensureUserDirectories();

app.use(cors());
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
