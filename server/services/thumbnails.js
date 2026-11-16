import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import { DEFAULT_USER_DIR, NEXUSTAVERN_PORTRAITS_DIR } from '../utils/paths.js';
import { isPngBuffer } from './pngCardCodec.js';
import { generatePngThumbnailBuffer } from '../workers/thumbnailWorker.js';

export { generatePngThumbnailBuffer };

export const THUMBNAILS_ROOT_DIR = path.join(DEFAULT_USER_DIR, 'thumbnails');
export const AVATAR_THUMBNAIL_DIR = path.join(THUMBNAILS_ROOT_DIR, 'avatar');
export const PERSONA_THUMBNAIL_DIR = path.join(THUMBNAILS_ROOT_DIR, 'persona');
export const AVATAR_CHAT_THUMBNAIL_DIR = path.join(THUMBNAILS_ROOT_DIR, 'avatar-chat');
export const PERSONA_CHAT_THUMBNAIL_DIR = path.join(THUMBNAILS_ROOT_DIR, 'persona-chat');
export const PORTRAIT_CHAT_THUMBNAIL_DIR = path.join(THUMBNAILS_ROOT_DIR, 'portrait-chat');

export const TARGET_THUMB_WIDTH = 160;
export const CHAT_THUMB_WIDTH = 128;
const THUMB_ENGINE_VERSION = 'v3-area-aa';
const VERSION_MARKER_PATH = path.join(THUMBNAILS_ROOT_DIR, '.thumb-engine-version');

const THUMBNAIL_DIRS = [
  AVATAR_THUMBNAIL_DIR,
  PERSONA_THUMBNAIL_DIR,
  AVATAR_CHAT_THUMBNAIL_DIR,
  PERSONA_CHAT_THUMBNAIL_DIR,
  PORTRAIT_CHAT_THUMBNAIL_DIR,
];

let dirsInitialized = false;
let dirsInitPromise = null;
const portraitSubdirsInitialized = new Set();

export function ensureThumbnailDirs() {
  if (dirsInitialized) return;
  try {
    fs.mkdirSync(THUMBNAILS_ROOT_DIR, { recursive: true });
    const currentVer = fs.existsSync(VERSION_MARKER_PATH)
      ? fs.readFileSync(VERSION_MARKER_PATH, 'utf8').trim()
      : '';
    if (currentVer !== THUMB_ENGINE_VERSION) {
      for (const dir of THUMBNAIL_DIRS) {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }
      fs.writeFileSync(VERSION_MARKER_PATH, THUMB_ENGINE_VERSION, 'utf8');
    }
    for (const dir of THUMBNAIL_DIRS) {
      fs.mkdirSync(dir, { recursive: true });
    }
    dirsInitialized = true;
  } catch {
    // ignore fs permission errors during version check
  }
}

async function ensureThumbnailDirsAsync() {
  if (dirsInitialized) return;
  if (dirsInitPromise) return dirsInitPromise;

  dirsInitPromise = (async () => {
    try {
      await fsp.mkdir(THUMBNAILS_ROOT_DIR, { recursive: true });
      let currentVer = '';
      try {
        currentVer = (await fsp.readFile(VERSION_MARKER_PATH, 'utf8')).trim();
      } catch {
        currentVer = '';
      }
      if (currentVer !== THUMB_ENGINE_VERSION) {
        await Promise.all(
          THUMBNAIL_DIRS.map((dir) =>
            fsp.rm(dir, { recursive: true, force: true }).catch(() => {}),
          ),
        );
        await fsp.writeFile(VERSION_MARKER_PATH, THUMB_ENGINE_VERSION, 'utf8');
      }
      await Promise.all(
        THUMBNAIL_DIRS.map((dir) => fsp.mkdir(dir, { recursive: true })),
      );
      dirsInitialized = true;
    } catch {
      // ignore fs permission errors during async version check
    } finally {
      dirsInitPromise = null;
    }
  })();

  return dirsInitPromise;
}

/* -------------------------------------------------------------------------- */
/* Bounded Worker Thread Pool & Concurrency Queue                             */
/* -------------------------------------------------------------------------- */

