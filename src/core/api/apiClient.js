const STORAGE_KEY = 'bb_e2ee_master_key';

/**
 * Captures #bbkey=<64-hex> from URL hash on mobile QR scan, saves it in localStorage,
 * and immediately strips the hash from the address bar so it never leaks.
 */
export function initMobileE2EEKeyFromUrl() {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash || '';
  const match = hash.match(/bbkey=([a-fA-F0-9]{64})/);
  if (match) {
    const keyHex = match[1].toLowerCase();
    try {
      window.localStorage.setItem(STORAGE_KEY, keyHex);
    } catch {
      // ignore storage errors
    }
    // Strip secret hash from browser address bar
    const cleanUrl = window.location.pathname + window.location.search;
    window.history.replaceState(null, '', cleanUrl);
    return keyHex;
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function hasMobileE2EEKey() {
  return Boolean(initMobileE2EEKeyFromUrl());
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function base64ToBytes(b64) {
  const binString = window.atob(b64);
  const len = binString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binString.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes) {
  let binString = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binString += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binString);
}

let cachedAuthIdHex = null;

async function deriveAuthIdHex(masterKeyHex) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`bb-auth-v1:${masterKeyHex}`);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  cachedAuthIdHex = bytesToHex(new Uint8Array(hashBuffer));
  return cachedAuthIdHex;
}

/**
 * Appends `?auth=<derivedAuthId>` to image/thumbnail URLs when accessed over the remote mobile tunnel.
 */
export function getAuthorizedAssetUrl(url) {
  if (!url || typeof window === 'undefined') return url;
  const isLocalHost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  if (isLocalHost || !cachedAuthIdHex) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}auth=${cachedAuthIdHex}`;
}

async function importAesKey(masterKeyHex) {
  const rawKey = hexToBytes(masterKeyHex);
  return window.crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptPayloadClient(payload, masterKeyHex) {
  const aesKey = await importAesKey(masterKeyHex);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded,
  );

  return {
    e2ee: true,
    alg: 'AES-256-GCM',
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(cipherBuffer)),
  };
}

async function decryptPayloadClient(envelope, masterKeyHex) {
  const aesKey = await importAesKey(masterKeyHex);
  const iv = base64ToBytes(envelope.iv);
  const cipherBytes = base64ToBytes(envelope.data);
  const plainBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    cipherBytes,
  );
  const text = new TextDecoder().decode(plainBuffer);
  return JSON.parse(text);
}

/**
 * Universal API JSON fetcher:
 * - On Local PC (localhost / 127.0.0.1): zero-overhead direct fetch.
 * - On Mobile Tunnel: attaches derived SHA-256 auth header and encrypts/decrypts
 *   all JSON payloads end-to-end with AES-256-GCM using the optical QR key.
 */
export async function apiFetchJson(url, options = {}) {
  const masterKeyHex = initMobileE2EEKeyFromUrl();
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  const headers = {
    ...(options.headers || {}),
  };

  let body = options.body;

  if (!isLocalHost && masterKeyHex && window.crypto?.subtle) {
    const authId = await deriveAuthIdHex(masterKeyHex);
    headers['X-BB-Auth'] = authId;
    headers['X-BB-E2EE'] = '1';

    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      const encryptedBody = await encryptPayloadClient(body, masterKeyHex);
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(encryptedBody);
    } else if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        const encryptedBody = await encryptPayloadClient(parsed, masterKeyHex);
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(encryptedBody);
      } catch {
        // leave non-JSON string as is
      }
    }
  } else if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  } else if (typeof body === 'string' && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  if (data && data.e2ee === true && masterKeyHex && window.crypto?.subtle) {
    return decryptPayloadClient(data, masterKeyHex);
  }

  return data;
}

/**
 * Universal SSE stream consumer (`POST` or `GET` returning `text/event-stream`).
 * Transparently supports both direct localhost streaming and E2EE mobile tunnel decryption.
 */
export async function apiFetchSse(url, { body: rawBody, signal, onEvent, headers: extraHeaders } = {}) {
  const masterKeyHex = initMobileE2EEKeyFromUrl();
  const isLocalHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const headers = {
    Accept: 'text/event-stream',
    ...(extraHeaders || {}),
  };

  let body = rawBody;
  const useE2EE = Boolean(!isLocalHost && masterKeyHex && window.crypto?.subtle);

  if (useE2EE) {
    const authId = await deriveAuthIdHex(masterKeyHex);
    headers['X-BB-Auth'] = authId;
    headers['X-BB-E2EE'] = '1';
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      const encryptedBody = await encryptPayloadClient(body, masterKeyHex);
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(encryptedBody);
    }
  } else if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => null);
    throw new Error(errData?.error || `HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Streaming response body is empty');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const dispatchDataLine = async (dataStr) => {
    if (!dataStr || dataStr === '[DONE]') return;
    let parsed = null;
    try {
      parsed = JSON.parse(dataStr);
    } catch {
      return;
    }
    if (parsed && parsed.e2ee === true && useE2EE) {
      parsed = await decryptPayloadClient(parsed, masterKeyHex);
    }
    if (parsed && typeof onEvent === 'function') {
      onEvent(parsed);
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data:')) continue;
        await dispatchDataLine(line.slice(5).trim());
      }
    }

    const tail = buffer.trim();
    if (tail.startsWith('data:')) {
      await dispatchDataLine(tail.slice(5).trim());
    }
  } finally {
    reader.releaseLock();
  }
}

