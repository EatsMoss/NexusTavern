import fs from 'node:fs';
import path from 'node:path';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import { DEFAULT_USER_DIR } from '../utils/paths.js';

export const SECRETS_FILE_PATH = path.join(DEFAULT_USER_DIR, 'secrets.json');

/**
 * Canonical SillyTavern secret keys stored in `data/default-user/secrets.json`.
 */
export const SECRET_PROVIDERS = [
  { key: 'api_key_openai', id: 'openai', label: 'OpenAI API Key', placeholder: 'sk-...' },
  { key: 'api_key_claude', id: 'claude', label: 'Anthropic Claude Key', placeholder: 'sk-ant-...' },
  { key: 'api_key_openrouter', id: 'openrouter', label: 'OpenRouter API Key', placeholder: 'sk-or-v1-...' },
  { key: 'api_key_makersuite', id: 'makersuite', label: 'Google AI Studio (Gemini) Key', placeholder: 'AIzaSy...' },
  { key: 'api_key_deepseek', id: 'deepseek', label: 'DeepSeek API Key', placeholder: 'sk-...' },
  { key: 'api_key_groq', id: 'groq', label: 'Groq API Key', placeholder: 'gsk_...' },
  { key: 'api_key_mistralai', id: 'mistralai', label: 'Mistral AI Key', placeholder: '...' },
  { key: 'api_key_xai', id: 'xai', label: 'xAI (Grok) Key', placeholder: 'xai-...' },
  { key: 'api_key_cohere', id: 'cohere', label: 'Cohere API Key', placeholder: '...' },
  { key: 'api_key_perplexity', id: 'perplexity', label: 'Perplexity API Key', placeholder: 'pplx-...' },
  { key: 'api_key_custom', id: 'custom', label: 'Custom OpenAI-Compatible Key', placeholder: 'sk-...' },
  { key: 'api_key_novel', id: 'novel', label: 'NovelAI API Key', placeholder: 'pst-...' },
  { key: 'api_key_kobold', id: 'kobold', label: 'KoboldAI / Horde Key', placeholder: '0000000000' },
  { key: 'api_key_zai', id: 'zai', label: 'Z.AI API Key', placeholder: '...' },
];

/**
 * Sentinel value used to indicate that a masked secret field was not modified by the client.
 */
export const MASKED_SECRET_SENTINEL = '__NEXUSTAVERN_MASKED_SECRET__';

/**
 * Masks any secret string so only a short prefix and last 4 characters are visible.
 * Never returns the raw secret value.
 */
