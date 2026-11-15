import fs from 'node:fs';
import path from 'node:path';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import { DEFAULT_USER_DIR } from '../utils/paths.js';
import { readUserSettings, writeUserSettings, withUserSettingsLock } from './cardStore.js';
import {
  readRawSecretsServerOnly,
  maskSecretString,
  setSecretValue,
  deleteSecretValue,
} from './secretsStore.js';
import { getConnectionAndPresetSettings } from './presetStore.js';
import {
  DEFAULT_RP_PROXY_ROUTES,
  RP_ROUTE_BY_ID,
  OAI_COMPATIBLE_PRESETS,
  OFFICIAL_API_PROVIDERS,
  OFFICIAL_BY_ID,
  normalizeRpProxyBaseUrl,
  normalizeOaiBaseUrl,
  deriveConnectionNameFromUrl,
  buildRouteDescriptorFromSuffix,
  inferReasoningFlag,
  inferModelFamily,
  inferRpRouteIdForModel,
  findEquivalentModelInCatalog,
  classifyKeyFailure,
} from './apiHubProviders.js';
import {
  getConnectionRuntimeTelemetry,
  setConnectionRuntimeTelemetry,
  enrichModelWithTelemetry,
  probeSingleConnectionTelemetry,
} from './proxyTelemetry.js';
import { recordConsoleLog } from './consoleLogger.js';

export const NEXUSTAVERN_META_DIR = path.join(DEFAULT_USER_DIR, '.nexustavern');
export const API_HUB_FILE_PATH = path.join(NEXUSTAVERN_META_DIR, 'api-hub.json');

function ensureMetaDir() {
  if (!fs.existsSync(NEXUSTAVERN_META_DIR)) {
    fs.mkdirSync(NEXUSTAVERN_META_DIR, { recursive: true });
  }
}

function makeShortId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function parseManualModelInput(rawInput = '') {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) return null;
  if (trimmed.includes(',')) {
    const idx = trimmed.lastIndexOf(',');
    const namePart = trimmed.slice(0, idx).trim();
    const idPart = trimmed.slice(idx + 1).trim();
    if (idPart) {
      return { id: idPart, name: namePart || idPart };
    }
  }
  return { id: trimmed, name: trimmed };
}

export function normalizeModelEntry(raw, defaults = {}) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const parsed = parseManualModelInput(raw);
    if (!parsed) return null;
    const routeId = defaults.routeId || '';
    return {
      id: parsed.id,
      name: parsed.name,
      contextLength: null,
      reasoning: inferReasoningFlag(parsed.id),
      family: inferModelFamily(parsed.id, routeId),
      routeId,
      protocol: defaults.protocol || 'openai',
      isManual: Boolean(defaults.isManual),
    };
  }
  const id = String(raw.id || '').trim();
  if (!id) return null;
  const routeId = String(raw.routeId || defaults.routeId || '').trim();
  const upstreamModelId = String(
    raw.upstreamModelId || (id.includes('::') ? id.split('::').pop() : id),
  ).trim();
  const lockedCtx =
    Number.isFinite(Number(raw.lockedContextLength)) && Number(raw.lockedContextLength) > 0
      ? Number(raw.lockedContextLength)
      : null;
  const maxCtx =
    Number.isFinite(Number(raw.maxContextLength)) && Number(raw.maxContextLength) > 0
      ? Number(raw.maxContextLength)
      : Number.isFinite(Number(raw.contextLength)) && Number(raw.contextLength) > 0
        ? Number(raw.contextLength)
        : null;
  return {
    id,
    upstreamModelId: upstreamModelId || id,
    name: String(raw.name || upstreamModelId || id).trim() || id,
    lockedContextLength: lockedCtx,
    maxContextLength: maxCtx,
    contextLength: lockedCtx,
    reasoning: Boolean(raw.reasoning ?? inferReasoningFlag(upstreamModelId)),
    family: String(raw.family || inferModelFamily(upstreamModelId, routeId)),
    routeId,
    protocol: String(raw.protocol || defaults.protocol || 'openai'),
    isManual: Boolean(raw.isManual ?? defaults.isManual),
  };
}

export function splitRawKeysBatch(rawInput) {
  if (Array.isArray(rawInput)) {
    return rawInput.map((k) => String(k || '').trim()).filter(Boolean);
  }
  if (typeof rawInput !== 'string') return [];
  return rawInput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}


