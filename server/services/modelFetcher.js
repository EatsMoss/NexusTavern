import {
  OFFICIAL_BY_ID,
  buildRouteDescriptorFromSuffix,
  inferReasoningFlag,
  inferModelFamily,
  classifyKeyFailure,
} from './apiHubProviders.js';
import {
  parseRpProxyStatusPage,
  setConnectionRuntimeTelemetry,
} from './proxyTelemetry.js';
import {
  executeWithConnectionKeyFailover,
  getConnectionRoutes,
  saveFetchedConnectionCatalog,
} from './apiHubStore.js';

const FETCH_TIMEOUT_MS = 10000;
const RP_ROUTE_TIMEOUT_MS = 7500;

function buildModelsUrl(baseUrl, suffix = '/models') {
  const clean = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!clean) throw new Error('Base URL is empty');
  if (clean.endsWith('/models')) return clean;
  return `${clean}${suffix}`;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const apiMsg =
        json?.error?.message ||
        json?.error ||
        json?.message ||
        (text ? text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) : `HTTP ${res.status}`);
      const err = new Error(`Provider returned HTTP ${res.status}: ${apiMsg}`);
      err.httpStatus = res.status;
      err.bodyJson = json;
      throw err;
    }
    return json;
  } catch (err) {
    if (err.name === 'AbortError') {
      const tErr = new Error(`Connection timed out after ${Math.round(timeoutMs / 1000)}s`);
      tErr.httpStatus = 0;
      throw tErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function parseOpenAiCompatibleModels(payload, meta = {}) {
  const rawList = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : Array.isArray(payload)
        ? payload
        : [];

  const parsed = [];
  for (const item of rawList) {
    const id = String(item?.id || item?.name || '').trim();
    if (!id) continue;
    const rawModelMax = Number(item?.context_length || item?.max_model_len) || null;
    const rawProviderLocked =
      Number(
        item?.top_provider?.context_length ||
          item?.locked_context_length ||
          item?.max_context_tokens ||
          item?.proxy_max_context,
      ) || null;

    parsed.push({
      id,
      name: String(item?.name || item?.display_name || id).trim(),
      lockedContextLength: rawProviderLocked,
      maxContextLength: rawModelMax,
      contextLength: rawProviderLocked || null,
      reasoning: inferReasoningFlag(id),
      family: inferModelFamily(id, meta.routeId),
      routeId: meta.routeId || '',
      protocol: meta.protocol || 'openai',
    });
  }

  parsed.sort((a, b) => a.id.localeCompare(b.id, undefined, { sensitivity: 'base' }));
  return parsed;
}

function parseGeminiModels(payload, meta = {}) {
  const rawList = Array.isArray(payload?.models) ? payload.models : [];
  const parsed = [];
  for (const item of rawList) {
    const rawName = String(item?.name || '').trim();
    if (!rawName) continue;
    const methods = Array.isArray(item?.supportedGenerationMethods)
      ? item.supportedGenerationMethods
      : [];
    if (methods.length > 0 && !methods.includes('generateContent')) {
      continue;
    }
    const id = rawName.replace(/^models\//i, '');
    parsed.push({
      id,
      name: String(item?.displayName || id).trim(),
      lockedContextLength: null,
      maxContextLength: Number(item?.inputTokenLimit) || null,
      contextLength: null,
      reasoning: Boolean(item?.thinking) || inferReasoningFlag(id),
      family: 'gemini',
      routeId: meta.routeId || '',
      protocol: 'gemini',
    });
  }
  parsed.sort((a, b) => a.id.localeCompare(b.id, undefined, { sensitivity: 'base' }));
  return parsed;
}

function parseAnthropicModels(payload, fallbackSuggested = [], meta = {}) {
  const rawList = Array.isArray(payload?.data) ? payload.data : [];
  const sourceList = rawList.length > 0 ? rawList : fallbackSuggested;
  return sourceList
    .map((item) => {
      const id = String(item?.id || '').trim();
      if (!id) return null;
      return {
        id,
        name: String(item?.display_name || item?.name || id).trim(),
        lockedContextLength: null,
        maxContextLength: Number(item?.context_window || item?.contextLength) || null,
        contextLength: null,
        reasoning: inferReasoningFlag(id),
        family: 'claude',
        routeId: meta.routeId || '',
        protocol: 'anthropic',
      };
    })
    .filter(Boolean);
}

async function fetchModelsForProtocolUrl({
  endpointUrl,
  protocol,
  apiKey,
  routeId = '',
  fallbackModels = [],
  timeoutMs = FETCH_TIMEOUT_MS,
}) {
  if (protocol === 'gemini') {
    const sep = endpointUrl.includes('?') ? '&' : '?';
    const url = apiKey
      ? `${endpointUrl}${sep}key=${encodeURIComponent(apiKey)}&pageSize=200`
      : endpointUrl;
    const headers = apiKey ? { Authorization: `Bearer ${apiKey}`, 'x-goog-api-key': apiKey } : {};
    const json = await fetchJsonWithTimeout(url, { method: 'GET', headers }, timeoutMs);
    return parseGeminiModels(json, { routeId });
  }

  if (protocol === 'anthropic') {
    const headers = { 'anthropic-version': '2023-06-01' };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const json = await fetchJsonWithTimeout(endpointUrl, { method: 'GET', headers }, timeoutMs);
    return parseAnthropicModels(json, fallbackModels, { routeId });
  }

  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const json = await fetchJsonWithTimeout(endpointUrl, { method: 'GET', headers }, timeoutMs);
  return parseOpenAiCompatibleModels(json, { routeId, protocol });
}

export async function testAndFetchProviderModels(connectionId) {
  const t0 = performance.now();

  const outcome = await executeWithConnectionKeyFailover(
    connectionId,
    async ({ apiKey, connection }) => {
      if (connection.type === 'official_api') {
        const off = OFFICIAL_BY_ID.get(connection.officialProviderId);
        const base = (off?.defaultBaseUrl || connection.baseUrl || '').replace(/\/+$/, '');
        const models = await fetchModelsForProtocolUrl({
          endpointUrl: buildModelsUrl(base, '/models'),
          protocol: off?.protocol || 'openai',
          apiKey,
          fallbackModels: off?.suggestedModels || [],
        });
        return { models, resolvedBaseUrl: null };
      }

      if (connection.type === 'oai_proxy') {
        const cleanBase = String(connection.baseUrl || '').trim().replace(/\/+$/, '');
        if (!cleanBase) throw new Error('Base URL is required');
        try {
          const models = await fetchModelsForProtocolUrl({
            endpointUrl: buildModelsUrl(cleanBase, '/models'),
            protocol: 'openai',
            apiKey,
          });
          return { models, resolvedBaseUrl: cleanBase };
        } catch (firstErr) {
          if (!/\/v1$/i.test(cleanBase) && (firstErr.httpStatus === 404 || firstErr.httpStatus === 405)) {
            const v1Base = `${cleanBase}/v1`;
            const models = await fetchModelsForProtocolUrl({
              endpointUrl: `${v1Base}/models`,
              protocol: 'openai',
              apiKey,
            });
            return { models, resolvedBaseUrl: v1Base };
          }
          throw firstErr;
        }
      }

      const base = String(connection.baseUrl || '').trim().replace(/\/+$/, '');
      if (!base) throw new Error('Proxy Base URL is required');

      // 1. Auto-discover declared `/proxy/...` endpoints from the proxy's status/info page (`/` & `/status`)
      const discoveredMap = new Map();
      for (const r of getConnectionRoutes(connection)) {
        discoveredMap.set(r.id, r);
      }

      const scrapeUrls = [`${base}/`, `${base}/status`];
      const scrapedTexts = await Promise.all(
        scrapeUrls.map(async (u) => {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 3800);
          try {
            const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
            const r = await fetch(u, { method: 'GET', headers, signal: ctrl.signal });
            if (!r.ok) return '';
            return await r.text();
          } catch {
            return '';
          } finally {
            clearTimeout(t);
          }
        }),
      );

      const endpointRegex = /\/proxy\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*/gi;
      const combinedScraped = scrapedTexts.filter(Boolean).join('\n');
      if (combinedScraped) {
        const parsedTelemetry = parseRpProxyStatusPage(combinedScraped);
        setConnectionRuntimeTelemetry(connection.id, {
          state: 'online',
          latencyMs: Math.max(1, Math.round(performance.now() - t0)),
          error: '',
          ...parsedTelemetry,
        });
      }
      for (const body of scrapedTexts) {
        if (!body) continue;
        const matches = body.match(endpointRegex) || [];
        for (const rawMatch of matches) {
          const cleaned = rawMatch
            .replace(/\/(?:v1|v1beta)(?:\/.*)?$/i, '')
            .replace(/\/(?:models|messages|chat|completions)(?:\/.*)?$/i, '')
            .replace(/\.(?:js|css|png|svg|ico|json|html)$/i, '');
          if (!cleaned || cleaned.toLowerCase() === '/proxy') continue;
          const desc = buildRouteDescriptorFromSuffix(cleaned);
          if (desc && !discoveredMap.has(desc.id)) {
            discoveredMap.set(desc.id, desc);
          }
        }
      }

      const routes = Array.from(discoveredMap.values());

      // 2. Probe all candidate & discovered routes in parallel
      const settled = await Promise.all(
        routes.map(async (route) => {
          const fullUrl = `${base}${route.suffix}${route.modelsPath || '/v1/models'}`;
          try {
            const list = await fetchModelsForProtocolUrl({
              endpointUrl: fullUrl,
              protocol: route.protocol || 'openai',
              apiKey,
              routeId: route.id,
              fallbackModels: route.fallbackModels || [],
              timeoutMs: RP_ROUTE_TIMEOUT_MS,
            });
            return { ok: true, route, models: list };
          } catch (err) {
            return { ok: false, route, err };
          }
        }),
      );

      const mergedMap = new Map();
      const liveRouteIds = [];
      let hardKeyError = null;
      let gatewayErr = null;

      for (const res of settled) {
        if (res.ok && res.models.length > 0) {
          liveRouteIds.push(res.route.id);
        }
      }

      const multipleLiveRoutes = liveRouteIds.length > 1;

      for (const res of settled) {
        if (res.ok) {
          for (const m of res.models) {
            const collision = mergedMap.has(m.id) && mergedMap.get(m.id).routeId !== res.route.id;
            const entryId = collision ? `${res.route.id}::${m.id}` : m.id;
            if (!mergedMap.has(entryId)) {
              mergedMap.set(entryId, {
                ...m,
                id: entryId,
                upstreamModelId: m.id,
                name:
                  collision || (multipleLiveRoutes && res.route.id.includes('/'))
                    ? `${m.name || m.id}`
                    : m.name || m.id,
                routeId: res.route.id,
              });
            }
          }
        } else {
          const verdict = classifyKeyFailure({
            status: res.err?.httpStatus || 0,
            message: res.err?.message || '',
            bodyJson: res.err?.bodyJson || null,
          });
          if (verdict.markDead || verdict.kind === 'rate_limit') hardKeyError = res.err;
          else if (verdict.kind === 'proxy_down') gatewayErr = res.err;
        }
      }

      if (mergedMap.size === 0 && hardKeyError) throw hardKeyError;
      if (
        mergedMap.size === 0 &&
        gatewayErr &&
        settled.every((s) => !s.ok && (s.err?.httpStatus === 0 || s.err?.httpStatus >= 500))
      ) {
        throw gatewayErr;
      }

      if (mergedMap.size === 0) {
        for (const r of getConnectionRoutes(connection)) {
          for (const fm of r.fallbackModels || []) {
            if (!mergedMap.has(fm.id)) {
              mergedMap.set(fm.id, {
                ...fm,
                upstreamModelId: fm.id,
                family: r.family || inferModelFamily(fm.id, r.id),
                routeId: r.id,
                protocol: r.protocol || 'openai',
              });
            }
          }
        }
      }

      return {
        models: Array.from(mergedMap.values()),
        resolvedBaseUrl: null,
        discoveredRoutes: liveRouteIds,
      };
    },
  );

  const hub = await saveFetchedConnectionCatalog(
    connectionId,
    outcome.models,
    outcome.resolvedBaseUrl,
    outcome.discoveredRoutes || null,
  );
  return {
    fetchedCount: outcome.models.length,
    discoveredRoutes: outcome.discoveredRoutes || [],
    elapsedMs: Math.round(performance.now() - t0),
    hub,
  };
}

