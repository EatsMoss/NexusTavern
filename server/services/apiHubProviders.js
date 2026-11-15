/**
 * Canonical provider, proxy-route, model-matching, and key-health rules for API Hub v2.
 * Hierarchy:
 *   1. `rp_proxy`     — Multi-provider RP Reverse Proxy (1 Base URL + Keychain -> multiple `/proxy/...` routes)
 *   2. `oai_proxy`    — OpenAI-Compatible Proxy / Aggregator (1 `/v1` URL + Keychain -> unified `/models` list)
 *   3. `official_api` — Direct Official Provider API (Fixed endpoint + Keychain)
 */

export const DEFAULT_RP_PROXY_ROUTES = [
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    family: 'claude',
    suffix: '/proxy/anthropic',
    modelsPath: '/v1/models',
    protocol: 'anthropic',
    stSource: 'claude',
    stModelField: 'claude_model',
    fallbackModels: [
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', contextLength: 200000, reasoning: true },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextLength: 200000, reasoning: true },
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', contextLength: 200000, reasoning: true },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextLength: 200000, reasoning: false },
    ],
  },
  {
    id: 'gcp/claude',
    label: 'Claude (GCP Vertex)',
    family: 'claude',
    suffix: '/proxy/gcp/claude',
    modelsPath: '/v1/models',
    protocol: 'anthropic',
    stSource: 'claude',
    stModelField: 'claude_model',
    fallbackModels: [],
  },
  {
    id: 'aws/claude',
    label: 'Claude (AWS Bedrock)',
    family: 'claude',
    suffix: '/proxy/aws/claude',
    modelsPath: '/v1/models',
    protocol: 'anthropic',
    stSource: 'claude',
    stModelField: 'claude_model',
    fallbackModels: [],
  },
  {
    id: 'aws',
    label: 'AWS Bedrock',
    family: 'claude',
    suffix: '/proxy/aws',
    modelsPath: '/v1/models',
    protocol: 'anthropic',
    stSource: 'claude',
    stModelField: 'claude_model',
    fallbackModels: [],
  },
  {
    id: 'google-ai',
    label: 'Gemini (Google AI)',
    family: 'gemini',
    suffix: '/proxy/google-ai',
    modelsPath: '/v1beta/models',
    protocol: 'gemini',
    stSource: 'makersuite',
    stModelField: 'google_model',
    fallbackModels: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextLength: 1048576, reasoning: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextLength: 1048576, reasoning: true },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextLength: 1048576, reasoning: false },
    ],
  },
  {
    id: 'vertex-ai',
    label: 'Vertex AI',
    family: 'gemini',
    suffix: '/proxy/vertex-ai',
    modelsPath: '/v1/models',
    protocol: 'openai',
    stSource: 'vertexai',
    stModelField: 'vertexai_model',
    fallbackModels: [],
  },
  {
    id: 'vertex',
    label: 'Vertex Gemini',
    family: 'gemini',
    suffix: '/proxy/vertex',
    modelsPath: '/v1/models',
    protocol: 'openai',
    stSource: 'vertexai',
    stModelField: 'vertexai_model',
    fallbackModels: [],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (Proxy)',
    family: 'other',
    suffix: '/proxy/openrouter',
    modelsPath: '/v1/models',
    protocol: 'openai',
    stSource: 'openrouter',
    stModelField: 'openrouter_model',
    fallbackModels: [],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    family: 'deepseek',
    suffix: '/proxy/deepseek',
    modelsPath: '/v1/models',
    protocol: 'openai',
    stSource: 'deepseek',
    stModelField: 'deepseek_model',
    fallbackModels: [
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', contextLength: 65536, reasoning: true },
      { id: 'deepseek-chat', name: 'DeepSeek V3', contextLength: 65536, reasoning: false },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    family: 'gpt',
    suffix: '/proxy/openai',
    modelsPath: '/v1/models',
    protocol: 'openai',
    stSource: 'openai',
    stModelField: 'openai_model',
    fallbackModels: [
      { id: 'gpt-4.1', name: 'GPT-4.1', contextLength: 1047576, reasoning: false },
      { id: 'gpt-4o', name: 'GPT-4o', contextLength: 128000, reasoning: false },
      { id: 'o3-mini', name: 'o3-mini', contextLength: 200000, reasoning: true },
    ],
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    family: 'grok',
    suffix: '/proxy/xai',
    modelsPath: '/v1/models',
    protocol: 'openai',
    stSource: 'xai',
    stModelField: 'xai_model',
    fallbackModels: [
      { id: 'grok-3-beta', name: 'Grok 3', contextLength: 131072, reasoning: false },
      { id: 'grok-3-mini-beta', name: 'Grok 3 Mini', contextLength: 131072, reasoning: true },
    ],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    family: 'mistral',
    suffix: '/proxy/mistral',
    modelsPath: '/v1/models',
    protocol: 'openai',
    stSource: 'mistralai',
    stModelField: 'mistralai_model',
    fallbackModels: [
      { id: 'mistral-large-latest', name: 'Mistral Large', contextLength: 131072, reasoning: false },
    ],
  },
  {
    id: 'zai',
    label: 'Z.AI (GLM)',
    family: 'other',
    suffix: '/proxy/zai',
    modelsPath: '/v1/models',
    protocol: 'openai',
    stSource: 'zai',
    stModelField: 'zai_model',
    fallbackModels: [],
  },
  {
    id: 'moonshot',
    label: 'Moonshot (Kimi)',
    family: 'other',
    suffix: '/proxy/moonshot',
    modelsPath: '/v1/models',
    protocol: 'openai',
    stSource: 'moonshot',
    stModelField: 'moonshot_model',
    fallbackModels: [],
  },
];

