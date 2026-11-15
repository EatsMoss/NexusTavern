import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import QRCode from 'qrcode';
import { getMasterKeyHex, rotateMasterKey } from '../utils/auth.js';
import { DEFAULT_USER_DIR } from '../utils/paths.js';

const LHR_URL_REGEX = /https:\/\/[a-zA-Z0-9-]+\.lhr\.life/;
const SSH_KEY_PATH = path.join(DEFAULT_USER_DIR, 'user', 'tunnel_ed25519');

function ensureTunnelSshKey() {
  try {
    const keyDir = path.dirname(SSH_KEY_PATH);
    if (!fs.existsSync(keyDir)) {
      fs.mkdirSync(keyDir, { recursive: true });
    }
    if (!fs.existsSync(SSH_KEY_PATH)) {
      execFileSync(
        'ssh-keygen',
        ['-t', 'ed25519', '-f', SSH_KEY_PATH, '-N', '', '-q'],
        { windowsHide: true },
      );
    }
    return fs.existsSync(SSH_KEY_PATH) ? SSH_KEY_PATH : null;
  } catch {
    return null;
  }
}

const tunnelState = {
  active: false,
  desired: false,
  status: 'idle', // 'idle' | 'starting' | 'online' | 'reconnecting' | 'error'
  url: null,
  authorizedUrl: null,
  targetPort: 8088,
  targetUrl: null,
  qrSvg: null,
  error: null,
  startedAt: null,
  childProcess: null,
  reconnectTimer: null,
  logs: [],
};

async function generateQrSvg(url) {
  if (!url) return null;
  try {
    return await QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      width: 196,
      color: {
        dark: '#ece2d0',
        light: '#1e1916',
      },
    });
  } catch {
    return null;
  }
}

export function getTunnelStatus(includeAuthSecret = false) {
  return {
    active: tunnelState.active,
    desired: tunnelState.desired,
    status: tunnelState.status,
    url: tunnelState.url,
    authorizedUrl: includeAuthSecret ? tunnelState.authorizedUrl : null,
    targetUrl: tunnelState.targetUrl,
    qrSvg: includeAuthSecret ? tunnelState.qrSvg : null,
    error: tunnelState.error,
    startedAt: tunnelState.startedAt,
  };
}

export async function stopTunnel() {
  tunnelState.desired = false;
  if (tunnelState.reconnectTimer) {
    clearTimeout(tunnelState.reconnectTimer);
    tunnelState.reconnectTimer = null;
  }
  if (tunnelState.childProcess) {
    const proc = tunnelState.childProcess;
    tunnelState.childProcess = null;
    try {
      proc.kill();
    } catch {
      // ignore kill error
    }
  }
  tunnelState.active = false;
  tunnelState.status = 'idle';
  tunnelState.url = null;
  tunnelState.authorizedUrl = null;
  tunnelState.qrSvg = null;
  tunnelState.error = null;
  tunnelState.startedAt = null;
  return getTunnelStatus(true);
}

function scheduleReconnect() {
  if (!tunnelState.desired || tunnelState.reconnectTimer) return;
  tunnelState.status = 'reconnecting';
  tunnelState.active = false;
  tunnelState.reconnectTimer = setTimeout(() => {
    tunnelState.reconnectTimer = null;
    if (tunnelState.desired) {
      spawnSshTunnel(tunnelState.targetPort);
    }
  }, 2500);
}

function spawnSshTunnel(targetPort) {
  const targetUrl = `http://127.0.0.1:${targetPort}`;
  tunnelState.targetPort = targetPort;
  tunnelState.targetUrl = targetUrl;

  return new Promise((resolve) => {
    let resolved = false;

    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve(getTunnelStatus(true));
      }
    };

    const activateUrl = async (publicUrl) => {
      if (tunnelState.active && tunnelState.url === publicUrl) return;
      const masterKey = getMasterKeyHex();
      // Optical-only key inside URL #hash — never sent over HTTP to tunnel proxy
      const authUrl = `${publicUrl}/#bbkey=${masterKey}`;
      tunnelState.url = publicUrl;
      tunnelState.authorizedUrl = authUrl;
      tunnelState.active = true;
      tunnelState.status = 'online';
      tunnelState.error = null;
      tunnelState.startedAt = new Date().toISOString();
      tunnelState.qrSvg = await generateQrSvg(authUrl);
      console.log(`\n  [NexusTavern E2EE Tunnel] Mobile access ready: ${publicUrl}\n`);
      finish();
    };

    const sshArgs = [
      '-T',
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'ServerAliveInterval=15',
      '-o',
      'ServerAliveCountMax=6',
      '-o',
      'TCPKeepAlive=yes',
      '-o',
      'ExitOnForwardFailure=yes',
    ];

    const keyFile = ensureTunnelSshKey();
    if (keyFile) {
      sshArgs.push('-i', keyFile);
    }

    sshArgs.push('-R', `80:127.0.0.1:${targetPort}`, 'nokey@localhost.run');

    const child = spawn('ssh', sshArgs, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    tunnelState.childProcess = child;

    const handleOutput = (chunk) => {
      const text = chunk.toString('utf8');
      const lines = text.split(/\r?\n/).filter(Boolean);
      tunnelState.logs.push(...lines);
      if (tunnelState.logs.length > 30) {
        tunnelState.logs = tunnelState.logs.slice(-30);
      }

      const match = text.match(LHR_URL_REGEX);
      if (match) {
        activateUrl(match[0]);
      }
    };

    child.stdout.on('data', handleOutput);
    child.stderr.on('data', handleOutput);

    child.on('error', (err) => {
      tunnelState.active = false;
      tunnelState.status = 'error';
      tunnelState.error = err.message || 'Failed to start SSH tunnel';
      finish();
      scheduleReconnect();
    });

    child.on('exit', () => {
      if (tunnelState.childProcess === child) {
        tunnelState.childProcess = null;
        tunnelState.active = false;
        finish();
        if (tunnelState.desired) {
          scheduleReconnect();
        }
      }
    });

    setTimeout(() => {
      if (!tunnelState.url && tunnelState.status === 'starting') {
        finish();
      }
    }, 10000);
  });
}

export async function startTunnel(targetPort = 8088, rotateToken = false) {
  if (rotateToken) {
    rotateMasterKey();
  }
  if (tunnelState.status === 'starting' || (tunnelState.active && tunnelState.url && !rotateToken)) {
    return getTunnelStatus(true);
  }

  await stopTunnel();
  tunnelState.desired = true;
  tunnelState.status = 'starting';
  tunnelState.error = null;
  tunnelState.logs = [];

  return spawnSshTunnel(targetPort);
}

process.on('exit', () => {
  if (tunnelState.childProcess) {
    try {
      tunnelState.childProcess.kill();
    } catch {
      // ignore
    }
  }
});


