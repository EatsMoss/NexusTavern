import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import {
  DEFAULT_USER_DIR,
  NEXUSTAVERN_ST_IMPORTER_FILE,
} from '../utils/paths.js';

export const BACKGROUND_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.mp4',
  '.webm',
  '.avif',
]);

export const CARD_EXTENSIONS = new Set(['.png', '.json']);
export const PERSONA_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const IGNORED_DATA_SUBDIRS = new Set([
  '_cache',
  '_storage',
  '_uploads',
  '_webpack',
  'node_modules',
  '.git',
  '.nexustavern',
]);

export function normalizeFsComparePath(targetPath) {
  try {
    const real = fs.existsSync(targetPath)
      ? fs.realpathSync(targetPath)
      : path.resolve(targetPath);
    return process.platform === 'win32' ? real.toLowerCase() : real;
  } catch {
    const resolved = path.resolve(targetPath);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }
}

export function cleanInputPath(rawPath = '') {
  return String(rawPath || '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
}

export function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function looksLikeStUserProfileDir(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return false;
  try {
    if (!fs.statSync(dirPath).isDirectory()) return false;
  } catch {
    return false;
  }
  const markers = ['settings.json', 'characters', 'chats', 'backgrounds', 'User Avatars'];
  let hits = 0;
  for (const marker of markers) {
    if (fs.existsSync(path.join(dirPath, marker))) hits += 1;
  }
  return fs.existsSync(path.join(dirPath, 'settings.json')) || hits >= 2;
}

function listProfilesInsideDataDir(dataDirPath) {
  if (!fs.existsSync(dataDirPath)) return [];
  let entries;
  try {
    entries = fs.readdirSync(dataDirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const profiles = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (!name || name.startsWith('.') || name.startsWith('_')) continue;
    if (IGNORED_DATA_SUBDIRS.has(name.toLowerCase())) continue;

    const fullPath = path.join(dataDirPath, name);
    if (looksLikeStUserProfileDir(fullPath)) {
      profiles.push({
        id: name,
        label: name === 'default-user' ? 'default-user (Primary)' : name,
        path: fullPath,
      });
    }
  }

  profiles.sort((a, b) => {
    if (a.id === 'default-user') return -1;
    if (b.id === 'default-user') return 1;
    return a.id.localeCompare(b.id);
  });

  return profiles;
}

export function resolveStRootAndProfiles(rawInputPath) {
  const cleaned = cleanInputPath(rawInputPath);
  if (!cleaned) {
    throw new Error('Please enter or select a SillyTavern root directory.');
  }

  const resolvedInput = path.resolve(cleaned);
  if (!fs.existsSync(resolvedInput)) {
    throw new Error(`Directory does not exist: ${resolvedInput}`);
  }

  let stat;
  try {
    stat = fs.statSync(resolvedInput);
  } catch {
    throw new Error(`Unable to access directory: ${resolvedInput}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${resolvedInput}`);
  }

  const nestedDataDir = path.join(resolvedInput, 'data');
  if (fs.existsSync(nestedDataDir)) {
    const profiles = listProfilesInsideDataDir(nestedDataDir);
    if (profiles.length > 0) {
      return { resolvedRoot: resolvedInput, mode: 'st-root', profiles };
    }
  }

  const directDataProfiles = listProfilesInsideDataDir(resolvedInput);
  if (directDataProfiles.length > 0) {
    return { resolvedRoot: resolvedInput, mode: 'data-dir', profiles: directDataProfiles };
  }

  if (looksLikeStUserProfileDir(resolvedInput)) {
    const folderName = path.basename(resolvedInput) || 'default-user';
    return {
      resolvedRoot: resolvedInput,
      mode: 'profile-dir',
      profiles: [{ id: folderName, label: folderName, path: resolvedInput }],
    };
  }

  const legacyPublicDir = path.join(resolvedInput, 'public');
  if (looksLikeStUserProfileDir(legacyPublicDir)) {
    return {
      resolvedRoot: resolvedInput,
      mode: 'legacy-public',
      profiles: [{ id: 'public', label: 'public (Legacy SillyTavern)', path: legacyPublicDir }],
    };
  }

  throw new Error(
    'No SillyTavern user data found here. Select the SillyTavern root folder (containing data/default-user).',
  );
}


export function listFlatFiles(dirPath, allowedExts = null) {
  if (!fs.existsSync(dirPath)) return [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => {
        if (!entry.isFile() || entry.name === '.gitkeep') return false;
        if (!allowedExts) return true;
        return allowedExts.has(path.extname(entry.name).toLowerCase());
      })
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export function collectRecursiveFiles(rootDir, allowedExts = null) {
  if (!fs.existsSync(rootDir)) return [];
  const collected = [];

  function walk(currentDir, relPrefix) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === '.gitkeep') continue;
      const absPath = path.join(currentDir, entry.name);
      const relPath = relPrefix ? path.join(relPrefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(absPath, relPath);
      } else if (entry.isFile()) {
        if (!allowedExts || allowedExts.has(path.extname(entry.name).toLowerCase())) {
          collected.push({ absPath, relPath, fileName: entry.name });
        }
      }
    }
  }

  walk(rootDir, '');
  return collected;
}