export const RP_ROUTE_BY_ID = new Map(DEFAULT_RP_PROXY_ROUTES.map((r) => [r.id, r]));

export const OAI_COMPATIBLE_PRESETS = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyPlaceholder: 'sk-or-v1-...',
    requiresApiKey: true,
    stSource: 'openrouter',
    stModelField: 'openrouter_model',
    secretKeyHint: 'api_key_openrouter',
  },
  {
    id: 'featherless',
    name: 'Featherless AI',
    baseUrl: 'https://api.featherless.ai/v1',
    keyPlaceholder: 'rc_...',
    requiresApiKey: true,
  },
  {
    id: 'nanogpt',
    name: 'NanoGPT',
    baseUrl: 'https://nano-gpt.com/api/v1',
    keyPlaceholder: '...',
    requiresApiKey: true,
  },
  {
    id: 'chutes',
    name: 'Chutes AI',
    baseUrl: 'https://llm.chutes.ai/v1',
    keyPlaceholder: 'cpk_...',
    requiresApiKey: true,
  },
  {
    id: 'electronhub',
    name: 'ElectronHub',
    baseUrl: 'https://api.electronhub.top/v1',
    keyPlaceholder: 'ek-...',
    requiresApiKey: true,
  },
  {
    id: 'local_ollama',
    name: 'Local (Ollama / vLLM)',
    baseUrl: 'http://localhost:11434/v1',
    keyPlaceholder: 'Optional for local server',
    requiresApiKey: false,
  },
];

