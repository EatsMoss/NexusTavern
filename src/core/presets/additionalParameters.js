import YAML from 'yaml';

const PROTECTED_BODY_KEYS = new Set(['model', 'messages', 'contents', 'stream']);

const FORBIDDEN_HEADER_NAMES = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'upgrade',
]);

function isPlainObject(val) {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function formatYamlError(err) {
  if (!err) return 'Invalid YAML / JSON syntax';
  const rawMsg = String(err.message || 'Invalid YAML / JSON syntax');
  const firstLine = rawMsg.split(/\r?\n/)[0].trim();
  if (Array.isArray(err.linePos) && err.linePos[0]?.line && !/line\s+\d+/i.test(firstLine)) {
    const { line, col } = err.linePos[0];
    return `Line ${line}${col ? `:${col}` : ''} — ${firstLine}`;
  }
  return firstLine || 'Invalid YAML / JSON syntax';
}

function parseRawYamlValue(raw) {
  const str = typeof raw === 'string' ? raw : '';
  if (!str.trim()) return { empty: true, parsed: null, error: null };
  try {
    const parsed = YAML.parse(str);
    if (parsed === null || parsed === undefined) {
      return { empty: true, parsed: null, error: null };
    }
    return { empty: false, parsed, error: null };
  } catch (err) {
    return { empty: false, parsed: null, error: formatYamlError(err) };
  }
}

export function parseAdditionalBodyInclude(raw) {
  const base = parseRawYamlValue(raw);
  if (base.error) {
    return { empty: false, valid: false, value: {}, count: 0, warning: null, error: base.error };
  }
  if (base.empty) {
    return { empty: true, valid: true, value: {}, count: 0, warning: null, error: null };
  }

  const merged = {};
  if (Array.isArray(base.parsed)) {
    if (base.parsed.length === 0) {
      return { empty: true, valid: true, value: {}, count: 0, warning: null, error: null };
    }
    for (const item of base.parsed) {
      if (!isPlainObject(item)) {
        return {
          empty: false,
          valid: false,
          value: {},
          count: 0,
          warning: null,
          error: 'Expected a YAML/JSON key-value mapping (e.g. top_k: 40)',
        };
      }
      Object.assign(merged, item);
    }
  } else if (isPlainObject(base.parsed)) {
    Object.assign(merged, base.parsed);
  } else {
    return {
      empty: false,
      valid: false,
      value: {},
      count: 0,
      warning: null,
      error: 'Expected a YAML/JSON key-value mapping (e.g. top_k: 40)',
    };
  }

  const allKeys = Object.keys(merged);
  const overriddenProtected = allKeys.filter((k) => k === 'messages' || k === 'contents');
  for (const k of overriddenProtected) delete merged[k];

  const warning =
    overriddenProtected.length > 0
      ? `"${overriddenProtected.join(', ')}" is managed by Prompt Manager and will be ignored`
      : null;

  return {
    empty: allKeys.length === 0,
    valid: true,
    value: merged,
    count: Object.keys(merged).length,
    warning,
    error: null,
  };
}

export function parseAdditionalBodyExclude(raw) {
  const base = parseRawYamlValue(raw);
  if (base.error) {
    return { empty: false, valid: false, keys: [], count: 0, warning: null, error: base.error };
  }
  if (base.empty) {
    return { empty: true, valid: true, keys: [], count: 0, warning: null, error: null };
  }

  let candidateKeys = [];
  if (Array.isArray(base.parsed)) {
    for (const item of base.parsed) {
      if (typeof item !== 'string' || !item.trim()) {
        return {
          empty: false,
          valid: false,
          keys: [],
          count: 0,
          warning: null,
          error: 'Expected a YAML list of parameter names (e.g. - frequency_penalty)',
        };
      }
      candidateKeys.push(item.trim());
    }
  } else if (typeof base.parsed === 'string') {
    if (base.parsed.trim()) candidateKeys.push(base.parsed.trim());
  } else if (isPlainObject(base.parsed)) {
    candidateKeys = Object.keys(base.parsed)
      .map((k) => k.trim())
      .filter(Boolean);
  } else {
    return {
      empty: false,
      valid: false,
      keys: [],
      count: 0,
      warning: null,
      error: 'Expected a YAML list of parameter names (e.g. - frequency_penalty)',
    };
  }

  const unique = Array.from(new Set(candidateKeys));
  const blocked = unique.filter((k) => PROTECTED_BODY_KEYS.has(k));
  const safeKeys = unique.filter((k) => !PROTECTED_BODY_KEYS.has(k));
  const warning =
    blocked.length > 0
      ? `Protected transport key${blocked.length > 1 ? 's' : ''} (${blocked.join(', ')}) cannot be excluded`
      : null;

  return {
    empty: unique.length === 0,
    valid: true,
    keys: safeKeys,
    count: safeKeys.length,
    warning,
    error: null,
  };
}

export function parseAdditionalHeadersInclude(raw) {
  const base = parseRawYamlValue(raw);
  if (base.error) {
    return { empty: false, valid: false, headers: {}, count: 0, warning: null, error: base.error };
  }
  if (base.empty) {
    return { empty: true, valid: true, headers: {}, count: 0, warning: null, error: null };
  }

  const rawMap = {};
  if (Array.isArray(base.parsed)) {
    if (base.parsed.length === 0) {
      return { empty: true, valid: true, headers: {}, count: 0, warning: null, error: null };
    }
    for (const item of base.parsed) {
      if (!isPlainObject(item)) {
        return {
          empty: false,
          valid: false,
          headers: {},
          count: 0,
          warning: null,
          error: 'Expected a YAML/JSON header map (e.g. X-Custom-Header: value)',
        };
      }
      Object.assign(rawMap, item);
    }
  } else if (isPlainObject(base.parsed)) {
    Object.assign(rawMap, base.parsed);
  } else {
    return {
      empty: false,
      valid: false,
      headers: {},
      count: 0,
      warning: null,
      error: 'Expected a YAML/JSON header map (e.g. X-Custom-Header: value)',
    };
  }

  const headers = {};
  const skippedForbidden = [];

  for (const [rawName, rawVal] of Object.entries(rawMap)) {
    const name = String(rawName || '').trim();
    if (!name) continue;

    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
      return {
        empty: false,
        valid: false,
        headers: {},
        count: 0,
        warning: null,
        error: `Invalid HTTP header name "${name}"`,
      };
    }

    if (rawVal !== null && typeof rawVal === 'object') {
      return {
        empty: false,
        valid: false,
        headers: {},
        count: 0,
        warning: null,
        error: `Header "${name}" value must be a string, number, or boolean`,
      };
    }

    if (FORBIDDEN_HEADER_NAMES.has(name.toLowerCase())) {
      skippedForbidden.push(name);
      continue;
    }

    if (rawVal === null || rawVal === undefined) continue;
    const strVal = String(rawVal);
    if (/[\r\n]/.test(strVal)) {
      return {
        empty: false,
        valid: false,
        headers: {},
        count: 0,
        warning: null,
        error: `Header "${name}" cannot contain newline characters`,
      };
    }

    headers[name] = strVal;
  }

  const warning =
    skippedForbidden.length > 0
      ? `Restricted transport header${skippedForbidden.length > 1 ? 's' : ''} (${skippedForbidden.join(', ')}) ignored`
      : null;

  return {
    empty: Object.keys(rawMap).length === 0,
    valid: true,
    headers,
    count: Object.keys(headers).length,
    warning,
    error: null,
  };
}

