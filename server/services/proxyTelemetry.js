import { OFFICIAL_BY_ID, inferModelFamily } from './apiHubProviders.js';

const TELEMETRY_TIMEOUT_MS = 3800;

const runtimeTelemetryMap = new Map();

export function getConnectionRuntimeTelemetry(connectionId) {
  return runtimeTelemetryMap.get(connectionId) || null;
}

export function setConnectionRuntimeTelemetry(connectionId, patch = {}) {
  if (!connectionId) return null;
  const prev = runtimeTelemetryMap.get(connectionId) || {};
  const next = {
    ...prev,
    ...patch,
    checkedAt: new Date().toISOString(),
  };
  runtimeTelemetryMap.set(connectionId, next);
  return next;
}

export function recordConnectionRuntimeFailure(connectionId, errorMessage = 'Connection lost') {
  return setConnectionRuntimeTelemetry(connectionId, {
    state: 'offline',
    latencyMs: null,
    error: String(errorMessage || 'Offline').slice(0, 140),
  });
}

export function clearConnectionRuntimeTelemetry(connectionId) {
  runtimeTelemetryMap.delete(connectionId);
}

function decodeHtmlEntities(str = '') {
  return String(str)
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractJsonCandidatesFromHtml(rawBody = '') {
  const candidates = [];
  const trimmed = String(rawBody || '').trim();
  if (!trimmed) return candidates;

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      candidates.push(JSON.parse(trimmed));
      return candidates;
    } catch {
      // continue
    }
  }

  const preRegex = /<pre[^>]*>([\s\S]*?)<\/pre>/gi;
  let match;
  while ((match = preRegex.exec(trimmed)) !== null) {
    const inner = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '').trim());
    if (inner.startsWith('{') && inner.endsWith('}')) {
      try {
        candidates.push(JSON.parse(inner));
      } catch {
        // ignore
      }
    }
  }
  return candidates;
}

function toPositiveIntOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function toNonNegativeIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function parseRpProxyStatusPage(rawBody = '') {
  const routeActiveKeys = {};
  const familyActiveKeys = {};
  const lockedContextByFamily = {};
  let globalLockedContext = null;

  const objects = extractJsonCandidatesFromHtml(rawBody);

  const registerPoolCount = (rawKey, count) => {
    if (count === null) return;
    const k = String(rawKey || '').toLowerCase();
    if (k.includes('aws')) {
      routeActiveKeys['aws/claude'] = count;
      routeActiveKeys.aws = count;
    } else if (k.includes('gcp') && k.includes('claude')) {
      routeActiveKeys['gcp/claude'] = count;
    } else if (k.includes('vertex') || (k.includes('gcp') && !k.includes('claude'))) {
      routeActiveKeys.vertex = count;
      routeActiveKeys['vertex-ai'] = count;
    } else if (k.includes('google') || k.includes('gemini') || k.includes('makersuite')) {
      routeActiveKeys['google-ai'] = count;
      familyActiveKeys.gemini = count;
    } else if (k.includes('anthropic') || k === 'claude' || k === 'claudekeys') {
      routeActiveKeys.anthropic = count;
      familyActiveKeys.claude = count;
    } else if (k.includes('deepseek')) {
      routeActiveKeys.deepseek = count;
      familyActiveKeys.deepseek = count;
    } else if (k.includes('openrouter')) {
      routeActiveKeys.openrouter = count;
    } else if (k.includes('xai') || k.includes('grok')) {
      routeActiveKeys.xai = count;
      familyActiveKeys.grok = count;
    } else if (k.includes('mistral')) {
      routeActiveKeys.mistral = count;
      familyActiveKeys.mistral = count;
    } else if (k.includes('moonshot') || k.includes('kimi')) {
      routeActiveKeys.moonshot = count;
    } else if (k.includes('zai') || k.includes('glm')) {
      routeActiveKeys.zai = count;
    } else if (k.includes('openai') || k === 'gpt' || k === 'turkeys') {
      routeActiveKeys.openai = count;
      familyActiveKeys.gpt = count;
    }
  };

  const scanContextConfig = (cfg) => {
    if (!cfg || typeof cfg !== 'object') return;
    for (const [k, v] of Object.entries(cfg)) {
      const lk = k.toLowerCase();
      if (!lk.includes('maxcontext')) continue;
      const num = toPositiveIntOrNull(v);
      if (!num) continue;
      if (lk.includes('anthropic') || lk.includes('claude')) {
        lockedContextByFamily.claude = num;
      } else if (lk.includes('google') || lk.includes('gemini')) {
        lockedContextByFamily.gemini = num;
      } else if (lk.includes('openai') || lk.includes('gpt')) {
        lockedContextByFamily.gpt = num;
      } else if (lk.includes('deepseek')) {
        lockedContextByFamily.deepseek = num;
      } else if (lk.includes('mistral')) {
        lockedContextByFamily.mistral = num;
      } else if (lk.includes('xai') || lk.includes('grok')) {
        lockedContextByFamily.grok = num;
      } else if (lk === 'maxcontexttokens' || lk === 'maxcontext') {
        globalLockedContext = num;
      }
    }
  };

  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    scanContextConfig(obj);
    if (obj.config && typeof obj.config === 'object') {
      scanContextConfig(obj.config);
    }
    for (const [k, val] of Object.entries(obj)) {
      if (typeof val === 'number' && /keys$/i.test(k)) {
        registerPoolCount(k, toNonNegativeIntOrNull(val));
      } else if (val && typeof val === 'object' && !Array.isArray(val)) {
        if ('activeKeys' in val || 'active' in val) {
          registerPoolCount(k, toNonNegativeIntOrNull(val.activeKeys ?? val.active));
        }
      }
    }
  }

  return {
    routeActiveKeys,
    familyActiveKeys,
    lockedContextByFamily,
    globalLockedContext,
  };
}