export function readImporterPersistedState() {
  const fallback = {
    lastRootPath: '',
    lastProfile: 'default-user',
    lastScan: null,
    lastReport: null,
  };
  const parsed = readJsonSafe(NEXUSTAVERN_ST_IMPORTER_FILE);
  if (!parsed || typeof parsed !== 'object') return fallback;
  return {
    lastRootPath: typeof parsed.lastRootPath === 'string' ? parsed.lastRootPath : '',
    lastProfile: typeof parsed.lastProfile === 'string' ? parsed.lastProfile : 'default-user',
    lastScan: parsed.lastScan && typeof parsed.lastScan === 'object' ? parsed.lastScan : null,
    lastReport:
      parsed.lastReport && typeof parsed.lastReport === 'object' ? parsed.lastReport : null,
  };
}

export async function clearImporterPersistedState() {
  if (fs.existsSync(NEXUSTAVERN_ST_IMPORTER_FILE)) {
    fs.rmSync(NEXUSTAVERN_ST_IMPORTER_FILE, { force: true });
  }
  return readImporterPersistedState();
}

export async function writeImporterPersistedState(patch = {}) {
  const current = readImporterPersistedState();
  const next = { ...current, ...patch };
  const dir = path.dirname(NEXUSTAVERN_ST_IMPORTER_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  await writeFileAtomic(NEXUSTAVERN_ST_IMPORTER_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

let activeBrowseProcess = null;

function resolveWindowsPowerShellExe() {
  const sysRoot = process.env.SystemRoot || 'C:\\Windows';
  const fullPath = path.join(
    sysRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  return fs.existsSync(fullPath) ? fullPath : 'powershell.exe';
}

function killActiveBrowseProcess() {
  const proc = activeBrowseProcess;
  if (!proc) return;
  activeBrowseProcess = null;
  try {
    proc.kill();
  } catch {
    // ignore already-exited child process
  }
}

function browseWindowsFolderDialog(validStart, signal) {
  const psExe = resolveWindowsPowerShellExe();
  const psScript = [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName Microsoft.VisualBasic',
    '[System.Windows.Forms.Application]::EnableVisualStyles()',
    '$dummy = New-Object System.Windows.Forms.Form; $dummy.Opacity = 0; $dummy.ShowInTaskbar = $false; $dummy.Width = 1; $dummy.Height = 1; $dummy.Show(); $dummy.Close(); $dummy.Dispose()',
    '$owner = New-Object System.Windows.Forms.Form',
    '$owner.Text = "Select SillyTavern Root Directory"',
    '$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen',
    '$owner.Width = 1; $owner.Height = 1',
    '$owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedToolWindow',
    '$owner.Opacity = 0.01',
    '$owner.ShowInTaskbar = $true',
    '$owner.TopMost = $true',
    '$owner.Show()',
    '$owner.TopMost = $false; $owner.TopMost = $true',
    '$owner.BringToFront(); $owner.Activate()',
    'try { [Microsoft.VisualBasic.Interaction]::AppActivate($PID) | Out-Null } catch {}',
    '$dlg = New-Object System.Windows.Forms.FolderBrowserDialog',
    '$dlg.Description = "Select SillyTavern Root Directory"',
    '$dlg.ShowNewFolderButton = $false',
    'if ($dlg.PSObject.Properties["AutoUpgradeEnabled"]) { $dlg.AutoUpgradeEnabled = $true }',
    'if ($env:BB_ST_INIT_DIR -and (Test-Path -LiteralPath $env:BB_ST_INIT_DIR)) { $dlg.SelectedPath = $env:BB_ST_INIT_DIR }',
    '$res = $dlg.ShowDialog($owner)',
    '$owner.Close(); $owner.Dispose()',
    'if ($res -eq [System.Windows.Forms.DialogResult]::OK -and $dlg.SelectedPath) {',
    '  $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($dlg.SelectedPath))',
    '  Write-Output ("BB_PATH_B64:" + $b64)',
    '}',
  ].join('; ');

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      resolve({ canceled: true, path: '' });
      return;
    }

    let settled = false;
    let stdout = '';
    let stderr = '';

    const child = spawn(psExe, ['-NoProfile', '-STA', '-Command', psScript], {
      env: { ...process.env, BB_ST_INIT_DIR: validStart },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    activeBrowseProcess = child;

    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (activeBrowseProcess === child) activeBrowseProcess = null;
      fn();
    };

    const onAbort = () => {
      try { child.kill(); } catch { /* ignore */ }
      finish(() => resolve({ canceled: true, path: '' }));
    };

    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      finish(() => resolve({ canceled: true, path: '' }));
    }, 120000);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', (err) => {
      finish(() => reject(new Error(`Failed to open system folder picker: ${err.message}`)));
    });
    child.on('close', (code) => {
      finish(() => {
        const match = stdout.match(/BB_PATH_B64:([A-Za-z0-9+/=]+)/);
        if (match && match[1]) {
          const decoded = Buffer.from(match[1], 'base64').toString('utf8').trim();
          resolve({ canceled: !decoded, path: decoded || '' });
          return;
        }
        if (code !== 0 && stderr.trim()) {
          reject(new Error(`Failed to open system folder picker: ${stderr.trim()}`));
          return;
        }
        resolve({ canceled: true, path: '' });
      });
    });
  });
}