export const OFFICIAL_API_PROVIDERS = [
  {
    id: 'makersuite',
    name: 'Google AI Studio (Gemini)',
    stSource: 'makersuite',
    stModelField: 'google_model',
    secretKey: 'api_key_makersuite',
    keyPlaceholder: 'AIzaSy...',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    protocol: 'gemini',
    requiresApiKey: true,
    suggestedModels: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextLength: 1048576, reasoning: true },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextLength: 1048576, reasoning: true },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextLength: 1048576, reasoning: false },
    ],
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    stSource: 'claude',
    stModelField: 'claude_model',
    secretKey: 'api_key_claude',
    keyPlaceholder: 'sk-ant-...',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    protocol: 'anthropic',
    requiresApiKey: true,
    suggestedModels: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextLength: 200000, reasoning: true },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', contextLength: 200000, reasoning: true },
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', contextLength: 200000, reasoning: true },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextLength: 200000, reasoning: false },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek Official',
    stSource: 'deepseek',
    stModelField: 'deepseek_model',
    secretKey: 'api_key_deepseek',
    keyPlaceholder: 'sk-...',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    protocol: 'openai',
    requiresApiKey: true,
    suggestedModels: [
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', contextLength: 65536, reasoning: true },
      { id: 'deepseek-chat', name: 'DeepSeek V3', contextLength: 65536, reasoning: false },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI Official',
    stSource: 'openai',
    stModelField: 'openai_model',
    secretKey: 'api_key_openai',
    keyPlaceholder: 'sk-...',
    defaultBaseUrl: 'https://api.openai.com/v1',
    protocol: 'openai',
    requiresApiKey: true,
    suggestedModels: [
      { id: 'gpt-4.1', name: 'GPT-4.1', contextLength: 1047576, reasoning: false },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', contextLength: 1047576, reasoning: false },
      { id: 'gpt-4o', name: 'GPT-4o', contextLength: 128000, reasoning: false },
      { id: 'o3-mini', name: 'o3-mini', contextLength: 200000, reasoning: true },
    ],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    stSource: 'xai',
    stModelField: 'xai_model',
    secretKey: 'api_key_xai',
    keyPlaceholder: 'xai-...',
    defaultBaseUrl: 'https://api.x.ai/v1',
    protocol: 'openai',
    requiresApiKey: true,
    suggestedModels: [
      { id: 'grok-3-beta', name: 'Grok 3', contextLength: 131072, reasoning: false },
      { id: 'grok-3-mini-beta', name: 'Grok 3 Mini', contextLength: 131072, reasoning: true },
    ],
  },
  {
    id: 'mistralai',
    name: 'Mistral AI',
    stSource: 'mistralai',
    stModelField: 'mistralai_model',
    secretKey: 'api_key_mistralai',
    keyPlaceholder: '...',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    protocol: 'openai',
    requiresApiKey: true,
    suggestedModels: [
      { id: 'mistral-large-latest', name: 'Mistral Large', contextLength: 131072, reasoning: false },
    ],
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    stSource: 'groq',
    stModelField: 'groq_model',
    secretKey: 'api_key_groq',
    keyPlaceholder: 'gsk_...',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    protocol: 'openai',
    requiresApiKey: true,
    suggestedModels: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', contextLength: 131072, reasoning: false },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 70B', contextLength: 131072, reasoning: true },
    ],
  },
];

export const OFFICIAL_BY_ID = new Map(OFFICIAL_API_PROVIDERS.map((p) => [p.id, p]));


export function normalizeRpProxyBaseUrl(rawUrl = '', customRoutes = []) {
  let clean = String(rawUrl || '').trim().replace(/\/+$/, '');
  if (!clean) return '';

  clean = clean
    .replace(/\/(?:v1|v1beta)\/(?:chat\/completions|completions|messages|models)$/i, '')
    .replace(/\/(?:chat\/completions|completions|messages|models)$/i, '')
    .replace(/\/(?:v1|v1beta)$/i, '')
    .replace(/\/+$/, '');

  const suffixes = [
    ...DEFAULT_RP_PROXY_ROUTES.map((r) => r.suffix),
    ...(Array.isArray(customRoutes) ? customRoutes.map((r) => r?.suffix).filter(Boolean) : []),
    '/proxy/claude',
    '/proxy/gemini',
    '/proxy/google',
    '/proxy/mistralai',
  ]
    .map((s) => String(s || '').trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const lower = clean.toLowerCase();
  for (const sfx of suffixes) {
    if (lower.endsWith(sfx.toLowerCase())) {
      clean = clean.slice(0, clean.length - sfx.length).replace(/\/+$/, '');
      break;
    }
  }

  clean = clean.replace(/\/proxy\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*$/i, '').replace(/\/+$/, '');
  return clean;
}

/**
 * Builds a complete route descriptor for any dynamically discovered `/proxy/...` suffix
 * scraped from an `oai-reverse-proxy` status/info page (e.g. `/proxy/gcp/claude`, `/proxy/aws/claude`, `/proxy/openrouter`).
 */
export function buildRouteDescriptorFromSuffix(rawSuffix = '') {
  const cleanSuffix = `/${String(rawSuffix || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')}`;
  const id = cleanSuffix.replace(/^\/proxy\//i, '').toLowerCase();
  if (!id) return null;

  const known = RP_ROUTE_BY_ID.get(id);
  if (known) return { ...known };

  const lower = id.toLowerCase();
  const isAnthropic = lower.includes('anthropic') || lower.includes('claude') || lower === 'aws';
  const isGemini = lower === 'google-ai' || lower.endsWith('/google-ai');

  return {
    id,
    label: id,
    family: isAnthropic ? 'claude' : isGemini || lower.includes('vertex') ? 'gemini' : 'other',
    suffix: cleanSuffix,
    modelsPath: isGemini ? '/v1beta/models' : '/v1/models',
    protocol: isAnthropic ? 'anthropic' : isGemini ? 'gemini' : 'openai',
    stSource: isAnthropic ? 'claude' : isGemini ? 'makersuite' : 'custom',
    stModelField: isAnthropic ? 'claude_model' : isGemini ? 'google_model' : 'custom_model',
    fallbackModels: [],
  };
}

export function normalizeOaiBaseUrl(rawUrl = '') {
  let clean = String(rawUrl || '').trim().replace(/\/+$/, '');
  if (!clean) return '';
  clean = clean
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/completions$/i, '')
    .replace(/\/models$/i, '')
    .replace(/\/+$/, '');
  return clean;
}

export function deriveConnectionNameFromUrl(rawUrl = '', fallback = 'Proxy') {
  const str = String(rawUrl || '').trim();
  if (!str) return fallback;
  const matchedPreset = OAI_COMPATIBLE_PRESETS.find((p) =>
    str.toLowerCase().startsWith(p.baseUrl.replace(/\/v1$/i, '').toLowerCase()),
  );
  if (matchedPreset) return matchedPreset.name;

  try {
    const withProto = /^https?:\/\//i.test(str) ? str : `https://${str}`;
    const u = new URL(withProto);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      return u.port ? `Local :${u.port}` : 'Local Server';
    }
    return u.hostname.replace(/^www\./i, '') || fallback;
  } catch {
    return fallback;
  }
}

