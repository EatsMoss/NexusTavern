import fs from 'node:fs';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';

const perFileQueues = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWindowsRenameContention(err) {
  const code = err?.code;
  return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
}

/**
 * Windows-hardened atomic file writer:
 * 1. Serializes concurrent writes to the same normalized file path in-process.
 * 2. Retries `writeFileAtomic` with short backoff when Windows Defender / VS Code watcher / readers
 *    momentarily hold a handle and trigger `EPERM` / `EBUSY` on `rename`.
 * 3. Falls back to direct `fs.promises.writeFile` if `rename` remains blocked on Windows.
 */
export function safeWriteFileAtomic(filePath, data, options = 'utf8') {
  const key = path.resolve(filePath).toLowerCase();
  const prev = perFileQueues.get(key) || Promise.resolve();

  const run = prev.then(
    () => performWriteWithRetry(filePath, data, options),
    () => performWriteWithRetry(filePath, data, options),
  );

  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  perFileQueues.set(key, settled);
  settled.finally(() => {
    if (perFileQueues.get(key) === settled) {
      perFileQueues.delete(key);
    }
  });

  return run;
}

async function performWriteWithRetry(filePath, data, options) {
  const delays = [25, 60, 130, 240];
  let lastErr = null;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      await writeFileAtomic(filePath, data, options);
      return;
    } catch (err) {
      lastErr = err;
      if (!isWindowsRenameContention(err)) {
        throw err;
      }
      if (attempt < delays.length) {
        await sleep(delays[attempt]);
      }
    }
  }

  // Final Windows fallback when an external watcher blocks atomic `rename` indefinitely
  if (process.platform === 'win32' && isWindowsRenameContention(lastErr)) {
    const writeOpts =
      typeof options === 'string'
        ? { encoding: options }
        : options && typeof options === 'object'
          ? options
          : undefined;
    await fs.promises.writeFile(filePath, data, writeOpts);
    return;
  }

  throw lastErr;
}