export const DEFAULT_GEMINI_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'OFF' },
];

function normalizeHarmCategory(rawCat) {
  const clean = String(rawCat || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  if (!clean) return '';
  return clean.startsWith('HARM_CATEGORY_') ? clean : `HARM_CATEGORY_${clean}`;
}

function normalizeSafetySettingsEntries(rawSafety) {
  const entries = [];
  if (Array.isArray(rawSafety)) {
    for (const item of rawSafety) {
      if (!isPlainObject(item)) continue;
      const category = normalizeHarmCategory(item.category);
      const threshold = String(item.threshold || '').trim().toUpperCase();
      if (category && threshold) entries.push({ category, threshold });
    }
  } else if (isPlainObject(rawSafety)) {
    for (const [rawCat, rawThresh] of Object.entries(rawSafety)) {
      const category = normalizeHarmCategory(rawCat);
      const threshold = String(rawThresh ?? '').trim().toUpperCase();
      if (category && threshold) entries.push({ category, threshold });
    }
  }
  return entries;
}

function mergeSafetySettingsByCategory(existingList, rawSafety) {
  const incoming = normalizeSafetySettingsEntries(rawSafety);
  if (incoming.length === 0) {
    return Array.isArray(existingList) ? existingList : [];
  }
  const base = Array.isArray(existingList)
    ? existingList.map((item) => ({ ...item }))
    : DEFAULT_GEMINI_SAFETY_SETTINGS.map((item) => ({ ...item }));

  for (const entry of incoming) {
    const idx = base.findIndex((x) => x.category === entry.category);
    if (idx >= 0) {
      base[idx] = { ...base[idx], threshold: entry.threshold };
    } else {
      base.push(entry);
    }
  }
  return base;
}

function normalizeStopArray(val) {
  if (Array.isArray(val)) {
    return val.map((v) => String(v ?? '')).filter((s) => s.length > 0);
  }
  if (typeof val === 'string' && val.length > 0) return [val];
  return null;
}

function deepMergeInto(target, source) {
  for (const [key, val] of Object.entries(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (isPlainObject(val) && isPlainObject(target[key])) {
      target[key] = deepMergeInto({ ...target[key] }, val);
    } else {
      target[key] = val;
    }
  }
  return target;
}

function deleteNestedKey(target, keyPath) {
  if (!keyPath || !isPlainObject(target)) return;
  if (Object.prototype.hasOwnProperty.call(target, keyPath)) {
    delete target[keyPath];
    return;
  }
  if (!keyPath.includes('.')) return;
  const parts = keyPath.split('.').filter(Boolean);
  if (parts.length < 2) return;
  let cur = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!isPlainObject(cur[parts[i]])) return;
    cur = cur[parts[i]];
  }
  const leaf = parts[parts.length - 1];
  if (!PROTECTED_BODY_KEYS.has(leaf)) {
    delete cur[leaf];
  }
}