export function inferReasoningFlag(modelId = '') {
  const s = String(modelId || '').toLowerCase();
  return (
    s.includes('reasoner') ||
    s.includes('deepseek-r1') ||
    s.includes('/r1') ||
    s.includes('thinking') ||
    s.includes('qwq') ||
    s.startsWith('o1') ||
    s.startsWith('o3') ||
    s.startsWith('o4') ||
    s.includes('/o1') ||
    s.includes('/o3') ||
    s.includes('claude-3-7') ||
    s.includes('claude-sonnet-4') ||
    s.includes('claude-opus-4') ||
    s.includes('gemini-2.5')
  );
}

export function inferModelFamily(modelId = '', routeId = '') {
  const s = String(modelId || '').toLowerCase();
  const r = String(routeId || '').toLowerCase();
  if (s.includes('claude') || r === 'anthropic') return 'claude';
  if (s.includes('gemini') || s.includes('gemma') || r === 'google-ai' || r === 'vertex-ai') {
    return 'gemini';
  }
  if (s.includes('deepseek') || r === 'deepseek') return 'deepseek';
  if (
    s.includes('gpt-') ||
    s.includes('chatgpt') ||
    /^o[134](?:[-/]|$)/.test(s) ||
    s.includes('/o1') ||
    s.includes('/o3') ||
    r === 'openai'
  ) {
    return 'gpt';
  }
  if (s.includes('grok') || r === 'xai') return 'grok';
  if (s.includes('mistral') || s.includes('pixtral') || s.includes('codestral') || r === 'mistral') {
    return 'mistral';
  }
  if (s.includes('llama')) return 'llama';
  if (s.includes('qwen') || s.includes('qwq')) return 'qwen';
  return 'other';
}

export function inferRpRouteIdForModel(modelId = '') {
  const fam = inferModelFamily(modelId);
  if (fam === 'claude') return 'anthropic';
  if (fam === 'gemini') return 'google-ai';
  if (fam === 'deepseek') return 'deepseek';
  if (fam === 'grok') return 'xai';
  if (fam === 'mistral') return 'mistral';
  return 'openai';
}