export function maskSecretString(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}••••`;
  }
  const prefix = trimmed.slice(0, Math.min(5, trimmed.length - 4));
  const suffix = trimmed.slice(-4);
  return `${prefix}••••${suffix}`;
}

/**
 * Internal server-only reader for `secrets.json`.
 * MUST NEVER be exposed directly to client responses.
 */
export function readRawSecretsServerOnly() {
  if (!fs.existsSync(SECRETS_FILE_PATH)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(SECRETS_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Internal server-only writer for `secrets.json` with restrictive file permissions (0o600).
 */
async function writeRawSecretsServerOnly(secretsObj) {
  await writeFileAtomic(
    SECRETS_FILE_PATH,
    JSON.stringify(secretsObj, null, 2),
    { encoding: 'utf8', mode: 0o600 },
  );
}

/**
 * Returns Zero-Trust status of all configured secrets in `secrets.json`.
 * Raw values never leave the server process.
 */
export function getSecretsZeroTrustStatus() {
  const rawSecrets = readRawSecretsServerOnly();
  const knownKeys = new Set(SECRET_PROVIDERS.map((p) => p.key));

  const providers = SECRET_PROVIDERS.map((provider) => {
    const val = rawSecrets[provider.key];
    const hasKey = typeof val === 'string' && val.trim().length > 0;
    return {
      key: provider.key,
      id: provider.id,
      label: provider.label,
      placeholder: provider.placeholder,
      hasKey,
      masked: hasKey ? maskSecretString(val) : '',
      length: hasKey ? val.trim().length : 0,
    };
  });

  for (const [key, val] of Object.entries(rawSecrets)) {
    if (knownKeys.has(key)) continue;
    if (key === 'csrfSecret' || key === '_migrated') continue;
    const hasKey = typeof val === 'string' && val.trim().length > 0;
    providers.push({
      key,
      id: key.replace(/^api_key_/, ''),
      label: key,
      placeholder: '...',
      hasKey,
      masked: hasKey ? maskSecretString(val) : '',
      length: hasKey ? val.trim().length : 0,
    });
  }

  return {
    vaultFileExists: fs.existsSync(SECRETS_FILE_PATH),
    configuredCount: providers.filter((p) => p.hasKey).length,
    providers,
  };
}


/**
 * Sets or updates a single secret key in `secrets.json`.
 */
export async function setSecretValue(secretKey, rawValue) {
  const cleanKey = String(secretKey || '').trim();
  if (!cleanKey || cleanKey === '__proto__' || cleanKey === 'constructor') {
    throw new Error('Invalid secret key name');
  }

  const secrets = readRawSecretsServerOnly();
  const cleanVal = typeof rawValue === 'string' ? rawValue.trim() : '';

  if (!cleanVal) {
    delete secrets[cleanKey];
  } else {
    secrets[cleanKey] = cleanVal;
  }

  await writeRawSecretsServerOnly(secrets);
  return getSecretsZeroTrustStatus();
}

/**
 * Deletes a secret key from `secrets.json`.
 */
export async function deleteSecretValue(secretKey) {
  const cleanKey = String(secretKey || '').trim();
  if (!cleanKey) {
    throw new Error('Missing secret key name');
  }
  const secrets = readRawSecretsServerOnly();
  delete secrets[cleanKey];
  await writeRawSecretsServerOnly(secrets);
  return getSecretsZeroTrustStatus();
}

/**
 * Sanitizes an OpenAI preset or `oai_settings` object before sending to client:
 * replaces raw `proxy_password` with `MASKED_SECRET_SENTINEL` and attaches
 * `_nexus_has_proxy_password` + `_nexus_proxy_password_masked` metadata.
 */
export function sanitizePresetSecretsForClient(presetData) {
  if (!presetData || typeof presetData !== 'object') return presetData;
  const clone = { ...presetData };

  if (typeof clone.proxy_password === 'string' && clone.proxy_password.trim().length > 0) {
    const rawPass = clone.proxy_password.trim();
    clone._nexus_has_proxy_password = true;
    clone._nexus_proxy_password_masked = maskSecretString(rawPass);
    clone.proxy_password = MASKED_SECRET_SENTINEL;
  } else {
    clone._nexus_has_proxy_password = false;
    clone._nexus_proxy_password_masked = '';
  }

  return clone;
}

/**
 * Restores the original on-disk `proxy_password` when saving a preset from the client,
 * unless the client explicitly provided a new password or cleared it.
 */
export function restorePresetSecretsBeforeWrite(incomingData, existingOnDiskData) {
  if (!incomingData || typeof incomingData !== 'object') return incomingData;
  const clean = { ...incomingData };

  delete clean._nexus_has_proxy_password;
  delete clean._nexus_proxy_password_masked;

  const existingPass =
    existingOnDiskData && typeof existingOnDiskData.proxy_password === 'string'
      ? existingOnDiskData.proxy_password
      : '';

  if (
    clean.proxy_password === MASKED_SECRET_SENTINEL ||
    clean.proxy_password === undefined
  ) {
    if (existingPass !== undefined && existingOnDiskData && 'proxy_password' in existingOnDiskData) {
      clean.proxy_password = existingPass;
    } else {
      delete clean.proxy_password;
    }
  }

  return clean;
}

/**
 * Sanitizes `proxies` array from `settings.json` so raw proxy passwords never reach the client.
 */
export function sanitizeProxyProfilesForClient(proxies) {
  if (!Array.isArray(proxies)) return [];
  return proxies.map((p) => {
    if (!p || typeof p !== 'object') return p;
    const rawPass = typeof p.password === 'string' ? p.password.trim() : '';
    const hasPassword = rawPass.length > 0;
    return {
      name: p.name || 'Unnamed Proxy',
      url: p.url || '',
      hasPassword,
      passwordMasked: hasPassword ? maskSecretString(rawPass) : '',
      password: hasPassword ? MASKED_SECRET_SENTINEL : '',
    };
  });
}

/**
 * Restores untouched proxy passwords when updating `proxies` in `settings.json`.
 */
export function restoreProxyProfilesBeforeWrite(incomingProxies, existingProxies = []) {
  if (!Array.isArray(incomingProxies)) return existingProxies;
  const byName = new Map();
  for (const ep of existingProxies) {
    if (ep && ep.name) {
      byName.set(ep.name, ep);
    }
  }

  return incomingProxies.map((item) => {
    const existing = byName.get(item.name);
    let finalPassword = '';
    if (item.password === MASKED_SECRET_SENTINEL) {
      finalPassword = existing?.password || '';
    } else if (typeof item.password === 'string') {
      finalPassword = item.password;
    }
    return {
      name: String(item.name || 'Proxy').trim(),
      url: String(item.url || '').trim(),
      password: finalPassword,
    };
  });
}