const GEMINI_SCALAR_MAP = [
  ['temperature', 'temperature'],
  ['top_p', 'topP'],
  ['top_k', 'topK'],
  ['presence_penalty', 'presencePenalty'],
  ['frequency_penalty', 'frequencyPenalty'],
  ['seed', 'seed'],
  ['response_mime_type', 'responseMimeType'],
  ['response_schema', 'responseSchema'],
  ['candidate_count', 'candidateCount'],
  ['n', 'candidateCount'],
];

export function applyAdditionalBodyParameters(
  body,
  { includeRaw = '', excludeRaw = '', protocol = '' } = {},
) {
  if (!isPlainObject(body)) return body;

  const proto =
    protocol ||
    (Array.isArray(body.contents) && isPlainObject(body.generationConfig) ? 'gemini' : 'openai');

  const inc = parseAdditionalBodyInclude(includeRaw);
  if (inc.valid && inc.count > 0) {
    const rest = { ...inc.value };

    if (proto === 'gemini') {
      if (!isPlainObject(body.generationConfig)) body.generationConfig = {};
      const explicitGen = isPlainObject(rest.generationConfig) ? rest.generationConfig : {};

      const rawStop = rest.stop !== undefined ? rest.stop : rest.stop_sequences;
      if (rawStop !== undefined && explicitGen.stopSequences === undefined) {
        const stops = normalizeStopArray(rawStop);
        if (stops) body.generationConfig.stopSequences = stops;
      }
      delete rest.stop;
      delete rest.stop_sequences;

      const rawMaxTok =
        rest.max_tokens !== undefined ? rest.max_tokens : rest.max_completion_tokens;
      if (rawMaxTok !== undefined && explicitGen.maxOutputTokens === undefined) {
        const n = Number(rawMaxTok);
        if (Number.isFinite(n) && n > 0) body.generationConfig.maxOutputTokens = n;
      }
      delete rest.max_tokens;
      delete rest.max_completion_tokens;

      for (const [srcKey, dstKey] of GEMINI_SCALAR_MAP) {
        if (rest[srcKey] !== undefined && explicitGen[dstKey] === undefined) {
          body.generationConfig[dstKey] = rest[srcKey];
        }
        delete rest[srcKey];
      }

      if (rest.safety_settings !== undefined) {
        body.safetySettings = mergeSafetySettingsByCategory(
          body.safetySettings,
          rest.safety_settings,
        );
        delete rest.safety_settings;
      }
      if (rest.safetySettings !== undefined) {
        body.safetySettings = mergeSafetySettingsByCategory(
          body.safetySettings,
          rest.safetySettings,
        );
        delete rest.safetySettings;
      }

      for (const k of ['provider', 'transforms', 'output_config', 'thinking', 'reasoning_effort', 'verbosity']) {
        delete rest[k];
      }
      deepMergeInto(body, rest);
    } else if (proto === 'anthropic') {
      if (rest.stop !== undefined && rest.stop_sequences === undefined) {
        const stops = normalizeStopArray(rest.stop);
        if (stops) rest.stop_sequences = stops;
      }
      delete rest.stop;

      for (const k of ['safetySettings', 'safety_settings', 'generationConfig', 'provider', 'transforms', 'frequency_penalty', 'presence_penalty']) {
        delete rest[k];
      }
      deepMergeInto(body, rest);
    } else {
      if (rest.stop_sequences !== undefined && rest.stop === undefined) {
        const stops = normalizeStopArray(rest.stop_sequences);
        if (stops) rest.stop = stops;
      }
      delete rest.stop_sequences;

      if (isPlainObject(rest.generationConfig)) {
        const gc = rest.generationConfig;
        if (gc.stopSequences !== undefined && rest.stop === undefined) rest.stop = gc.stopSequences;
        if (gc.maxOutputTokens !== undefined && rest.max_tokens === undefined) rest.max_tokens = gc.maxOutputTokens;
        if (gc.temperature !== undefined && rest.temperature === undefined) rest.temperature = gc.temperature;
        if (gc.topP !== undefined && rest.top_p === undefined) rest.top_p = gc.topP;
        if (gc.topK !== undefined && rest.top_k === undefined) rest.top_k = gc.topK;
        if (gc.seed !== undefined && rest.seed === undefined) rest.seed = gc.seed;
        delete rest.generationConfig;
      }

      const incomingSafety =
        rest.safety_settings !== undefined ? rest.safety_settings : rest.safetySettings;
      if (incomingSafety !== undefined) {
        body.safety_settings = mergeSafetySettingsByCategory(body.safety_settings, incomingSafety);
        delete rest.safety_settings;
        delete rest.safetySettings;
      }
      deepMergeInto(body, rest);
    }
  }

  const exc = parseAdditionalBodyExclude(excludeRaw);
  if (exc.valid && exc.keys.length > 0) {
    for (const key of exc.keys) {
      deleteNestedKey(body, key);
      if (proto === 'gemini' && isPlainObject(body.generationConfig)) {
        if (key === 'temperature') delete body.generationConfig.temperature;
        else if (key === 'top_p') delete body.generationConfig.topP;
        else if (key === 'top_k') delete body.generationConfig.topK;
        else if (key === 'seed') delete body.generationConfig.seed;
        else if (key === 'max_tokens' || key === 'max_completion_tokens') delete body.generationConfig.maxOutputTokens;
        else if (key === 'stop' || key === 'stop_sequences') delete body.generationConfig.stopSequences;
        else if (key === 'presence_penalty') delete body.generationConfig.presencePenalty;
        else if (key === 'frequency_penalty') delete body.generationConfig.frequencyPenalty;
        else if (key === 'thinking' || key === 'reasoning_effort') delete body.generationConfig.thinkingConfig;
      }
      if (proto === 'gemini' && (key === 'safety_settings' || key === 'safetySettings')) {
        delete body.safetySettings;
      }
      if (proto === 'anthropic') {
        if (key === 'stop') delete body.stop_sequences;
        else if (key === 'reasoning_effort') delete body.thinking;
      }
      if (proto === 'openai') {
        if (key === 'stop_sequences') delete body.stop;
        else if (key === 'safetySettings') delete body.safety_settings;
      }
    }
  }

  return body;
}

export function applyAdditionalRequestHeaders(headers, includeHeadersRaw = '') {
  if (!isPlainObject(headers)) return headers;
  const parsed = parseAdditionalHeadersInclude(includeHeadersRaw);
  if (!parsed.valid || parsed.count === 0) return headers;

  const lowerToExistingKey = new Map(Object.keys(headers).map((k) => [k.toLowerCase(), k]));
  for (const [name, val] of Object.entries(parsed.headers)) {
    const lowerName = name.toLowerCase();
    const existingKey = lowerToExistingKey.get(lowerName);

    if (lowerName === 'anthropic-beta' && existingKey && headers[existingKey]) {
      const mergedTokens = Array.from(
        new Set(
          `${headers[existingKey]},${val}`
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      );
      headers[existingKey] = mergedTokens.join(',');
      continue;
    }

    if (existingKey && existingKey !== name) {
      delete headers[existingKey];
    }
    headers[name] = val;
    lowerToExistingKey.set(lowerName, name);
  }

  return headers;
}