export function enrichModelWithTelemetry(model, connType, telemetry) {
  if (!model) return model;
  const fam = model.family || inferModelFamily(model.upstreamModelId || model.id, model.routeId);

  let lockedCtx = toPositiveIntOrNull(model.lockedContextLength);
  const maxCtx = toPositiveIntOrNull(model.maxContextLength ?? model.contextLength);

  if (!lockedCtx && telemetry) {
    const byFam = telemetry.lockedContextByFamily || {};
    if (fam && byFam[fam]) {
      lockedCtx = byFam[fam];
    } else if (telemetry.globalLockedContext) {
      lockedCtx = telemetry.globalLockedContext;
    }
  }

  let availability = null; // 'up' | 'down' | null
  let poolActiveKeys = null;

  if (connType === 'rp_proxy' && telemetry) {
    const routePools = telemetry.routeActiveKeys || {};
    const famPools = telemetry.familyActiveKeys || {};
    if (model.routeId && model.routeId in routePools) {
      poolActiveKeys = routePools[model.routeId];
    } else if (fam && fam in famPools) {
      poolActiveKeys = famPools[fam];
    }
    if (typeof poolActiveKeys === 'number') {
      availability = poolActiveKeys > 0 ? 'up' : 'down';
    }
  }

  return {
    ...model,
    lockedContextLength: lockedCtx || null,
    maxContextLength: maxCtx || null,
    availability,
    poolActiveKeys,
  };
}

export async function probeSingleConnectionTelemetry(conn, activeRawKey = '') {
  if (!conn) return null;
  const t0 = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEMETRY_TIMEOUT_MS);

  try {
    let targetUrl = '';
    const headers = {};

    if (conn.type === 'rp_proxy') {
      // Root status page is outside `/proxy/*` rate-limiter and consumes 0 tokens / 0 RPM
      const base = String(conn.baseUrl || '').trim().replace(/\/+$/, '');
      if (!base) throw new Error('Empty proxy URL');
      targetUrl = `${base}/`;
    } else if (conn.type === 'official_api') {
      const off = OFFICIAL_BY_ID.get(conn.officialProviderId);
      const base = (off?.defaultBaseUrl || conn.baseUrl || '').replace(/\/+$/, '');
      if (off?.protocol === 'gemini') {
        targetUrl = activeRawKey
          ? `${base}/models?key=${encodeURIComponent(activeRawKey)}&pageSize=5`
          : `${base}/models?pageSize=5`;
      } else {
        targetUrl = `${base}/models`;
        if (off?.protocol === 'anthropic') {
          headers['anthropic-version'] = '2023-06-01';
          if (activeRawKey) headers['x-api-key'] = activeRawKey;
        } else if (activeRawKey) {
          headers.Authorization = `Bearer ${activeRawKey}`;
        }
      }
    } else {
      const base = String(conn.baseUrl || '').trim().replace(/\/+$/, '');
      if (!base) throw new Error('Empty endpoint URL');
      targetUrl = base.endsWith('/models') ? base : `${base}/models`;
      if (activeRawKey) headers.Authorization = `Bearer ${activeRawKey}`;
    }

    const res = await fetch(targetUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const latencyMs = Math.max(1, Math.round(performance.now() - t0));

    if (res.status >= 500) {
      return setConnectionRuntimeTelemetry(conn.id, {
        state: 'offline',
        latencyMs: null,
        error: `HTTP ${res.status}`,
      });
    }

    if (conn.type === 'rp_proxy') {
      const bodyText = await res.text().catch(() => '');
      const parsed = parseRpProxyStatusPage(bodyText);
      return setConnectionRuntimeTelemetry(conn.id, {
        state: 'online',
        latencyMs,
        error: '',
        ...parsed,
      });
    }

    // Drain body cleanly
    await res.arrayBuffer().catch(() => null);
    return setConnectionRuntimeTelemetry(conn.id, {
      state: res.ok || res.status === 401 || res.status === 403 ? 'online' : 'degraded',
      latencyMs,
      error: res.ok ? '' : `HTTP ${res.status}`,
    });
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'Timeout' : err.message || 'Unreachable';
    return recordConnectionRuntimeFailure(conn.id, msg);
  } finally {
    clearTimeout(timer);
  }
}