export function canonicalModelSlug(modelId = '') {
  let s = String(modelId || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^models\//, '');
  if (s.includes('/')) {
    s = s.split('/').pop() || s;
  }
  s = s.replace(/:[a-z0-9_-]+$/i, '');
  return s;
}

export function findEquivalentModelInCatalog(desiredModelId = '', targetModels = []) {
  const cleanDesired = String(desiredModelId || '').trim();
  if (!cleanDesired || !Array.isArray(targetModels) || targetModels.length === 0) return null;

  const exact = targetModels.find((m) => m.id === cleanDesired);
  if (exact) return exact;

  const lower = cleanDesired.toLowerCase();
  const ci = targetModels.find((m) => String(m.id || '').toLowerCase() === lower);
  if (ci) return ci;

  const desiredSlug = canonicalModelSlug(cleanDesired);
  if (!desiredSlug) return null;

  const slugMatch = targetModels.find((m) => canonicalModelSlug(m.id) === desiredSlug);
  if (slugMatch) return slugMatch;

  const desiredWithoutDate = desiredSlug.replace(/-\d{8}$/, '').replace(/-latest$/, '');
  if (desiredWithoutDate && desiredWithoutDate.length >= 5) {
    const baseMatch = targetModels.find((m) => {
      const mBase = canonicalModelSlug(m.id).replace(/-\d{8}$/, '').replace(/-latest$/, '');
      return mBase === desiredWithoutDate;
    });
    if (baseMatch) return baseMatch;
  }

  return null;
}


/**
 * Classifies an HTTP / network error during key execution so we strictly distinguish:
 *  - `'dead'`          -> Key itself is permanently invalid, revoked, banned, expired, or out of balance/quota.
 *  - `'rate_limit'`    -> Temporary per-key rate limit (`429`); rotate to next key now, do NOT mark dead.
 *  - `'proxy_down'`    -> Proxy / upstream server error (`500/502/503/504`, DNS, timeout); key is NOT at fault!
 *  - `'request_error'` -> Bad request payload (`400`, unsupported parameter/turn); neither key nor proxy is dead.
 */
export function classifyKeyFailure({ status = 0, message = '', bodyJson = null } = {}) {
  const code = Number(status) || 0;
  const rawErrType = String(
    bodyJson?.error?.type || bodyJson?.error?.code || bodyJson?.code || '',
  ).toLowerCase();
  const text = `${message || ''} ${bodyJson?.error?.message || ''} ${rawErrType}`.toLowerCase();

  if (
    code >= 500 ||
    code === 0 ||
    text.includes('timed out') ||
    text.includes('econnrefused') ||
    text.includes('enotfound') ||
    text.includes('bad gateway') ||
    text.includes('service unavailable') ||
    text.includes('cloudflare')
  ) {
    return {
      kind: 'proxy_down',
      markDead: false,
      shouldTryNextKey: false,
      reason: message || `Proxy error (${code || 'network'})`,
    };
  }

  if (
    code === 401 ||
    rawErrType.includes('invalid_api_key') ||
    rawErrType.includes('authentication_error') ||
    rawErrType.includes('permission_denied') ||
    text.includes('invalid api key') ||
    text.includes('incorrect api key') ||
    text.includes('api key not valid') ||
    text.includes('invalid proxy key') ||
    text.includes('invalid password') ||
    text.includes('unauthorized') ||
    text.includes('key has been disabled') ||
    text.includes('key revoked') ||
    text.includes('user not found') ||
    text.includes('account deactivated') ||
    text.includes('banned') ||
    text.includes('key expired')
  ) {
    return {
      kind: 'dead',
      markDead: true,
      shouldTryNextKey: true,
      reason: code === 401 ? 'Invalid or revoked key (401)' : 'Key rejected or disabled',
    };
  }

  if (
    code === 402 ||
    rawErrType === 'insufficient_quota' ||
    rawErrType === 'billing_hard_limit_reached' ||
    text.includes('insufficient_quota') ||
    text.includes('exceeded your current quota') ||
    text.includes('insufficient balance') ||
    text.includes('out of credits') ||
    text.includes('credits exhausted') ||
    text.includes('quota exhausted') ||
    text.includes('token quota exhausted') ||
    text.includes('key limit reached') ||
    text.includes('payment required')
  ) {
    return {
      kind: 'dead',
      markDead: true,
      shouldTryNextKey: true,
      reason: 'Quota / balance exhausted',
    };
  }

  if (code === 403) {
    if (
      text.includes('key') ||
      text.includes('banned') ||
      text.includes('suspended') ||
      text.includes('disabled') ||
      text.includes('revoked') ||
      text.includes('quota')
    ) {
      return {
        kind: 'dead',
        markDead: true,
        shouldTryNextKey: true,
        reason: 'Key forbidden / suspended (403)',
      };
    }
    return {
      kind: 'rate_limit',
      markDead: false,
      shouldTryNextKey: true,
      reason: 'Access denied on this key (403)',
    };
  }

  if (code === 429 || rawErrType.includes('rate_limit') || text.includes('rate limit')) {
    return {
      kind: 'rate_limit',
      markDead: false,
      shouldTryNextKey: true,
      reason: 'Rate limited (429)',
    };
  }

  return {
    kind: 'request_error',
    markDead: false,
    shouldTryNextKey: false,
    reason: message || `HTTP ${code}`,
  };
}

