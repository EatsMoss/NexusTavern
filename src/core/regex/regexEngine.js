/**
 * NexusTavern — High-Performance Isomorphic Regex Engine (Client & Server).
 *
 * 100% compatible with SillyTavern's `RegexScriptData` format across:
 *   - Global scripts (`settings.json -> extension_settings.regex`)
 *   - Scenario / Character scripts (`card.extensions.regex_scripts`)
 *   - Preset scripts (`preset.extensions.regex_scripts`)
 *
 * Enhancements over legacy SillyTavern:
 *   - Bounded LRU cache of compiled `RegExp` instances (zero recompilation on 60fps streams & virtual scroll)
 *   - Static ReDoS / Catastrophic Backtracking risk analyzer + runtime slow-script guard
 *   - Deterministic `$0`, `{{match}}`, `$&`, `$1..$99`, `$<group>`, `$$`, `trimStrings`, and macro expansion
 *   - Built-in `debugRegexScript` inspector returning match spans, capture groups, and microsecond timing
 */

export const REGEX_PLACEMENT = Object.freeze({
  MD_DISPLAY: 0, // Legacy ST placement -> migrated to [USER_INPUT, AI_OUTPUT] + markdownOnly
  USER_INPUT: 1,
  AI_OUTPUT: 2,
  SLASH_COMMAND: 3,
  WORLD_INFO: 5,
  REASONING: 6,
});

export const SUBSTITUTE_FIND_REGEX = Object.freeze({
  NONE: 0,
  RAW: 1,
  ESCAPED: 2,
});

const VALID_REGEX_FLAGS = new Set(['g', 'i', 'm', 's', 'u', 'v', 'y']);
const COMPILED_REGEX_CACHE_LIMIT = 512;
const compiledRegexCache = new Map();