function buildInitialOrMigratedV2Store(legacyV1 = null) {
  const settings = readUserSettings();
  const oai = settings.oai_settings || {};
  const rawSecrets = readRawSecretsServerOnly();
  const connections = [];

  const stProxies = Array.isArray(settings.proxies)
    ? settings.proxies
    : Array.isArray(oai.proxies)
      ? oai.proxies
      : [];

  const byBaseUrl = new Map();
  for (const p of stProxies) {
    const rawUrl = String(p?.url || '').trim();
    if (!rawUrl) continue;
    const isMultiRoute = /\/proxy\/[a-z0-9_-]+/i.test(rawUrl) || !/\/v1$/i.test(rawUrl);
    const baseUrl = isMultiRoute ? normalizeRpProxyBaseUrl(rawUrl) : normalizeOaiBaseUrl(rawUrl);
    if (!baseUrl) continue;

    const mapKey = `${isMultiRoute ? 'rp' : 'oai'}:${baseUrl.toLowerCase()}`;
    if (!byBaseUrl.has(mapKey)) {
      const conn = {
        id: makeShortId('conn'),
        type: isMultiRoute ? 'rp_proxy' : 'oai_proxy',
        name: String(p.name || deriveConnectionNameFromUrl(baseUrl)).trim(),
        baseUrl,
        officialProviderId: '',
        activeRouteId: 'anthropic',
        customRoutes: [],
        keys: [],
        preferredKeyId: '',
        catalogModels: [],
        customModels: [],
        starredModels: [],
        lastUsedModelId: '',
        lastFetchedAt: null,
      };
      byBaseUrl.set(mapKey, conn);
      connections.push(conn);
    }
  }

  const activeRevProxy = String(oai.reverse_proxy || '').trim();
  if (activeRevProxy) {
    const base = normalizeRpProxyBaseUrl(activeRevProxy);
    const mapKey = `rp:${base.toLowerCase()}`;
    if (base && !byBaseUrl.has(mapKey)) {
      connections.push({
        id: makeShortId('conn'),
        type: 'rp_proxy',
        name: deriveConnectionNameFromUrl(base, 'RP Proxy'),
        baseUrl: base,
        officialProviderId: '',
        activeRouteId: 'anthropic',
        customRoutes: [],
        keys: [],
        preferredKeyId: '',
        catalogModels: [],
        customModels: [],
        starredModels: [],
        lastUsedModelId: '',
        lastFetchedAt: null,
      });
    }
  }

  const v1Customs = Array.isArray(legacyV1?.customProviders) ? legacyV1.customProviders : [];
  for (const cp of v1Customs) {
    const base = normalizeOaiBaseUrl(cp.baseUrl);
    if (!base) continue;
    const hasSecret = Boolean(cp.secretKey && String(rawSecrets[cp.secretKey] || '').trim());
    const keyEntryId = makeShortId('key');
    const v1State = legacyV1?.providers?.[cp.id] || {};
    connections.push({
      id: cp.id || makeShortId('conn'),
      type: 'oai_proxy',
      name: String(cp.name || deriveConnectionNameFromUrl(base)).trim(),
      baseUrl: base,
      officialProviderId: '',
      activeRouteId: '',
      customRoutes: [],
      keys: hasSecret
        ? [
            {
              id: keyEntryId,
              label: 'Key #1',
              secretKey: cp.secretKey,
              status: 'untested',
              statusReason: '',
              lastSuccessAt: null,
              lastErrorAt: null,
            },
          ]
        : [],
      preferredKeyId: hasSecret ? keyEntryId : '',
      catalogModels: Array.isArray(v1State.catalogModels) ? v1State.catalogModels : [],
      customModels: Array.isArray(v1State.customModels) ? v1State.customModels : [],
      starredModels: Array.isArray(v1State.enabledModels) ? v1State.enabledModels : [],
      lastUsedModelId: '',
      lastFetchedAt: v1State.lastFetchedAt || null,
    });
  }

  const orKey = String(rawSecrets.api_key_openrouter || '').trim();
  if (orKey) {
    const keyId = makeShortId('key');
    const v1Or = legacyV1?.providers?.openrouter || {};
    connections.push({
      id: 'conn_openrouter',
      type: 'oai_proxy',
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      officialProviderId: '',
      activeRouteId: '',
      customRoutes: [],
      keys: [
        {
          id: keyId,
          label: 'Key #1',
          secretKey: 'api_key_openrouter',
          status: 'untested',
          statusReason: '',
          lastSuccessAt: null,
          lastErrorAt: null,
        },
      ],
      preferredKeyId: keyId,
      catalogModels: Array.isArray(v1Or.catalogModels) ? v1Or.catalogModels : [],
      customModels: Array.isArray(v1Or.customModels) ? v1Or.customModels : [],
      starredModels: Array.isArray(v1Or.enabledModels) ? v1Or.enabledModels : [],
      lastUsedModelId: String(oai.openrouter_model || ''),
      lastFetchedAt: v1Or.lastFetchedAt || null,
    });
  }

  for (const off of OFFICIAL_API_PROVIDERS) {
    const val = String(rawSecrets[off.secretKey] || '').trim();
    if (!val) continue;
    const keyId = makeShortId('key');
    const v1State = legacyV1?.providers?.[off.id] || {};
    const curModel = String(oai[off.stModelField] || off.suggestedModels?.[0]?.id || '').trim();
    connections.push({
      id: `conn_${off.id}`,
      type: 'official_api',
      name: off.name,
      baseUrl: off.defaultBaseUrl,
      officialProviderId: off.id,
      activeRouteId: '',
      customRoutes: [],
      keys: [
        {
          id: keyId,
          label: 'Key #1',
          secretKey: off.secretKey,
          status: 'untested',
          statusReason: '',
          lastSuccessAt: null,
          lastErrorAt: null,
        },
      ],
      preferredKeyId: keyId,
      catalogModels: Array.isArray(v1State.catalogModels) ? v1State.catalogModels : [],
      customModels: Array.isArray(v1State.customModels) ? v1State.customModels : [],
      starredModels: Array.isArray(v1State.enabledModels) ? v1State.enabledModels : [],
      lastUsedModelId: curModel,
      lastFetchedAt: v1State.lastFetchedAt || null,
    });
  }

  const firstConn = connections[0] || null;
  return {
    version: 2,
    activeConnectionId: firstConn?.id || '',
    activeModelId: firstConn?.lastUsedModelId || '',
    connections,
  };
}

