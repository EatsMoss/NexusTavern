import crypto from 'node:crypto';

/**
 * 256-bit (32 bytes = 64 hex chars) Master Key for Mobile QR E2EE & Auth.
 * Transmitted ONLY optically via QR URL fragment (#bbkey=...), so the tunnel
 * intermediary server never sees this key in HTTP requests.
 */
let masterKeyHex = '';
let masterKeyBuffer = null;
let derivedAuthIdHex = '';
let derivedAuthIdBuffer = null;

function applyMasterKeyHex(nextHex) {
  masterKeyHex = nextHex;
  masterKeyBuffer = Buffer.from(nextHex, 'hex');
  derivedAuthIdHex = crypto
    .createHash('sha256')
    .update(`bb-auth-v1:${nextHex}`, 'utf8')
    .digest('hex');
  derivedAuthIdBuffer = Buffer.from(derivedAuthIdHex, 'utf8');
  return masterKeyHex;
}

applyMasterKeyHex(crypto.randomBytes(32).toString('hex'));

export function getMasterKeyHex() {
  return masterKeyHex;
}

export function rotateMasterKey() {
  return applyMasterKeyHex(crypto.randomBytes(32).toString('hex'));
}

/**
 * Derives a public authentication token from the master key using SHA-256('bb-auth-v1:' + masterKeyHex).
 * The phone sends this derived hash in X-BB-Auth header or query param to prove possession
 * without ever revealing the master encryption key over the network.
 */
export function getDerivedAuthId() {
  return derivedAuthIdHex;
}

/**
 * Constant-time verification of a client-supplied authentication token against the derived SHA-256 token.
 */
export function isValidAuthToken(candidate) {
  if (typeof candidate !== 'string' || candidate.length !== derivedAuthIdBuffer.length) {
    return false;
  }
  const candidateBuf = Buffer.from(candidate, 'utf8');
  if (candidateBuf.length !== derivedAuthIdBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(candidateBuf, derivedAuthIdBuffer);
}

function getMasterKeyBuffer() {
  return masterKeyBuffer;
}

/**
 * Encrypts any JSON-serializable payload using AES-256-GCM compatible with Web Crypto API.
 * Web Crypto AES-GCM expects ciphertext + 16-byte authTag concatenated.
 */
export function encryptJsonPayload(payload) {
  const iv = crypto.randomBytes(12);
  const key = getMasterKeyBuffer();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([encrypted, authTag]);

  return {
    e2ee: true,
    alg: 'AES-256-GCM',
    iv: iv.toString('base64'),
    data: combined.toString('base64'),
  };
}

/**
 * Decrypts an AES-256-GCM envelope sent from the mobile Web Crypto API client.
 */
export function decryptJsonPayload(envelope) {
  if (!envelope || !envelope.e2ee || !envelope.iv || !envelope.data) {
    throw new Error('Invalid E2EE envelope');
  }
  const iv = Buffer.from(envelope.iv, 'base64');
  const combined = Buffer.from(envelope.data, 'base64');
  if (combined.length < 16) {
    throw new Error('Ciphertext too short');
  }

  const authTag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(0, combined.length - 16);

  const key = getMasterKeyBuffer();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * Checks whether the incoming request originates directly from the host PC
 * (and NOT forwarded through an external tunnel proxy).
 */
export function isLocalHostRequest(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const host = String(req.headers.host || '').toLowerCase();

  if (forwardedFor || forwardedHost) {
    return false;
  }

  if (host.endsWith('.lhr.life') || host.endsWith('.trycloudflare.com')) {
    return false;
  }

  const remoteAddr = req.socket?.remoteAddress || '';
  return (
    remoteAddr === '127.0.0.1' ||
    remoteAddr === '::1' ||
    remoteAddr === '::ffff:127.0.0.1'
  );
}

/**
 * Security & End-to-End Encryption (E2EE) Middleware:
 * - Static HTML/JS/CSS shells are served so the phone browser can boot and read #bbkey=... from the URL hash.
 * - All /api/* and /user-data/* requests from non-localhost MUST carry a valid X-BB-Auth header (derived SHA-256).
 * - When X-BB-E2EE: 1 is present, incoming encrypted JSON bodies are decrypted transparently,
 *   and outgoing res.json() responses are encrypted with AES-256-GCM so the tunnel server sees only ciphertext.
 */
export function securityGuard(req, res, next) {
  if (isLocalHostRequest(req)) {
    return next();
  }

  const isApiOrData =
    req.path.startsWith('/api/') || req.path.startsWith('/user-data/');

  // Allow static app shell (index.html, JS/CSS bundles) to load so client JS can read #bbkey from URL hash
  if (!isApiOrData) {
    return next();
  }

  const clientAuthHeader = req.headers['x-bb-auth'];
  const queryAuth = req.query?.auth;

  if (!isValidAuthToken(clientAuthHeader) && !isValidAuthToken(queryAuth)) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized. Scan the active QR code displayed on the host PC.',
    });
  }

  // Decrypt incoming E2EE request body if encrypted
  if (req.body && req.body.e2ee === true) {
    try {
      req.body = decryptJsonPayload(req.body);
    } catch {
      return res.status(400).json({
        ok: false,
        error: 'Failed to decrypt E2EE payload. Please rescan the QR code.',
      });
    }
  }

  // Wrap res.json to encrypt outgoing API responses with AES-256-GCM when requested by mobile client
  if (req.headers['x-bb-e2ee'] === '1') {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (body && body.e2ee === true) {
        return originalJson(body);
      }
      const encryptedEnvelope = encryptJsonPayload(body);
      return originalJson(encryptedEnvelope);
    };
  }

  return next();
}