function generateScriptId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function escapeRegexLiteral(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sanitizeRegexFlags(rawFlags = 'g') {
  const seen = new Set();
  let out = '';
  for (const ch of String(rawFlags || '')) {
    if (VALID_REGEX_FLAGS.has(ch) && !seen.has(ch)) {
      seen.add(ch);
      out += ch;
    }
  }
  // `u` and `v` are mutually exclusive in ES2024+
  if (seen.has('u') && seen.has('v')) {
    out = out.replace('v', '');
  }
  return out;
}

/**
 * Parses a SillyTavern `findRegex` string (`/pattern/flags` or plain string).
 * Plain strings default to global flag `'g'` (matching SillyTavern's `regexFromString`).
 */
export function parseFindRegexString(rawFindRegex = '') {
  const str = String(rawFindRegex ?? '');
  if (!str) {
    return { pattern: '', flags: 'g', isSlashNotation: false };
  }

  const slashMatch = str.match(/^\/([\s\S]*)\/([a-zA-Z]*)$/);
  if (slashMatch) {
    return {
      pattern: slashMatch[1],
      flags: sanitizeRegexFlags(slashMatch[2]),
      isSlashNotation: true,
    };
  }

  return {
    pattern: str,
    flags: 'g',
    isSlashNotation: false,
  };
}

export function formatFindRegexWithFlags(pattern = '', flags = 'g') {
  const cleanFlags = sanitizeRegexFlags(flags);
  return `/${String(pattern ?? '')}/${cleanFlags}`;
}

function normalizeDepthBound(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

/**
 * Normalizes any raw or imported SillyTavern RegexScriptData object.
 */
export function normalizeRegexScript(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  let rawPlacements = Array.isArray(src.placement)
    ? src.placement.map((n) => Number(n)).filter((n) => Number.isInteger(n))
    : [];

  let markdownOnly = Boolean(src.markdownOnly);
  if (rawPlacements.includes(REGEX_PLACEMENT.MD_DISPLAY)) {
    markdownOnly = true;
    rawPlacements = rawPlacements.filter((p) => p !== REGEX_PLACEMENT.MD_DISPLAY);
    if (rawPlacements.length === 0) {
      rawPlacements = [REGEX_PLACEMENT.USER_INPUT, REGEX_PLACEMENT.AI_OUTPUT];
    }
  }
  if (rawPlacements.length === 0) {
    rawPlacements = [REGEX_PLACEMENT.AI_OUTPUT];
  }

  const trimStrings = Array.isArray(src.trimStrings)
    ? src.trimStrings.map((s) => String(s ?? '')).filter((s) => s.length > 0)
    : typeof src.trimStrings === 'string' && src.trimStrings.length > 0
      ? src.trimStrings.split(/\r?\n/).filter((s) => s.length > 0)
      : [];

  let substituteRegex = SUBSTITUTE_FIND_REGEX.NONE;
  if (src.substituteRegex === true || Number(src.substituteRegex) === 1) {
    substituteRegex = SUBSTITUTE_FIND_REGEX.RAW;
  } else if (Number(src.substituteRegex) === 2) {
    substituteRegex = SUBSTITUTE_FIND_REGEX.ESCAPED;
  }

  return {
    id: String(src.id || '').trim() || generateScriptId(),
    scriptName: String(src.scriptName || 'Untitled Regex').trim() || 'Untitled Regex',
    findRegex: String(src.findRegex ?? ''),
    replaceString: String(src.replaceString ?? ''),
    trimStrings,
    placement: Array.from(new Set(rawPlacements)),
    disabled: Boolean(src.disabled),
    markdownOnly,
    promptOnly: Boolean(src.promptOnly),
    runOnEdit: src.runOnEdit !== undefined ? Boolean(src.runOnEdit) : true,
    substituteRegex,
    minDepth: normalizeDepthBound(src.minDepth),
    maxDepth: normalizeDepthBound(src.maxDepth),
  };
}

export function createDefaultRegexScript(overrides = {}) {
  return normalizeRegexScript({
    scriptName: 'New Regex Rule',
    findRegex: '//gi',
    replaceString: '',
    trimStrings: [],
    placement: [REGEX_PLACEMENT.AI_OUTPUT],
    disabled: false,
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: true,
    substituteRegex: SUBSTITUTE_FIND_REGEX.NONE,
    minDepth: null,
    maxDepth: null,
    ...overrides,
  });
}

function substituteMacrosInText(
  input = '',
  { charName = 'Character', userName = 'User', escapeValues = false } = {},
) {
  const str = String(input ?? '');
  if (!str || !str.includes('{{')) return str;
  const safeChar = escapeValues ? escapeRegexLiteral(charName) : String(charName || 'Character');
  const safeUser = escapeValues ? escapeRegexLiteral(userName) : String(userName || 'User');
  return str.replace(/\{\{char\}\}/gi, safeChar).replace(/\{\{user\}\}/gi, safeUser);
}

/**
 * Static syntax + ReDoS (Catastrophic Backtracking) heuristic analyzer.
 */
export function analyzeRegexSafety(rawFindRegex = '') {
  const str = String(rawFindRegex ?? '');
  const { pattern, flags } = parseFindRegexString(str);

  if (!pattern) {
    return {
      valid: true,
      empty: true,
      pattern,
      flags,
      error: null,
      risk: 'safe',
      warningMessage: '',
    };
  }

  try {
    new RegExp(pattern, flags);
  } catch (err) {
    return {
      valid: false,
      empty: false,
      pattern,
      flags,
      error: err?.message || 'Invalid regular expression',
      risk: 'invalid',
      warningMessage: err?.message || 'Invalid regular expression',
    };
  }

  const unescaped = pattern.replace(/\\[\s\S]/g, 'x');
  const nestedQuantifierRe = /\((?:\?[:=!]|[^()])*[+*](?:[^()]*)\)\s*(?:[+*]|\{\d+,)/;
  if (nestedQuantifierRe.test(unescaped)) {
    return {
      valid: true,
      empty: false,
      pattern,
      flags,
      error: null,
      risk: 'danger',
      warningMessage:
        'Nested unbounded quantifiers detected — may cause catastrophic backtracking (ReDoS) on long messages.',
    };
  }

  if (/\.\*[^?][\s\S]*\.\*[^?]/.test(`${unescaped} `) && pattern.length > 14) {
    return {
      valid: true,
      empty: false,
      pattern,
      flags,
      error: null,
      risk: 'warning',
      warningMessage:
        'Multiple greedy `.*` wildcards detected — consider lazy `.*?` or negated character classes.',
    };
  }

  return {
    valid: true,
    empty: false,
    pattern,
    flags,
    error: null,
    risk: 'safe',
    warningMessage: '',
  };
}

/**
 * Compiles and caches a `RegExp` instance in a bounded 512-slot LRU map.
 */
export function compileCachedRegex(script, { charName = 'Character', userName = 'User' } = {}) {
  const rawFind = String(script?.findRegex ?? '');
  if (!rawFind) return null;

  const subMode = Number(script?.substituteRegex) || 0;
  const cacheKey =
    subMode === SUBSTITUTE_FIND_REGEX.NONE
      ? `0::${rawFind}`
      : `${subMode}::${charName}::${userName}::${rawFind}`;

  if (compiledRegexCache.has(cacheKey)) {
    const entry = compiledRegexCache.get(cacheKey);
    compiledRegexCache.delete(cacheKey);
    compiledRegexCache.set(cacheKey, entry);
    return entry;
  }

  const parsed = parseFindRegexString(rawFind);
  if (!parsed.pattern) return null;

  let effectivePattern = parsed.pattern;
  if (subMode === SUBSTITUTE_FIND_REGEX.RAW) {
    effectivePattern = substituteMacrosInText(effectivePattern, {
      charName,
      userName,
      escapeValues: false,
    });
  } else if (subMode === SUBSTITUTE_FIND_REGEX.ESCAPED) {
    effectivePattern = substituteMacrosInText(effectivePattern, {
      charName,
      userName,
      escapeValues: true,
    });
  }

  let entry;
  try {
    const safety = analyzeRegexSafety(formatFindRegexWithFlags(effectivePattern, parsed.flags));
    const regex = new RegExp(effectivePattern, parsed.flags);
    entry = { regex, error: null, risk: safety.risk };
  } catch (err) {
    entry = { regex: null, error: err?.message || 'Invalid RegExp', risk: 'invalid' };
  }

  if (compiledRegexCache.size >= COMPILED_REGEX_CACHE_LIMIT) {
    const oldestKey = compiledRegexCache.keys().next().value;
    if (oldestKey !== undefined) compiledRegexCache.delete(oldestKey);
  }
  compiledRegexCache.set(cacheKey, entry);
  return entry;
}

function applyTrimStrings(value = '', trimList = []) {
  if (!value || !trimList || trimList.length === 0) return value;
  let result = String(value);
  for (let i = 0; i < trimList.length; i += 1) {
    const needle = trimList[i];
    if (needle) {
      result = result.split(needle).join('');
    }
  }
  return result;
}

function expandReplacementTemplate(template, fullMatch, captureArgs, namedGroups, resolvedTrims) {
  const trimmedFull = applyTrimStrings(fullMatch, resolvedTrims);
  const trimmedCaptures = captureArgs.map((g) =>
    g === undefined || g === null ? '' : applyTrimStrings(String(g), resolvedTrims),
  );

  const withMatchMacro = template.replace(/\{\{match\}\}/gi, () => trimmedFull);

  return withMatchMacro.replace(
    /\$(?:\$|&|0|<([^>]+)>|(\d{1,2}))/g,
    (token, groupName, groupIndexStr) => {
      if (token === '$$') return '$';
      if (token === '$&' || token === '$0') return trimmedFull;
      if (groupName !== undefined) {
        const rawNamed =
          namedGroups && Object.prototype.hasOwnProperty.call(namedGroups, groupName)
            ? namedGroups[groupName]
            : '';
        return rawNamed ? applyTrimStrings(String(rawNamed), resolvedTrims) : '';
      }
      if (groupIndexStr !== undefined) {
        const idx = Number(groupIndexStr);
        if (idx >= 1 && idx <= trimmedCaptures.length) {
          return trimmedCaptures[idx - 1];
        }
        if (groupIndexStr.length === 2) {
          const singleIdx = Number(groupIndexStr[0]);
          if (singleIdx >= 1 && singleIdx <= trimmedCaptures.length) {
            return `${trimmedCaptures[singleIdx - 1]}${groupIndexStr[1]}`;
          }
        }
        return '';
      }
      return token;
    },
  );
}

export function runRegexScript(
  script,
  rawString,
  { charName = 'Character', userName = 'User', maxInputCharsForDanger = 24000 } = {},
) {
  const input = String(rawString ?? '');
  if (!input || !script || script.disabled) return input;

  const compiled = compileCachedRegex(script, { charName, userName });
  if (!compiled || !compiled.regex) return input;

  if (compiled.risk === 'danger' && input.length > maxInputCharsForDanger) {
    return input;
  }

  const rawReplace = substituteMacrosInText(String(script.replaceString ?? ''), {
    charName,
    userName,
    escapeValues: false,
  });

  const rawTrims = Array.isArray(script.trimStrings) ? script.trimStrings : [];
  const resolvedTrims =
    rawTrims.length > 0
      ? rawTrims
          .map((t) => substituteMacrosInText(t, { charName, userName, escapeValues: false }))
          .filter(Boolean)
      : [];

  try {
    compiled.regex.lastIndex = 0;
    return input.replace(compiled.regex, (...args) => {
      const fullMatch = args[0];
      const hasNamedGroups =
        args.length >= 3 &&
        args[args.length - 1] !== null &&
        typeof args[args.length - 1] === 'object';
      const namedGroups = hasNamedGroups ? args[args.length - 1] : null;
      const captureEnd = hasNamedGroups ? args.length - 3 : args.length - 2;
      const captures = captureEnd > 1 ? args.slice(1, captureEnd) : [];
      return expandReplacementTemplate(
        rawReplace,
        fullMatch,
        captures,
        namedGroups,
        resolvedTrims,
      );
    });
  } catch {
    return input;
  }
}

export function shouldRunRegexScript(
  script,
  {
    placement = REGEX_PLACEMENT.AI_OUTPUT,
    isMarkdown = false,
    isPrompt = false,
    isPermanent = false,
    isStreaming = false,
    isEdit = false,
    depth = null,
  } = {},
) {
  if (!script || script.disabled) return false;
  if (!String(script.findRegex ?? '').trim()) return false;

  const placements = Array.isArray(script.placement) ? script.placement : [];
  if (!placements.includes(placement)) return false;

  const mdOnly = Boolean(script.markdownOnly);
  const prOnly = Boolean(script.promptOnly);

  if (isPermanent) {
    if (mdOnly || prOnly) return false;
    if (isEdit && !script.runOnEdit) return false;
  } else if (isMarkdown && !isPrompt) {
    if (isStreaming) {
      // During live token streaming, server-side permanent persistence has not run yet,
      // so both Visual (`markdownOnly`) and Permanent (`!mdOnly && !prOnly`) rules must execute live.
      const isPermanentRule = !mdOnly && !prOnly;
      if (!mdOnly && !isPermanentRule) return false;
    } else if (!mdOnly) {
      return false;
    }
  } else if (isPrompt && !isMarkdown) {
    if (!prOnly) return false;
  }

  if (depth !== null && depth !== undefined && Number.isFinite(Number(depth))) {
    const d = Number(depth);
    const minD = normalizeDepthBound(script.minDepth);
    const maxD = normalizeDepthBound(script.maxDepth);
    if (minD !== null && d < minD) return false;
    if (maxD !== null && d > maxD) return false;
  }

  return true;
}

export function applyRegexPipeline(
  rawString,
  scripts = [],
  {
    placement = REGEX_PLACEMENT.AI_OUTPUT,
    isMarkdown = false,
    isPrompt = false,
    isPermanent = false,
    isStreaming = false,
    isEdit = false,
    depth = null,
    charName = 'Character',
    userName = 'User',
  } = {},
) {
  const input = String(rawString ?? '');
  if (!input || !Array.isArray(scripts) || scripts.length === 0) return input;

  let current = input;
  for (let i = 0; i < scripts.length; i += 1) {
    const script = scripts[i];
    if (
      !shouldRunRegexScript(script, {
        placement,
        isMarkdown,
        isPrompt,
        isPermanent,
        isStreaming,
        isEdit,
        depth,
      })
    ) {
      continue;
    }
    current = runRegexScript(script, current, { charName, userName });
  }
  return current;
}

export function debugRegexScript(
  script,
  sampleText = '',
  { charName = 'Character', userName = 'User', maxMatches = 200 } = {},
) {
  const normalized = normalizeRegexScript(script);
  const rawFind = String(normalized.findRegex ?? '');
  const safety = analyzeRegexSafety(rawFind);

  if (!safety.valid) {
    return {
      valid: false,
      error: safety.error,
      safety,
      matches: [],
      matchCount: 0,
      outputText: String(sampleText ?? ''),
      changed: false,
      elapsedMs: 0,
    };
  }

  if (safety.empty || !sampleText) {
    return {
      valid: true,
      error: null,
      safety,
      matches: [],
      matchCount: 0,
      outputText: String(sampleText ?? ''),
      changed: false,
      elapsedMs: 0,
    };
  }

  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const compiled = compileCachedRegex({ ...normalized, disabled: false }, { charName, userName });
  if (!compiled || !compiled.regex) {
    return {
      valid: false,
      error: compiled?.error || 'Failed to compile RegExp',
      safety,
      matches: [],
      matchCount: 0,
      outputText: String(sampleText ?? ''),
      changed: false,
      elapsedMs: 0,
    };
  }

  const matches = [];
  let totalCount = 0;
  const src = String(sampleText);

  try {
    const baseFlags = compiled.regex.flags;
    const iterFlags = baseFlags.includes('g') ? baseFlags : `${baseFlags}g`;
    const iterRe = new RegExp(compiled.regex.source, iterFlags);
    const isGlobal = baseFlags.includes('g');

    let m;
    let guard = 0;
    while ((m = iterRe.exec(src)) !== null) {
      totalCount += 1;
      if (matches.length < maxMatches) {
        matches.push({
          index: m.index,
          length: m[0].length,
          fullMatch: m[0],
          groups: m.slice(1),
          namedGroups: m.groups ? { ...m.groups } : null,
        });
      }
      if (!isGlobal) break;
      if (m[0].length === 0) {
        iterRe.lastIndex += 1;
        if (iterRe.lastIndex > src.length) break;
      }
      guard += 1;
      if (guard > 5000) break;
    }
  } catch (err) {
    return {
      valid: false,
      error: err?.message || 'Execution error',
      safety,
      matches: [],
      matchCount: 0,
      outputText: src,
      changed: false,
      elapsedMs: 0,
    };
  }

  const outputText = runRegexScript(
    { ...normalized, disabled: false },
    src,
    { charName, userName, maxInputCharsForDanger: 100000 },
  );
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    valid: true,
    error: null,
    safety,
    matches,
    matchCount: totalCount,
    outputText,
    changed: outputText !== src,
    elapsedMs: Number(Math.max(0, t1 - t0).toFixed(3)),
  };
}