export function readApiHubStore() {
  ensureMetaDir();
  if (!fs.existsSync(API_HUB_FILE_PATH)) {
    const initial = buildInitialOrMigratedV2Store(null);
    try {
      fs.writeFileSync(API_HUB_FILE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    } catch {
      // ignore
    }
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(API_HUB_FILE_PATH, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      return buildInitialOrMigratedV2Store(null);
    }
    if (Number(parsed.version) < 2 || !Array.isArray(parsed.connections)) {
      const migrated = buildInitialOrMigratedV2Store(parsed);
      try {
        fs.writeFileSync(API_HUB_FILE_PATH, JSON.stringify(migrated, null, 2), 'utf8');
      } catch {
        // ignore
      }
      return migrated;
    }
    return {
      version: 2,
      activeConnectionId: String(parsed.activeConnectionId || ''),
      activeModelId: String(parsed.activeModelId || ''),
      customFamilies: Array.isArray(parsed.customFamilies) ? parsed.customFamilies : [],
      connections: parsed.connections,
    };
  } catch {
    return buildInitialOrMigratedV2Store(null);
  }
}

async function writeApiHubStore(storeObj) {
  ensureMetaDir();
  await writeFileAtomic(API_HUB_FILE_PATH, JSON.stringify(storeObj, null, 2), 'utf8');
}

export function getConnectionRoutes(conn) {
  if (!conn || conn.type !== 'rp_proxy') return [];
  const customMap = new Map();
  for (const cr of Array.isArray(conn.customRoutes) ? conn.customRoutes : []) {
    if (cr && cr.id) customMap.set(cr.id, cr);
  }

  const routes = DEFAULT_RP_PROXY_ROUTES.map((base) => {
    const over = customMap.get(base.id);
    if (!over) return { ...base, enabled: true };
    customMap.delete(base.id);
    return {
      ...base,
      label: String(over.label || base.label),
      suffix: String(over.suffix ?? base.suffix).trim(),
      modelsPath: String(over.modelsPath || base.modelsPath),
      protocol: String(over.protocol || base.protocol),
      enabled: over.enabled !== false,
    };
  });

  for (const extra of customMap.values()) {
    if (extra.enabled === false) continue;
    routes.push({
      id: String(extra.id),
      label: String(extra.label || extra.id),
      family: String(extra.family || 'other'),
      suffix: String(extra.suffix || '').trim(),
      modelsPath: String(extra.modelsPath || '/v1/models'),
      protocol: String(extra.protocol || 'openai'),
      stSource: 'custom',
      stModelField: 'custom_model',
      fallbackModels: [],
      enabled: true,
    });
  }

  return routes.filter((r) => r.enabled !== false);
}

export function buildConnectionModelsList(conn) {
  if (!conn) return [];
  const map = new Map();
  const starSet = new Set(
    (Array.isArray(conn.starredModels) ? conn.starredModels : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean),
  );

  for (const raw of Array.isArray(conn.catalogModels) ? conn.catalogModels : []) {
    const norm = normalizeModelEntry(raw);
    if (norm) {
      map.set(norm.id, { ...norm, starred: starSet.has(norm.id) });
    }
  }

  // Manual models added by user (always override / append)
  for (const rawCustom of Array.isArray(conn.customModels) ? conn.customModels : []) {
    const defaultRoute = conn.type === 'rp_proxy' ? inferRpRouteIdForModel(rawCustom?.id || rawCustom) : '';
    const norm = normalizeModelEntry(rawCustom, { isManual: true, routeId: defaultRoute });
    if (norm) {
      map.set(norm.id, { ...norm, isManual: true, starred: starSet.has(norm.id) });
    }
  }

  // If official API has not fetched yet, include suggested models out of the box
  if (conn.type === 'official_api' && map.size === 0) {
    const off = OFFICIAL_BY_ID.get(conn.officialProviderId);
    for (const sm of off?.suggestedModels || []) {
      const norm = normalizeModelEntry(sm, { protocol: off.protocol });
      if (norm && !map.has(norm.id)) {
        map.set(norm.id, { ...norm, starred: starSet.has(norm.id) });
      }
    }
  }

  // If RP Proxy has not fetched models yet (or proxy hides `/models`), provide clean starter models per route
  if (conn.type === 'rp_proxy' && map.size === 0) {
    for (const r of getConnectionRoutes(conn)) {
      for (const fm of r.fallbackModels || []) {
        const norm = normalizeModelEntry(
          { ...fm, contextLength: null, maxContextLength: fm.contextLength },
          { routeId: r.id, protocol: r.protocol },
        );
        if (norm && !map.has(norm.id)) {
          map.set(norm.id, { ...norm, starred: starSet.has(norm.id) });
        }
      }
    }
  }

  const telemetry = getConnectionRuntimeTelemetry(conn.id);
  return Array.from(map.values()).map((m) => enrichModelWithTelemetry(m, conn.type, telemetry));
}


function getOrderedCandidateKeys(conn, rawSecrets) {
  const keys = Array.isArray(conn?.keys) ? conn.keys : [];
  const populated = keys
    .map((k) => {
      const val = String(rawSecrets[k.secretKey] || '').trim();
      return { entry: k, rawKey: val };
    })
    .filter((item) => item.rawKey.length > 0 && item.entry.status !== 'dead');

  if (populated.length <= 1) return populated;

  const prefId = conn.preferredKeyId;
  return [...populated].sort((a, b) => {
    const aIsPref = a.entry.id === prefId && a.entry.status !== 'cooldown' ? -1 : 0;
    const bIsPref = b.entry.id === prefId && b.entry.status !== 'cooldown' ? -1 : 0;
    if (aIsPref !== bIsPref) return aIsPref - bIsPref;

    const rank = (st) => (st === 'active' ? 0 : st === 'untested' ? 1 : 2);
    return rank(a.entry.status) - rank(b.entry.status);
  });
}

async function syncActiveSelectionToSTSettings(store) {
  const conn = (store.connections || []).find((c) => c.id === store.activeConnectionId);
  if (!conn) return;
  const modelId = String(store.activeModelId || '').trim();
  const rawSecrets = readRawSecretsServerOnly();
  const candidates = getOrderedCandidateKeys(conn, rawSecrets);
  const activeRawKey = candidates[0]?.rawKey || '';

  await withUserSettingsLock(async () => {
    const settings = readUserSettings();
    if (!settings.oai_settings) settings.oai_settings = {};
    settings.main_api = 'openai';

    if (conn.type === 'rp_proxy') {
      const routes = getConnectionRoutes(conn);
      const allModels = buildConnectionModelsList(conn);
      const modelObj = allModels.find((m) => m.id === modelId);
      const cleanUpstreamModel =
        modelObj?.upstreamModelId || (modelId.includes('::') ? modelId.split('::').pop() : modelId);
      const routeId =
        modelObj?.routeId || conn.activeRouteId || inferRpRouteIdForModel(cleanUpstreamModel);
      const route =
        routes.find((r) => r.id === routeId) ||
        RP_ROUTE_BY_ID.get(routeId) ||
        buildRouteDescriptorFromSuffix(`/proxy/${routeId}`) ||
        routes[0];
      const fullProxyUrl = `${conn.baseUrl.replace(/\/+$/, '')}${route?.suffix || ''}`;

      settings.oai_settings.chat_completion_source = route?.stSource || 'claude';
      settings.oai_settings.reverse_proxy = fullProxyUrl;
      if (activeRawKey) {
        settings.oai_settings.proxy_password = activeRawKey;
      }
      if (cleanUpstreamModel && route?.stModelField) {
        settings.oai_settings[route.stModelField] = cleanUpstreamModel;
      }
    } else if (conn.type === 'oai_proxy') {
      const isOpenRouter = conn.baseUrl.toLowerCase().includes('openrouter.ai');
      if (isOpenRouter) {
        settings.oai_settings.chat_completion_source = 'openrouter';
        if (modelId) settings.oai_settings.openrouter_model = modelId;
        if (activeRawKey) await setSecretValue('api_key_openrouter', activeRawKey);
      } else {
        settings.oai_settings.chat_completion_source = 'custom';
        settings.oai_settings.custom_url = conn.baseUrl;
        if (modelId) settings.oai_settings.custom_model = modelId;
        if (activeRawKey) await setSecretValue('api_key_custom', activeRawKey);
      }
    } else if (conn.type === 'official_api') {
      const off = OFFICIAL_BY_ID.get(conn.officialProviderId);
      if (off) {
        settings.oai_settings.chat_completion_source = off.stSource;
        settings.oai_settings.reverse_proxy = '';
        if (modelId) settings.oai_settings[off.stModelField] = modelId;
        if (activeRawKey) await setSecretValue(off.secretKey, activeRawKey);
      }
    }

    await writeUserSettings(settings);
  });
}


export async function executeWithConnectionKeyFailover(connectionId, executorFn, options = {}) {
  const store = readApiHubStore();
  const conn = (store.connections || []).find((c) => c.id === connectionId);
  if (!conn) throw new Error(`Connection "${connectionId}" not found`);

  const rawSecrets = readRawSecretsServerOnly();
  const candidates = getOrderedCandidateKeys(conn, rawSecrets);

  if (candidates.length === 0) {
    const totalKeys = Array.isArray(conn.keys) ? conn.keys.length : 0;
    if (totalKeys > 0) {
      throw new Error(
        `All ${totalKeys} key(s) on "${conn.name}" are marked dead (invalid or out of quota). Replace or add a fresh key.`,
      );
    }
    if (conn.type === 'oai_proxy' && !options.requireKey) {
      try {
        const result = await executorFn({
          apiKey: '',
          keyEntry: null,
          connection: conn,
          attemptIndex: 0,
        });
        const existingTel = getConnectionRuntimeTelemetry(conn.id);
        if (!existingTel || existingTel.state === 'offline') {
          setConnectionRuntimeTelemetry(conn.id, { state: 'online', error: '' });
        }
        return result;
      } catch (err) {
        if (err?.name === 'AbortError' || err?.filterBlock || err?.refusalDetected) throw err;
        const probed = await probeSingleConnectionTelemetry(conn, '');
        if (probed?.state === 'offline') {
          const offlineErr = new Error(
            `${conn.name}: Proxy is unavailable, please try again later.`,
          );
          offlineErr.proxyOffline = true;
          offlineErr.connectionId = conn.id;
          offlineErr.connectionName = conn.name;
          offlineErr.cause = err;
          throw offlineErr;
        }
        throw err;
      }
    }
    throw new Error(`No API/Proxy key configured for "${conn.name}". Add a key first.`);
  }

  let lastError = null;
  let mutatedStore = false;
  let confirmedOffline = false;

  for (let i = 0; i < candidates.length; i += 1) {
    const { entry, rawKey } = candidates[i];
    const storeKey = conn.keys.find((k) => k.id === entry.id);
    try {
      const result = await executorFn({
        apiKey: rawKey,
        keyEntry: storeKey,
        connection: conn,
        attemptIndex: i,
      });

      if (storeKey) {
        const changed =
          storeKey.status !== 'active' ||
          Boolean(storeKey.statusReason) ||
          conn.preferredKeyId !== storeKey.id;
        storeKey.status = 'active';
        storeKey.statusReason = '';
        storeKey.lastSuccessAt = new Date().toISOString();
        conn.preferredKeyId = storeKey.id;
        mutatedStore = mutatedStore || changed;
      }

      if (mutatedStore) {
        await writeApiHubStore(store);
        if (store.activeConnectionId === conn.id) {
          await syncActiveSelectionToSTSettings(store);
        }
      }
      const existingTel = getConnectionRuntimeTelemetry(conn.id);
      if (!existingTel || existingTel.state === 'offline') {
        setConnectionRuntimeTelemetry(conn.id, { state: 'online', error: '' });
      }
      return result;
    } catch (err) {
      if (err?.name === 'AbortError' || err?.filterBlock || err?.refusalDetected) {
        throw err;
      }
      lastError = err;
      const verdict = classifyKeyFailure({
        status: err.httpStatus || 0,
        message: err.message || '',
        bodyJson: err.bodyJson || null,
      });

      if (storeKey && (verdict.markDead || verdict.kind === 'rate_limit')) {
        storeKey.lastErrorAt = new Date().toISOString();
        storeKey.status = verdict.markDead ? 'dead' : 'cooldown';
        storeKey.statusReason = verdict.reason;
        mutatedStore = true;
        const hasBackup = verdict.shouldTryNextKey && i < candidates.length - 1;
        recordConsoleLog({
          category: 'system',
          level: 'warn',
          scope: 'Keychain',
          title: `API key ${storeKey.label || `#${i + 1}`} marked ${storeKey.status.toUpperCase()} on "${conn.name}"`,
          summary: `${verdict.reason}${hasBackup ? ' • Failing over to next backup key' : ''}`,
          badges: [
            { label: storeKey.status.toUpperCase(), tone: verdict.markDead ? 'danger' : 'warn' },
            ...(hasBackup ? [{ label: 'FAILOVER', tone: 'accent' }] : []),
          ],
        });
      }

      if (verdict.shouldTryNextKey && i < candidates.length - 1) {
        continue;
      }

      // Never blindly mark the proxy offline on a generation/upstream failure:
      // perform a real GET health probe first to verify whether the proxy itself is down.
      if (conn.type !== 'official_api' || verdict.kind === 'proxy_down') {
        const probeKey = candidates[0]?.rawKey || rawKey || '';
        const probed = await probeSingleConnectionTelemetry(conn, probeKey);
        if (probed?.state === 'offline') {
          confirmedOffline = true;
        }
      }
      break;
    }
  }

  if (mutatedStore) {
    await writeApiHubStore(store);
  }
  if (confirmedOffline) {
    const offlineErr = new Error(
      `${conn.name}: Proxy is unavailable, please try again later.`,
    );
    offlineErr.proxyOffline = true;
    offlineErr.connectionId = conn.id;
    offlineErr.connectionName = conn.name;
    offlineErr.cause = lastError;
    throw offlineErr;
  }
  throw lastError || new Error(`Request failed for "${conn.name}"`);
}


export function getApiHubState() {
  const store = readApiHubStore();
  const rawSecrets = readRawSecretsServerOnly();

  const rawConnections = Array.isArray(store.connections) ? store.connections : [];
  const activeConnRaw =
    rawConnections.find((c) => c.id === store.activeConnectionId) || rawConnections[0] || null;

  const activeConnModels = activeConnRaw ? buildConnectionModelsList(activeConnRaw) : [];
  const activeModelId =
    store.activeModelId ||
    activeConnRaw?.lastUsedModelId ||
    activeConnModels.find((m) => m.starred)?.id ||
    activeConnModels[0]?.id ||
    '';

  const connections = rawConnections.map((conn, idx) => {
    const models = buildConnectionModelsList(conn);
    const keysRaw = Array.isArray(conn.keys) ? conn.keys : [];
    const keysSanitized = keysRaw
      .map((k, kIdx) => {
        const secretVal = String(rawSecrets[k.secretKey] || '').trim();
        if (!secretVal) return null;
        return {
          id: k.id,
          label: k.label || `Key #${kIdx + 1}`,
          masked: maskSecretString(secretVal),
          status: k.status || 'untested',
          statusReason: k.statusReason || '',
          lastSuccessAt: k.lastSuccessAt || null,
          lastErrorAt: k.lastErrorAt || null,
          isPreferred: conn.preferredKeyId ? conn.preferredKeyId === k.id : kIdx === 0,
        };
      })
      .filter(Boolean);

    const aliveKeysCount = keysSanitized.filter((k) => k.status !== 'dead').length;
    const deadKeysCount = keysSanitized.filter((k) => k.status === 'dead').length;
    const activeKeyObj =
      keysSanitized.find((k) => k.isPreferred && k.status !== 'dead') ||
      keysSanitized.find((k) => k.status !== 'dead') ||
      keysSanitized[0] ||
      null;

    const isKeylessLocal =
      conn.type === 'oai_proxy' &&
      /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(conn.baseUrl || '');
    const isConfigured = aliveKeysCount > 0 || isKeylessLocal;

    const eqModel = activeModelId ? findEquivalentModelInCatalog(activeModelId, models) : null;
    const fallbackModelId =
      conn.lastUsedModelId || models.find((m) => m.starred)?.id || models[0]?.id || '';
    const rt = getConnectionRuntimeTelemetry(conn.id);

    return {
      id: conn.id,
      order: idx,
      type: conn.type,
      name: conn.name,
      baseUrl: conn.baseUrl || '',
      officialProviderId: conn.officialProviderId || '',
      activeRouteId: conn.activeRouteId || '',
      discoveredRoutes: Array.isArray(conn.discoveredRoutes) ? conn.discoveredRoutes : [],
      routes: conn.type === 'rp_proxy' ? getConnectionRoutes(conn) : [],
      keys: keysSanitized,
      activeKeyId: activeKeyObj?.id || '',
      activeKeyMasked: activeKeyObj?.masked || '',
      aliveKeysCount,
      deadKeysCount,
      hasKey: keysSanitized.length > 0,
      isConfigured,
      health: rt
        ? {
            state: rt.state || 'unknown',
            latencyMs: rt.latencyMs ?? null,
            error: rt.error || '',
            checkedAt: rt.checkedAt || null,
          }
        : null,
      models,
      catalogModels: models,
      starredModels: models.filter((m) => m.starred).map((m) => m.id),
      fetchedCount: Array.isArray(conn.catalogModels) ? conn.catalogModels.length : 0,
      lastFetchedAt: conn.lastFetchedAt || null,
      lastUsedModelId: conn.lastUsedModelId || '',
      sameModelMatchId: eqModel?.id || null,
      fallbackModelId,
    };
  });

  const activeConnection =
    connections.find((c) => c.id === activeConnRaw?.id) || connections[0] || null;
  const activeModelObj =
    activeConnection?.models.find((m) => m.id === activeModelId) ||
    (activeModelId ? { id: activeModelId, name: activeModelId } : null);

  const quickGroups = connections.map((c) => ({
    providerId: c.id,
    providerName: c.name,
    isConfigured: c.isConfigured,
    models: c.models,
  }));

  const settingsSync = getConnectionAndPresetSettings();

  return {
    activeConnectionId: activeConnection?.id || '',
    activeProviderId: activeConnection?.id || '',
    activeProviderName: activeConnection?.name || 'No Connection',
    activeProviderConfigured: Boolean(activeConnection?.isConfigured),
    activeModelId,
    activeModelName: activeModelObj?.name || activeModelId || 'Select Model',
    connections,
    providers: connections,
    quickGroups,
    customFamilies: Array.isArray(store.customFamilies) ? store.customFamilies : [],
    presetsCatalog: {
      rpRoutes: DEFAULT_RP_PROXY_ROUTES,
      oaiPresets: OAI_COMPATIBLE_PRESETS,
      officialProviders: OFFICIAL_API_PROVIDERS,
    },
    connection: settingsSync.connection,
  };
}


export async function createHubConnection(payload = {}) {
  const type = ['rp_proxy', 'oai_proxy', 'official_api'].includes(payload.type)
    ? payload.type
    : 'rp_proxy';

  const store = readApiHubStore();
  const connId = makeShortId('conn');

  let baseUrl;
  let officialProviderId = '';
  let cleanName = String(payload.name || '').trim();

  if (type === 'official_api') {
    const offId = String(payload.officialProviderId || 'makersuite').trim();
    const off = OFFICIAL_BY_ID.get(offId) || OFFICIAL_API_PROVIDERS[0];
    officialProviderId = off.id;
    baseUrl = off.defaultBaseUrl;
    if (!cleanName) cleanName = off.name;
  } else if (type === 'rp_proxy') {
    baseUrl = normalizeRpProxyBaseUrl(payload.baseUrl, payload.customRoutes);
    if (!baseUrl) throw new Error('Proxy Base URL is required');
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`;
    if (!cleanName) cleanName = deriveConnectionNameFromUrl(baseUrl, 'RP Proxy');
  } else {
    baseUrl = normalizeOaiBaseUrl(payload.baseUrl);
    if (!baseUrl) throw new Error('Endpoint Base URL is required');
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`;
    if (!cleanName) cleanName = deriveConnectionNameFromUrl(baseUrl, 'OAI Proxy');
  }

  const rawKeyList = [
    ...splitRawKeysBatch(payload.apiKeys),
    ...splitRawKeysBatch(payload.apiKey),
  ];
  const uniqueRawKeys = Array.from(new Set(rawKeyList));

  if (type === 'official_api' && uniqueRawKeys.length === 0) {
    throw new Error(`API key is required for ${cleanName}`);
  }

  const keys = [];
  for (let i = 0; i < uniqueRawKeys.length; i += 1) {
    const keyId = makeShortId('key');
    const secretKey = `api_key_${connId}_${keyId}`;
    await setSecretValue(secretKey, uniqueRawKeys[i]);
    keys.push({
      id: keyId,
      label: uniqueRawKeys.length > 1 ? `Key #${i + 1}` : String(payload.keyLabel || 'Key #1').trim(),
      secretKey,
      status: 'untested',
      statusReason: '',
      lastSuccessAt: null,
      lastErrorAt: null,
    });
  }

  const newConn = {
    id: connId,
    type,
    name: cleanName,
    baseUrl,
    officialProviderId,
    activeRouteId: type === 'rp_proxy' ? 'anthropic' : '',
    customRoutes: Array.isArray(payload.customRoutes) ? payload.customRoutes : [],
    keys,
    preferredKeyId: keys[0]?.id || '',
    catalogModels: [],
    customModels: [],
    starredModels: [],
    lastUsedModelId: '',
    lastFetchedAt: null,
  };

  store.connections.push(newConn);
  store.activeConnectionId = connId;

  const builtModels = buildConnectionModelsList(newConn);
  if (store.activeModelId) {
    const match = findEquivalentModelInCatalog(store.activeModelId, builtModels);
    if (match) {
      store.activeModelId = match.id;
      newConn.lastUsedModelId = match.id;
    } else if (builtModels[0]) {
      store.activeModelId = builtModels[0].id;
      newConn.lastUsedModelId = builtModels[0].id;
    }
  } else if (builtModels[0]) {
    store.activeModelId = builtModels[0].id;
    newConn.lastUsedModelId = builtModels[0].id;
  }

  await writeApiHubStore(store);
  await syncActiveSelectionToSTSettings(store);
  return { createdId: connId, hub: getApiHubState() };
}

export async function selectActiveHubModel(connectionId, modelId = null) {
  const store = readApiHubStore();
  const conn = (store.connections || []).find((c) => c.id === connectionId);
  if (!conn) throw new Error(`Connection "${connectionId}" not found`);

  const models = buildConnectionModelsList(conn);
  const previousModelId = String(store.activeModelId || '').trim();
  const explicitModel = modelId !== null && modelId !== undefined ? String(modelId).trim() : '';

  let chosenModelId = '';
  let keptSameModel = false;

  if (explicitModel) {
    chosenModelId = explicitModel;
    keptSameModel = explicitModel === previousModelId;
  } else if (previousModelId) {
    // Scenario 1: Provider switched without specifying a new model -> keep the SAME model if available!
    const eq = findEquivalentModelInCatalog(previousModelId, models);
    if (eq) {
      chosenModelId = eq.id;
      keptSameModel = true;
    } else if (conn.type === 'rp_proxy' && models.length === 0) {
      chosenModelId = previousModelId;
      keptSameModel = true;
    } else {
      chosenModelId =
        conn.lastUsedModelId ||
        models.find((m) => m.starred)?.id ||
        models[0]?.id ||
        previousModelId;
      keptSameModel = chosenModelId === previousModelId;
    }
  } else {
    chosenModelId =
      conn.lastUsedModelId || models.find((m) => m.starred)?.id || models[0]?.id || '';
  }

  store.activeConnectionId = conn.id;
  store.activeModelId = chosenModelId;
  if (chosenModelId) {
    conn.lastUsedModelId = chosenModelId;
  }

  if (conn.type === 'rp_proxy' && chosenModelId) {
    const matchedObj = models.find((m) => m.id === chosenModelId);
    conn.activeRouteId = matchedObj?.routeId || inferRpRouteIdForModel(chosenModelId);
  }

  await writeApiHubStore(store);
  await syncActiveSelectionToSTSettings(store);
  return { ...getApiHubState(), keptSameModel };
}


export async function updateHubConnection(connectionId, patch = {}) {
  const store = readApiHubStore();
  const conn = (store.connections || []).find((c) => c.id === connectionId);
  if (!conn) throw new Error(`Connection "${connectionId}" not found`);

  if (patch.name !== undefined) {
    const cleanName = String(patch.name || '').trim();
    if (cleanName) conn.name = cleanName;
  }

  if (patch.baseUrl !== undefined && conn.type !== 'official_api') {
    const cleanUrl =
      conn.type === 'rp_proxy'
        ? normalizeRpProxyBaseUrl(patch.baseUrl, patch.customRoutes ?? conn.customRoutes)
        : normalizeOaiBaseUrl(patch.baseUrl);
    if (cleanUrl) {
      conn.baseUrl = /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`;
    }
  }

  if (Array.isArray(patch.customRoutes) && conn.type === 'rp_proxy') {
    conn.customRoutes = patch.customRoutes;
  }

  const incomingBatch = [
    ...splitRawKeysBatch(patch.addKeys),
    ...(typeof patch.apiKey === 'string' && patch.apiKey.trim() && !patch.replaceKey
      ? splitRawKeysBatch(patch.apiKey)
      : []),
  ];
  if (incomingBatch.length > 0) {
    if (!Array.isArray(conn.keys)) conn.keys = [];
    for (let i = 0; i < incomingBatch.length; i += 1) {
      const keyId = makeShortId('key');
      const secretKey = `api_key_${conn.id}_${keyId}`;
      await setSecretValue(secretKey, incomingBatch[i]);
      const nextNum = conn.keys.length + 1;
      const label =
        incomingBatch.length === 1 && patch.keyLabel
          ? String(patch.keyLabel).trim()
          : `Key #${nextNum}`;
      conn.keys.push({
        id: keyId,
        label,
        secretKey,
        status: 'untested',
        statusReason: '',
        lastSuccessAt: null,
        lastErrorAt: null,
      });
      if (!conn.preferredKeyId || patch.makePreferred !== false) {
        conn.preferredKeyId = keyId;
      }
    }
  }

  if (patch.replaceKey && typeof patch.replaceKey === 'object') {
    const { keyId, apiKey: nextRaw, label: nextLabel } = patch.replaceKey;
    const target = (conn.keys || []).find((k) => k.id === keyId);
    if (target) {
      if (typeof nextRaw === 'string' && nextRaw.trim()) {
        await setSecretValue(target.secretKey, nextRaw.trim());
        target.status = 'untested';
        target.statusReason = '';
        target.lastErrorAt = null;
        conn.preferredKeyId = target.id;
      }
      if (typeof nextLabel === 'string' && nextLabel.trim()) {
        target.label = nextLabel.trim();
      }
    }
  }

  if (typeof patch.selectKeyId === 'string' && patch.selectKeyId.trim()) {
    const target = (conn.keys || []).find((k) => k.id === patch.selectKeyId.trim());
    if (target) {
      conn.preferredKeyId = target.id;
      if (patch.reviveKey === true || target.status === 'cooldown' || target.status === 'dead') {
        target.status = 'untested';
        target.statusReason = '';
      }
    }
  }

  if (typeof patch.deleteKeyId === 'string' && patch.deleteKeyId.trim()) {
    const delId = patch.deleteKeyId.trim();
    const idx = (conn.keys || []).findIndex((k) => k.id === delId);
    if (idx !== -1) {
      const [removed] = conn.keys.splice(idx, 1);
      if (removed?.secretKey && removed.secretKey.startsWith('api_key_conn_')) {
        await deleteSecretValue(removed.secretKey);
      }
      if (conn.preferredKeyId === delId) {
        const nextAlive = conn.keys.find((k) => k.status !== 'dead') || conn.keys[0];
        conn.preferredKeyId = nextAlive?.id || '';
      }
    }
  }


  if (patch.toggleStarModel) {
    const mId = String(
      typeof patch.toggleStarModel === 'string'
        ? patch.toggleStarModel
        : patch.toggleStarModel.modelId || '',
    ).trim();
    if (mId) {
      const starSet = new Set(conn.starredModels || []);
      if (starSet.has(mId)) {
        starSet.delete(mId);
      } else {
        starSet.add(mId);
      }
      conn.starredModels = Array.from(starSet);
    }
  }

  if (typeof patch.addCustomModel === 'string' && patch.addCustomModel.trim()) {
    const parsed = parseManualModelInput(patch.addCustomModel);
    if (parsed) {
      if (!Array.isArray(conn.customModels)) conn.customModels = [];
      const routeId =
        patch.customModelRouteId ||
        (conn.type === 'rp_proxy' ? inferRpRouteIdForModel(parsed.id) : '');
      const existingIdx = conn.customModels.findIndex(
        (m) => (typeof m === 'string' ? m : m?.id) === parsed.id,
      );
      const entryObj = { id: parsed.id, name: parsed.name, routeId };
      if (existingIdx !== -1) {
        conn.customModels[existingIdx] = entryObj;
      } else {
        conn.customModels.push(entryObj);
      }
      if (patch.selectAddedModel !== false) {
        store.activeConnectionId = conn.id;
        store.activeModelId = parsed.id;
        conn.lastUsedModelId = parsed.id;
        if (conn.type === 'rp_proxy' && routeId) conn.activeRouteId = routeId;
      }
    }
  }

  if (typeof patch.removeCustomModel === 'string' && patch.removeCustomModel.trim()) {
    const remId = patch.removeCustomModel.trim();
    conn.customModels = (conn.customModels || []).filter(
      (m) => (typeof m === 'string' ? m : m?.id) !== remId,
    );
  }

  await writeApiHubStore(store);
  if (store.activeConnectionId === conn.id) {
    await syncActiveSelectionToSTSettings(store);
  }
  return getApiHubState();
}

export async function saveFetchedConnectionCatalog(
  connectionId,
  models = [],
  resolvedBaseUrl = null,
  discoveredRoutes = null,
) {
  const store = readApiHubStore();
  const conn = (store.connections || []).find((c) => c.id === connectionId);
  if (!conn) throw new Error(`Connection "${connectionId}" not found`);

  conn.catalogModels = models.map((m) => normalizeModelEntry(m)).filter(Boolean);
  conn.lastFetchedAt = new Date().toISOString();
  if (resolvedBaseUrl && conn.type === 'oai_proxy') {
    conn.baseUrl = resolvedBaseUrl;
  }
  if (Array.isArray(discoveredRoutes) && conn.type === 'rp_proxy') {
    conn.discoveredRoutes = discoveredRoutes;
  }

  const allModels = buildConnectionModelsList(conn);
  if (store.activeConnectionId === conn.id && allModels.length > 0) {
    const currentValid = store.activeModelId && allModels.some((m) => m.id === store.activeModelId);
    if (!currentValid) {
      const eq = store.activeModelId
        ? findEquivalentModelInCatalog(store.activeModelId, allModels)
        : null;
      const picked = eq?.id || allModels[0].id;
      store.activeModelId = picked;
      conn.lastUsedModelId = picked;
      if (conn.type === 'rp_proxy') {
        const obj = allModels.find((m) => m.id === picked);
        conn.activeRouteId = obj?.routeId || inferRpRouteIdForModel(picked);
      }
    }
  }

  await writeApiHubStore(store);
  if (store.activeConnectionId === conn.id) {
    await syncActiveSelectionToSTSettings(store);
  }
  return getApiHubState();
}

export async function deleteHubConnection(connectionId) {
  const store = readApiHubStore();
  const idx = (store.connections || []).findIndex((c) => c.id === connectionId);
  if (idx === -1) throw new Error(`Connection "${connectionId}" not found`);

  const [removed] = store.connections.splice(idx, 1);
  for (const k of Array.isArray(removed?.keys) ? removed.keys : []) {
    if (k?.secretKey && k.secretKey.startsWith('api_key_conn_')) {
      await deleteSecretValue(k.secretKey);
    }
  }

  if (store.activeConnectionId === connectionId) {
    const nextConn = store.connections[0] || null;
    if (nextConn) {
      await writeApiHubStore(store);
      return selectActiveHubModel(nextConn.id, null);
    }
    store.activeConnectionId = '';
    store.activeModelId = '';
  }

  await writeApiHubStore(store);
  return getApiHubState();
}

export const updateHubProvider = updateHubConnection;
export const createCustomHubProvider = createHubConnection;
export const deleteCustomHubProvider = deleteHubConnection;
export const saveFetchedProviderCatalog = saveFetchedConnectionCatalog;

export async function addCustomModelFamily({ label = '', match = '' } = {}) {
  const cleanLabel = String(label || match || '').trim();
  if (!cleanLabel) throw new Error('Company / family name is required');
  const cleanMatch = String(match || cleanLabel)
    .trim()
    .toLowerCase();
  const id = `custom_${cleanMatch.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || Date.now().toString(36)}`;

  const store = readApiHubStore();
  if (!Array.isArray(store.customFamilies)) store.customFamilies = [];
  const existingIdx = store.customFamilies.findIndex(
    (f) => f.id === id || String(f.match || '').toLowerCase() === cleanMatch,
  );
  const entry = { id, label: cleanLabel, match: cleanMatch };
  if (existingIdx !== -1) {
    store.customFamilies[existingIdx] = entry;
  } else {
    store.customFamilies.push(entry);
  }
  await writeApiHubStore(store);
  return getApiHubState();
}

export async function removeCustomModelFamily(familyId) {
  const cleanId = String(familyId || '').trim();
  const store = readApiHubStore();
  store.customFamilies = (store.customFamilies || []).filter((f) => f.id !== cleanId);
  await writeApiHubStore(store);
  return getApiHubState();
}

export function revealConnectionKeyForCopy(connectionId, keyId = '') {
  const store = readApiHubStore();
  const conn = (store.connections || []).find((c) => c.id === connectionId);
  if (!conn) throw new Error(`Connection "${connectionId}" not found`);

  const rawSecrets = readRawSecretsServerOnly();
  const keys = Array.isArray(conn.keys) ? conn.keys : [];
  if (keys.length === 0) throw new Error('No key stored for this connection');

  let target;
  if (keyId) {
    target = keys.find((k) => k.id === keyId) || null;
  } else {
    target =
      keys.find((k) => k.id === conn.preferredKeyId && k.status !== 'dead') ||
      keys.find((k) => k.status !== 'dead') ||
      keys[0] ||
      null;
  }

  if (!target) throw new Error('Requested key not found');
  const rawVal = String(rawSecrets[target.secretKey] || '').trim();
  if (!rawVal) throw new Error('Key value is empty on server');
  return rawVal;
}

export async function pingAllHubConnections() {
  const store = readApiHubStore();
  const rawSecrets = readRawSecretsServerOnly();
  const conns = Array.isArray(store.connections) ? store.connections : [];

  await Promise.all(
    conns.map((conn) => {
      const candidates = getOrderedCandidateKeys(conn, rawSecrets);
      const activeKey = candidates[0]?.rawKey || '';
      return probeSingleConnectionTelemetry(conn, activeKey);
    }),
  );

  return getApiHubState();
}

export async function refreshSingleConnectionTelemetry(connectionId) {
  const store = readApiHubStore();
  const conn = (store.connections || []).find((c) => c.id === connectionId);
  if (!conn) throw new Error(`Connection "${connectionId}" not found`);

  const rawSecrets = readRawSecretsServerOnly();
  const candidates = getOrderedCandidateKeys(conn, rawSecrets);
  const activeKey = candidates[0]?.rawKey || '';
  await probeSingleConnectionTelemetry(conn, activeKey);

  return getApiHubState();
}

export async function verifyConnectionOnlineStatus(connectionId) {
  if (!connectionId) return null;
  const store = readApiHubStore();
  const conn = (store.connections || []).find((c) => c.id === connectionId);
  if (!conn) return null;

  const rawSecrets = readRawSecretsServerOnly();
  const candidates = getOrderedCandidateKeys(conn, rawSecrets);
  const activeKey = candidates[0]?.rawKey || '';
  const telemetry = await probeSingleConnectionTelemetry(conn, activeKey);
  return {
    connection: conn,
    telemetry,
    isOffline: telemetry?.state === 'offline',
  };
}

/**
 * Resolves the exact inference endpoint URL, wire protocol (`openai` | `anthropic` | `gemini`),
 * and upstream model identifier for the active (or overridden) API Hub connection.
 */
export function resolveActiveGenerationTarget({ connectionId = '', modelId = '' } = {}) {
  const store = readApiHubStore();
  const rawConnections = Array.isArray(store.connections) ? store.connections : [];
  if (rawConnections.length === 0) {
    throw new Error('No API connections configured. Open API Hub to connect a provider or RP proxy.');
  }

  const conn =
    (connectionId && rawConnections.find((c) => c.id === connectionId)) ||
    rawConnections.find((c) => c.id === store.activeConnectionId) ||
    rawConnections[0] ||
    null;

  if (!conn) {
    throw new Error('Active API connection not found.');
  }

  const allModels = buildConnectionModelsList(conn);
  const targetModelId = String(
    modelId ||
      (conn.id === store.activeConnectionId ? store.activeModelId : '') ||
      conn.lastUsedModelId ||
      allModels.find((m) => m.starred)?.id ||
      allModels[0]?.id ||
      '',
  ).trim();

  if (!targetModelId) {
    throw new Error(`No model selected for "${conn.name}". Select a model in the composer bar.`);
  }

  const catalogEntry =
    allModels.find((m) => m.id === targetModelId) ||
    findEquivalentModelInCatalog(targetModelId, allModels) ||
    null;

  const upstreamModelId = String(
    catalogEntry?.upstreamModelId ||
      (targetModelId.includes('::') ? targetModelId.split('::').pop() : targetModelId),
  ).trim();

  let protocol;
  let endpointUrl;
  let routeId = '';

  if (conn.type === 'rp_proxy') {
    const base = normalizeRpProxyBaseUrl(conn.baseUrl);
    if (!base) {
      throw new Error(`RP Proxy "${conn.name}" has an empty Base URL.`);
    }
    const routes = getConnectionRoutes(conn);
    routeId =
      catalogEntry?.routeId ||
      (targetModelId.includes('::') ? targetModelId.split('::')[0] : '') ||
      conn.activeRouteId ||
      inferRpRouteIdForModel(upstreamModelId);

    const route =
      routes.find((r) => r.id === routeId) ||
      RP_ROUTE_BY_ID.get(routeId) ||
      buildRouteDescriptorFromSuffix(`/proxy/${String(routeId || 'openai').replace(/^\/+/, '')}`);

    protocol = route?.protocol || catalogEntry?.protocol || 'openai';
    const routeBase = `${base}${route.suffix}`;

    if (protocol === 'anthropic') {
      endpointUrl = `${routeBase}/v1/messages`;
    } else if (protocol === 'gemini') {
      endpointUrl = `${routeBase}/v1beta/models/${encodeURIComponent(upstreamModelId)}:streamGenerateContent?alt=sse`;
    } else {
      endpointUrl = `${routeBase}/v1/chat/completions`;
    }
  } else if (conn.type === 'official_api') {
    const off = OFFICIAL_BY_ID.get(conn.officialProviderId) || null;
    protocol = off?.protocol || catalogEntry?.protocol || 'openai';
    const rawBase = String(conn.baseUrl || off?.defaultBaseUrl || '')
      .trim()
      .replace(/\/+$/, '');
    if (!rawBase) {
      throw new Error(`Official provider "${conn.name}" has no endpoint URL.`);
    }

    if (protocol === 'anthropic') {
      endpointUrl = rawBase.endsWith('/messages')
        ? rawBase
        : rawBase.endsWith('/v1')
          ? `${rawBase}/messages`
          : `${rawBase}/v1/messages`;
    } else if (protocol === 'gemini') {
      const geminiRoot = rawBase.includes('/v1beta') ? rawBase : `${rawBase}/v1beta`;
      endpointUrl = `${geminiRoot}/models/${encodeURIComponent(upstreamModelId)}:streamGenerateContent?alt=sse`;
    } else {
      endpointUrl = rawBase.endsWith('/chat/completions')
        ? rawBase
        : `${rawBase}/chat/completions`;
    }
  } else {
    protocol = 'openai';
    const cleanBase = normalizeOaiBaseUrl(conn.baseUrl);
    if (!cleanBase) {
      throw new Error(`Connection "${conn.name}" has an empty Base URL.`);
    }
    endpointUrl = cleanBase.endsWith('/chat/completions')
      ? cleanBase
      : `${cleanBase}/chat/completions`;
  }

  return {
    connectionId: conn.id,
    connectionName: conn.name,
    connectionType: conn.type,
    routeId,
    protocol,
    endpointUrl,
    modelId: catalogEntry?.id || targetModelId,
    upstreamModelId,
    modelName: catalogEntry?.name || upstreamModelId,
    supportsReasoning: Boolean(catalogEntry?.reasoning || inferReasoningFlag(upstreamModelId)),
  };
}