export function browseStDirectoryDialog(initialPath = '', { signal } = {}) {
  const cleanStart = cleanInputPath(initialPath);
  const validStart =
    cleanStart && fs.existsSync(cleanStart) ? path.resolve(cleanStart) : '';

  killActiveBrowseProcess();

  if (process.platform === 'win32') {
    return browseWindowsFolderDialog(validStart, signal);
  }

  if (process.platform === 'darwin') {
    const appleScript =
      'POSIX path of (choose folder with prompt "Select SillyTavern Root Directory")';
    return new Promise((resolve) => {
      const child = execFile(
        'osascript',
        ['-e', appleScript],
        { timeout: 120000 },
        (err, stdout) => {
          if (activeBrowseProcess === child) activeBrowseProcess = null;
          if (err) return resolve({ canceled: true, path: '' });
          const picked = String(stdout || '').trim();
          return resolve({ canceled: !picked, path: picked });
        },
      );
      activeBrowseProcess = child;
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            try { child.kill(); } catch { /* ignore */ }
            resolve({ canceled: true, path: '' });
          },
          { once: true },
        );
      }
    });
  }

  return new Promise((resolve) => {
    const child = execFile(
      'zenity',
      ['--file-selection', '--directory', '--title=Select SillyTavern Root Directory'],
      { timeout: 120000 },
      (err, stdout) => {
        if (activeBrowseProcess === child) activeBrowseProcess = null;
        if (err) return resolve({ canceled: true, path: '' });
        const picked = String(stdout || '').trim();
        return resolve({ canceled: !picked, path: picked });
      },
    );
    activeBrowseProcess = child;
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          try { child.kill(); } catch { /* ignore */ }
          resolve({ canceled: true, path: '' });
        },
        { once: true },
      );
    }
  });
}