const WORKER_URL = new URL('../workers/thumbnailWorker.js', import.meta.url);
const CPU_COUNT =
  typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length || 2;
const MAX_WORKERS = Math.max(1, Math.min(4, CPU_COUNT - 1));
const WORKER_IDLE_TTL_MS = 30_000;

let nextTaskId = 1;
const workerPool = [];
const pendingWorkerTasks = [];
let activeGenerationSlots = 0;
const generationSlotWaiters = [];

function acquireGenerationSlot() {
  if (activeGenerationSlots < MAX_WORKERS) {
    activeGenerationSlots += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    generationSlotWaiters.push(resolve);
  });
}

function releaseGenerationSlot() {
  const next = generationSlotWaiters.shift();
  if (next) {
    next();
  } else {
    activeGenerationSlots = Math.max(0, activeGenerationSlots - 1);
  }
}

async function withGenerationSlot(fn) {
  await acquireGenerationSlot();
  try {
    return await fn();
  } finally {
    releaseGenerationSlot();
  }
}

function scheduleWorkerIdleCleanup(slot) {
  if (slot.idleTimer) {
    clearTimeout(slot.idleTimer);
  }
  slot.idleTimer = setTimeout(() => {
    if (!slot.busy) {
      const idx = workerPool.indexOf(slot);
      if (idx !== -1) workerPool.splice(idx, 1);
      slot.worker.terminate().catch(() => {});
    }
  }, WORKER_IDLE_TTL_MS);
  slot.idleTimer.unref?.();
}

function createWorkerSlot() {
  const worker = new Worker(WORKER_URL);
  const slot = {
    worker,
    busy: false,
    currentJob: null,
    idleTimer: null,
  };

  worker.on('message', (msg) => {
    const job = slot.currentJob;
    slot.currentJob = null;
    slot.busy = false;

    if (job) {
      if (msg?.ok && msg.data) {
        const view = msg.data;
        job.resolve(Buffer.from(view.buffer, view.byteOffset, view.byteLength));
      } else {
        job.reject(new Error(msg?.error || 'Thumbnail worker failed'));
      }
    }

    dispatchNextWorkerTask();
    if (!slot.busy) {
      worker.unref();
      scheduleWorkerIdleCleanup(slot);
    }
  });

  const handleWorkerFailure = (err) => {
    const idx = workerPool.indexOf(slot);
    if (idx !== -1) workerPool.splice(idx, 1);
    if (slot.idleTimer) clearTimeout(slot.idleTimer);
    const job = slot.currentJob;
    slot.currentJob = null;
    slot.busy = false;
    if (job) {
      job.reject(err instanceof Error ? err : new Error('Thumbnail worker exited unexpectedly'));
    }
    dispatchNextWorkerTask();
  };

  worker.on('error', handleWorkerFailure);
  worker.on('exit', (code) => {
    if (slot.currentJob || code !== 0) {
      handleWorkerFailure(new Error(`Thumbnail worker exited with code ${code}`));
    }
  });

  worker.unref();
  workerPool.push(slot);
  return slot;
}

function dispatchNextWorkerTask() {
  if (pendingWorkerTasks.length === 0) return;

  let idleSlot = workerPool.find((s) => !s.busy);
  if (!idleSlot && workerPool.length < MAX_WORKERS) {
    idleSlot = createWorkerSlot();
  }
  if (!idleSlot) return;

  const job = pendingWorkerTasks.shift();
  if (!job) return;

  if (idleSlot.idleTimer) {
    clearTimeout(idleSlot.idleTimer);
    idleSlot.idleTimer = null;
  }

  idleSlot.busy = true;
  idleSlot.currentJob = job;
  idleSlot.worker.ref();

  try {
    idleSlot.worker.postMessage(
      {
        id: job.id,
        pngData: job.transferable,
        targetWidth: job.targetWidth,
      },
      [job.transferable.buffer],
    );
  } catch (err) {
    idleSlot.currentJob = null;
    idleSlot.busy = false;
    idleSlot.worker.unref();
    scheduleWorkerIdleCleanup(idleSlot);
    job.reject(err);
    dispatchNextWorkerTask();
  }
}

function toWorkerTransferable(pngBuffer, transferInput) {
  if (
    transferInput &&
    Buffer.isBuffer(pngBuffer) &&
    pngBuffer.byteOffset === 0 &&
    pngBuffer.byteLength === pngBuffer.buffer.byteLength
  ) {
    return new Uint8Array(pngBuffer.buffer);
  }
  const copy = new Uint8Array(pngBuffer.byteLength);
  copy.set(pngBuffer);
  return copy;
}

/**
 * Offloads PNG decoding, 2D area-averaging downscaling, and zlib compression
 * to the background worker_threads pool without blocking the Express Event Loop.
 */
export function runThumbnailWorker(
  pngBuffer,
  targetWidth = TARGET_THUMB_WIDTH,
  { transferInput = false } = {},
) {
  if (!isPngBuffer(pngBuffer)) {
    return Promise.resolve(pngBuffer);
  }
  const transferable = toWorkerTransferable(pngBuffer, transferInput);
  return new Promise((resolve, reject) => {
    pendingWorkerTasks.push({
      id: nextTaskId++,
      transferable,
      targetWidth,
      resolve,
      reject,
    });
    dispatchNextWorkerTask();
  });
}

export async function shutdownThumbnailWorkers() {
  const slots = workerPool.splice(0, workerPool.length);
  await Promise.all(
    slots.map((slot) => {
      if (slot.idleTimer) clearTimeout(slot.idleTimer);
      return slot.worker.terminate().catch(() => {});
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Fast In-Memory Verified Path Cache & In-Flight Deduplication               */
/* -------------------------------------------------------------------------- */

const MAX_VERIFIED_CACHE_ENTRIES = 4096;
const VERIFIED_FAST_TTL_MS = 3_000;
const verifiedThumbnailCache = new Map();
const inFlightThumbnails = new Map();

function toCacheKey(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function setVerifiedCacheEntry(key, entry) {
  if (verifiedThumbnailCache.has(key)) {
    verifiedThumbnailCache.delete(key);
  } else if (verifiedThumbnailCache.size >= MAX_VERIFIED_CACHE_ENTRIES) {
    const oldestKey = verifiedThumbnailCache.keys().next().value;
    if (oldestKey !== undefined) {
      verifiedThumbnailCache.delete(oldestKey);
    }
  }
  verifiedThumbnailCache.set(key, entry);
}

async function statOrNull(filePath) {
  try {
    return await fsp.stat(filePath);
  } catch {
    return null;
  }
}

export function invalidateVerifiedThumbnailPath(thumbPath) {
  if (!thumbPath) return;
  verifiedThumbnailCache.delete(toCacheKey(thumbPath));
}

export function invalidateThumbnailCache(type, filename) {
  const safeName = path.basename(String(filename || ''));
  if (!safeName) return;
  const targets =
    type === 'persona'
      ? [
          path.join(PERSONA_THUMBNAIL_DIR, safeName),
          path.join(PERSONA_CHAT_THUMBNAIL_DIR, safeName),
        ]
      : [
          path.join(AVATAR_THUMBNAIL_DIR, safeName),
          path.join(AVATAR_CHAT_THUMBNAIL_DIR, safeName),
        ];
  for (const p of targets) {
    invalidateVerifiedThumbnailPath(p);
    try {
      fs.rmSync(p, { force: true });
    } catch {
      // ignore missing or locked file
    }
  }
}

export async function resolveOrGenerateThumbnail({
  srcPath,
  thumbPath,
  isPngCandidate,
  targetWidth,
  ensureDestDir,
}) {
  const cacheKey = toCacheKey(thumbPath);
  const now = Date.now();
  const cached = verifiedThumbnailCache.get(cacheKey);
  if (cached && now - cached.verifiedAt < VERIFIED_FAST_TTL_MS) {
    return cached.thumbPath;
  }

  const existingInFlight = inFlightThumbnails.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const promise = (async () => {
    await ensureThumbnailDirsAsync();
    if (ensureDestDir) {
      await ensureDestDir();
    }

    const [srcStat, thumbStat] = await Promise.all([
      statOrNull(srcPath),
      statOrNull(thumbPath),
    ]);

    if (!srcStat || !srcStat.isFile()) {
      verifiedThumbnailCache.delete(cacheKey);
      return null;
    }

    if (thumbStat && thumbStat.mtimeMs >= srcStat.mtimeMs && thumbStat.size > 0) {
      setVerifiedCacheEntry(cacheKey, {
        thumbPath,
        srcMtimeMs: srcStat.mtimeMs,
        srcSize: srcStat.size,
        verifiedAt: Date.now(),
      });
      return thumbPath;
    }

    return withGenerationSlot(async () => {
      const srcBuf = await fsp.readFile(srcPath);
      if (isPngCandidate && isPngBuffer(srcBuf)) {
        let thumbBuf;
        try {
          thumbBuf = await runThumbnailWorker(srcBuf, targetWidth, {
            transferInput: true,
          });
        } catch {
          const fallbackSrc = await fsp.readFile(srcPath);
          thumbBuf = generatePngThumbnailBuffer(fallbackSrc, targetWidth);
        }
        await writeFileAtomic(thumbPath, thumbBuf);
      } else {
        await writeFileAtomic(thumbPath, srcBuf);
      }

      setVerifiedCacheEntry(cacheKey, {
        thumbPath,
        srcMtimeMs: srcStat.mtimeMs,
        srcSize: srcStat.size,
        verifiedAt: Date.now(),
      });
      return thumbPath;
    });
  })();

  inFlightThumbnails.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    if (inFlightThumbnails.get(cacheKey) === promise) {
      inFlightThumbnails.delete(cacheKey);
    }
  }
}

/**
 * Ensures a cached thumbnail exists for a character avatar (`type = 'avatar'`)
 * or user persona (`type = 'persona'`) and returns its file path on disk.
 * When `chat = true`, generates a dedicated softer 128px chat portrait.
 */
export async function ensureThumbnailFile(type, filename, { chat = false } = {}) {
  const safeName = path.basename(String(filename || ''));
  if (!safeName) return null;

  const srcDir =
    type === 'persona'
      ? path.join(DEFAULT_USER_DIR, 'User Avatars')
      : path.join(DEFAULT_USER_DIR, 'characters');
  const thumbDir =
    type === 'persona'
      ? chat
        ? PERSONA_CHAT_THUMBNAIL_DIR
        : PERSONA_THUMBNAIL_DIR
      : chat
        ? AVATAR_CHAT_THUMBNAIL_DIR
        : AVATAR_THUMBNAIL_DIR;

  const srcPath = path.join(srcDir, safeName);
  const thumbPath = path.join(thumbDir, safeName);
  const ext = path.extname(safeName).toLowerCase();
  const targetWidth = chat ? CHAT_THUMB_WIDTH : TARGET_THUMB_WIDTH;

  return resolveOrGenerateThumbnail({
    srcPath,
    thumbPath,
    isPngCandidate: ext === '.png',
    targetWidth,
    ensureDestDir: null,
  });
}

/**
 * Ensures a smooth chat-sized thumbnail for a custom scenario/intro portrait
 * stored under `.nexustavern/portraits/<slug>/<filename>`.
 */
export async function ensureScenarioPortraitThumbnailFile(slug, filename) {
  const safeSlug = path.basename(String(slug || '')).replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeFile = path.basename(String(filename || ''));
  if (!safeSlug || !safeFile) return null;

  const srcPath = path.join(NEXUSTAVERN_PORTRAITS_DIR, safeSlug, safeFile);
  const destDir = path.join(PORTRAIT_CHAT_THUMBNAIL_DIR, safeSlug);
  const thumbPath = path.join(destDir, safeFile);

  return resolveOrGenerateThumbnail({
    srcPath,
    thumbPath,
    isPngCandidate: safeFile.toLowerCase().endsWith('.png'),
    targetWidth: CHAT_THUMB_WIDTH,
    ensureDestDir: async () => {
      if (portraitSubdirsInitialized.has(safeSlug)) return;
      await fsp.mkdir(destDir, { recursive: true });
      portraitSubdirsInitialized.add(safeSlug);
    },
  });
}