export async function scanStDirectory(rawInputPath, requestedProfile = '') {
  const { resolvedRoot, mode, profiles } = resolveStRootAndProfiles(rawInputPath);
  const chosenProfile =
    profiles.find((p) => p.id === requestedProfile) || profiles[0];
  if (!chosenProfile) {
    throw new Error('No valid SillyTavern user profile found.');
  }

  const sourceProfileDir = chosenProfile.path;
  if (normalizeFsComparePath(sourceProfileDir) === normalizeFsComparePath(DEFAULT_USER_DIR)) {
    throw new Error(
      'Selected directory points to this NexusTavern workspace itself. Please select an external SillyTavern installation.',
    );
  }

  const sourceSettings = readJsonSafe(path.join(sourceProfileDir, 'settings.json')) || {};
  const backgroundFiles = listFlatFiles(
    path.join(sourceProfileDir, 'backgrounds'),
    BACKGROUND_EXTENSIONS,
  );
  const cardFiles = listFlatFiles(
    path.join(sourceProfileDir, 'characters'),
    CARD_EXTENSIONS,
  );
  const groupFiles = listFlatFiles(
    path.join(sourceProfileDir, 'groups'),
    new Set(['.json']),
  );
  const personaAvatarFiles = listFlatFiles(
    path.join(sourceProfileDir, 'User Avatars'),
    PERSONA_IMAGE_EXTENSIONS,
  );

  const personasMap =
    sourceSettings?.power_user?.personas &&
    typeof sourceSettings.power_user.personas === 'object'
      ? sourceSettings.power_user.personas
      : {};
  const uniquePersonaKeys = new Set([
    ...Object.keys(personasMap),
    ...personaAvatarFiles,
  ]);

  const rawTags = Array.isArray(sourceSettings?.tags) ? sourceSettings.tags : [];
  const rawRegex = Array.isArray(sourceSettings?.extension_settings?.regex)
    ? sourceSettings.extension_settings.regex.filter((r) => r && typeof r === 'object')
    : [];

  const chatJsonlEntries = collectRecursiveFiles(
    path.join(sourceProfileDir, 'chats'),
    new Set(['.jsonl']),
  );
  const chatFolderSet = new Set(
    chatJsonlEntries
      .map((item) => path.dirname(item.relPath))
      .filter((dir) => dir && dir !== '.'),
  );
  const groupChatEntries = listFlatFiles(
    path.join(sourceProfileDir, 'group chats'),
    new Set(['.jsonl']),
  );
  const userImageAttachments = collectRecursiveFiles(
    path.join(sourceProfileDir, 'user', 'images'),
    null,
  );
  const userFileAttachments = collectRecursiveFiles(
    path.join(sourceProfileDir, 'user', 'files'),
    null,
  );

  const scanSummary = {
    resolvedRoot,
    mode,
    activeProfile: chosenProfile.id,
    profilePath: sourceProfileDir,
    profiles: profiles.map(({ id, label }) => ({ id, label })),
    scannedAt: new Date().toISOString(),
    counts: {
      backgrounds: {
        total: backgroundFiles.length,
      },
      characters: {
        total: cardFiles.length,
        cards: cardFiles.length,
        tags: rawTags.length,
        groups: groupFiles.length,
      },
      personas: {
        total: uniquePersonaKeys.size,
        avatars: personaAvatarFiles.length,
        configured: Object.keys(personasMap).length,
      },
      regex: {
        total: rawRegex.length,
      },
      chats: {
        total: chatJsonlEntries.length + groupChatEntries.length,
        characterChats: chatJsonlEntries.length,
        chatFolders: chatFolderSet.size,
        groupChats: groupChatEntries.length,
        attachments: userImageAttachments.length + userFileAttachments.length,
      },
    },
  };

  await writeImporterPersistedState({
    lastRootPath: resolvedRoot,
    lastProfile: chosenProfile.id,
    lastScan: scanSummary,
  });

  return scanSummary;
}

