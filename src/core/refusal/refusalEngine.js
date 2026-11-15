/**
 * NexusTavern — Isomorphic Refusal Catcher Engine
 * Shared between Node.js streaming pipeline (`llmStreamer.js`) and React UI.
 */

export const DEFAULT_REFUSAL_DELAY_MS = 1500;
export const DEFAULT_REFUSAL_HEAD_CHARS = 320;
export const REFUSAL_CONFIG_SCHEMA_VERSION = 2;

export const ADDED_V2_DEFAULT_PHRASES = [
  'Я вынужден',
  'Здесь я',
  'Я должен',
  'Стоп',
  'I have to',
  'I need to',
  'Here I',
  'Stop',
];

export const DEFAULT_BANNED_PHRASES = [
  'Извините, я не',
  'Я не могу',
  'Я не буду',
  'К сожалению, я не могу',
  'Я вынужден',
  'Здесь я',
  'Я должен',
  'Стоп',
  'I apologize, but',
  'I apologize but',
  'I cannot fulfill',
  "I can't fulfill",
  'I am unable to',
  'As an AI',
  'I have to',
  'I need to',
  'Here I',
  'Stop',
];

/**
 * Normalizes quotes, apostrophes, and whitespace for reliable case-insensitive matching.
 */
export function normalizeForRefusalMatch(input = '') {
  return String(input || '')
    .replace(/[\u2018\u2019\u02BC`]/g, "'")
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Deduplicates and cleans an array of user-configured banned phrases while
 * preserving original casing for display in the Plugins UI.
 */
export function sanitizeBannedPhrases(rawList) {
  if (!Array.isArray(rawList)) return [...DEFAULT_BANNED_PHRASES];
  const seen = new Set();
  const out = [];

  for (const item of rawList) {
    const trimmed = String(item ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!trimmed) continue;
    const key = normalizeForRefusalMatch(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }

  return out;
}

/**
 * Normalizes a Refusal Catcher configuration object.
 */
export function normalizeRefusalConfig(raw = null) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const enabled = src.enabled !== false;
  const rawDelay = Number(src.delayMs);
  const delayMs =
    Number.isFinite(rawDelay) && rawDelay >= 0 && rawDelay <= 10000
      ? Math.round(rawDelay)
      : DEFAULT_REFUSAL_DELAY_MS;
  const rawWindow = Number(src.headWindowChars);
  const headWindowChars =
    Number.isFinite(rawWindow) && rawWindow >= 60 && rawWindow <= 2000
      ? Math.round(rawWindow)
      : DEFAULT_REFUSAL_HEAD_CHARS;

  const bannedPhrases = Array.isArray(src.bannedPhrases)
    ? sanitizeBannedPhrases(src.bannedPhrases)
    : [...DEFAULT_BANNED_PHRASES];

  const fallbackEnabled = Boolean(src.fallbackEnabled);
  const fallbackConnectionId =
    typeof src.fallbackConnectionId === 'string' ? src.fallbackConnectionId.trim() : '';
  const fallbackModelId =
    typeof src.fallbackModelId === 'string' ? src.fallbackModelId.trim() : '';

  return {
    schemaVersion:
      Number.isInteger(src.schemaVersion) && src.schemaVersion > 0
        ? src.schemaVersion
        : REFUSAL_CONFIG_SCHEMA_VERSION,
    enabled,
    delayMs,
    headWindowChars,
    bannedPhrases,
    fallbackEnabled,
    fallbackConnectionId,
    fallbackModelId,
  };
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isAlphaNumericChar(ch) {
  if (!ch) return false;
  return /[\p{L}\p{N}]/u.test(ch);
}

/**
 * Returns `true` when the response opens with dialogue quotes, narration asterisks,
 * or apostrophes (`"`, `«`, `“`, `„`, `*`, `'`, `‘`, `’`, `` ` ``) — indicating an
 * in-character RP turn that must bypass refusal scanning immediately.
 */
export function startsWithRpMarker(rawText = '') {
  const trimmed = String(rawText || '').replace(/^\s+/u, '');
  if (!trimmed) return false;
  return /^["«“„*'‘’`]/u.test(trimmed);
}

/**
 * Strips non-RP leading formatting markers (headings, underscores, list dashes)
 * from the opening of an AI response before inspecting the head window.
 */
function extractNormalizedHead(rawText = '', maxChars = DEFAULT_REFUSAL_HEAD_CHARS) {
  const strippedStart = String(rawText || '').replace(/^[\s_#>—–\-]+/u, '');
  const sliced = strippedStart.slice(0, maxChars);
  return normalizeForRefusalMatch(sliced);
}

/**
 * Checks whether the opening window of an LLM response contains any configured
 * banned refusal phrase (skipping responses that open with RP dialogue/action markers).
 *
 * @returns {{ matchedPhrase: string, index: number } | null}
 */
export function detectRefusalInHead(text = '', rawConfig = null) {
  const config = normalizeRefusalConfig(rawConfig);
  if (!config.enabled || config.bannedPhrases.length === 0) {
    return null;
  }
  if (startsWithRpMarker(text)) {
    return null;
  }

  const head = extractNormalizedHead(text, config.headWindowChars);
  if (!head) return null;

  for (const rawPhrase of config.bannedPhrases) {
    const trimmedRaw = String(rawPhrase || '').trim();
    const isPrefixWildcard = /(?:\.{2,}|\*)$/.test(trimmedRaw);
    const normPhrase = normalizeForRefusalMatch(trimmedRaw)
      .replace(/(?:\.{2,}|\*)$/, '')
      .trim();
    if (!normPhrase) continue;

    const startsWithWord = isAlphaNumericChar(normPhrase[0]);
    const endsWithWord =
      !isPrefixWildcard && isAlphaNumericChar(normPhrase[normPhrase.length - 1]);

    const leadBoundary = startsWithWord ? '(?:^|[^\\p{L}\\p{N}])' : '';
    const trailBoundary = endsWithWord ? '(?=$|[^\\p{L}\\p{N}])' : '';
    const pattern = new RegExp(
      `${leadBoundary}(${escapeRegExp(normPhrase)})${trailBoundary}`,
      'u',
    );

    const match = pattern.exec(head);
    if (match) {
      return {
        matchedPhrase: rawPhrase,
        index: match.index,
      };
    }
  }

  return null;
}

export const GEMINI_REFUSAL_FILTERS = [
  'harassment',
  'hate_speech',
  'sexually_explicit',
  'dangerous_content',
  'jailbreak',
  'prohibited_content',
];

const GEMINI_FILTER_PATTERNS = [
  { id: 'prohibited_content', re: /(?:harm_category_)?prohibited[_\s-]+content/i },
  { id: 'sexually_explicit', re: /(?:harm_category_)?sexually[_\s-]+explicit/i },
  { id: 'dangerous_content', re: /(?:harm_category_)?dangerous[_\s-]+content/i },
  { id: 'hate_speech', re: /(?:harm_category_)?hate[_\s-]+speech/i },
  {
    id: 'harassment',
    re: /(?:harm_category_harassment|(?<![\p{L}\p{N}])harassment(?![\p{L}\p{N}]))/iu,
  },
  {
    id: 'jailbreak',
    re: /(?:harm_category_jailbreak|(?<![\p{L}\p{N}])jailbreak(?![\p{L}\p{N}]))/iu,
  },
];

const PROBABILITY_RANK = {
  HIGH: 4,
  HARM_PROBABILITY_HIGH: 4,
  HARM_SEVERITY_HIGH: 4,
  MEDIUM: 3,
  HARM_PROBABILITY_MEDIUM: 3,
  HARM_SEVERITY_MEDIUM: 3,
  LOW: 2,
  HARM_PROBABILITY_LOW: 2,
  HARM_SEVERITY_LOW: 2,
};

/**
 * Matches a raw filter/reason/error string against the 6 Gemini content filters:
 * `harassment`, `hate_speech`, `sexually_explicit`, `dangerous_content`,
 * `jailbreak`, `prohibited_content`.
 */
export function matchGeminiFilterToken(rawInput = '') {
  const str = String(rawInput || '').trim();
  if (!str) return null;
  for (const entry of GEMINI_FILTER_PATTERNS) {
    if (entry.re.test(str)) {
      return entry.id;
    }
  }
  return null;
}

function pickTriggeredSafetyRatingFilter(ratings, { requireExplicitBlock = false } = {}) {
  if (!Array.isArray(ratings) || ratings.length === 0) return null;

  for (const rating of ratings) {
    if (rating?.blocked === true) {
      const matched = matchGeminiFilterToken(rating.category);
      if (matched) return matched;
    }
  }

  if (requireExplicitBlock) return null;

  let bestFilter = null;
  let bestScore = 0;
  for (const rating of ratings) {
    const matched = matchGeminiFilterToken(rating?.category);
    if (!matched) continue;
    const probKey = String(rating?.probability || rating?.severity || '')
      .trim()
      .toUpperCase();
    const score = PROBABILITY_RANK[probKey] || 0;
    if (score > bestScore) {
      bestScore = score;
      bestFilter = matched;
    }
  }

  return bestFilter;
}

/**
 * Inspects a Gemini SSE/JSON response chunk, OpenAI-proxy choice chunk, or upstream
 * HTTP/SSE error payload for blocks caused by Gemini's safety/prohibited filters.
 * Never triggers on benign `NEGLIGIBLE` safetyRatings during normal generation.
 *
 * @returns {{ matchedFilter: string } | null}
 */
export function detectGeminiFilterRefusal(payload = null) {
  if (!payload) return null;

  if (typeof payload === 'string') {
    const matched = matchGeminiFilterToken(payload);
    return matched ? { matchedFilter: matched } : null;
  }

  if (typeof payload !== 'object') return null;

  // 1. Upstream error object (`json.error`, HTTP `!res.ok` error metadata)
  if (payload.error || payload.errText || payload.httpErrorMessage) {
    const errSources = [
      typeof payload.error === 'string' ? payload.error : '',
      payload.error?.message || '',
      payload.error?.status || '',
      payload.error?.code || '',
      payload.httpErrorMessage || '',
      payload.message || '',
      payload.errText || '',
      payload.error?.details ? JSON.stringify(payload.error.details) : '',
    ].filter(Boolean);

    for (const src of errSources) {
      const matched = matchGeminiFilterToken(src);
      if (matched) return { matchedFilter: matched };
    }
  }

  // 2. Native Gemini `promptFeedback`
  const pf = payload.promptFeedback;
  if (pf && typeof pf === 'object') {
    if (pf.blockReason) {
      const directReason = matchGeminiFilterToken(pf.blockReason);
      if (directReason) return { matchedFilter: directReason };

      const fromRatings = pickTriggeredSafetyRatingFilter(pf.safetyRatings, {
        requireExplicitBlock: false,
      });
      if (fromRatings) return { matchedFilter: fromRatings };

      const fromReasonMsg = matchGeminiFilterToken(pf.blockReasonMessage || '');
      if (fromReasonMsg) return { matchedFilter: fromReasonMsg };
    } else {
      const explicitBlocked = pickTriggeredSafetyRatingFilter(pf.safetyRatings, {
        requireExplicitBlock: true,
      });
      if (explicitBlocked) return { matchedFilter: explicitBlocked };
    }
  }

  // 3. Native Gemini `candidates[0]`
  const candidate = Array.isArray(payload.candidates) ? payload.candidates[0] : null;
  if (candidate && typeof candidate === 'object') {
    const finishReason = String(candidate.finishReason || '').trim();
    const isAbnormalFinish =
      Boolean(finishReason) &&
      !['STOP', 'MAX_TOKENS', 'FINISH_REASON_UNSPECIFIED'].includes(finishReason.toUpperCase());

    if (isAbnormalFinish) {
      const directFinish = matchGeminiFilterToken(finishReason);
      if (directFinish) return { matchedFilter: directFinish };

      const fromRatings = pickTriggeredSafetyRatingFilter(candidate.safetyRatings, {
        requireExplicitBlock: false,
      });
      if (fromRatings) return { matchedFilter: fromRatings };

      const fromFinishMsg = matchGeminiFilterToken(candidate.finishMessage || '');
      if (fromFinishMsg) return { matchedFilter: fromFinishMsg };
    } else {
      const explicitBlocked = pickTriggeredSafetyRatingFilter(candidate.safetyRatings, {
        requireExplicitBlock: true,
      });
      if (explicitBlocked) return { matchedFilter: explicitBlocked };
    }
  }

  // 4. OpenAI-compatible proxy chunks (`choices[0]` for Vertex / OpenRouter / RP-proxy)
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  if (choice && typeof choice === 'object') {
    const finishSources = [
      choice.native_finish_reason,
      choice.finish_reason,
      choice.stop_reason,
    ].filter(Boolean);

    for (const src of finishSources) {
      const matched = matchGeminiFilterToken(src);
      if (matched) return { matchedFilter: matched };
    }

    const choiceRatings =
      choice.safety_ratings ||
      choice.safetyRatings ||
      choice.content_filter_results ||
      null;
    if (Array.isArray(choiceRatings)) {
      const isFilteredFinish = finishSources.some((s) =>
        /^(?:safety|content_filter)$/i.test(String(s).trim()),
      );
      const fromChoiceRatings = pickTriggeredSafetyRatingFilter(choiceRatings, {
        requireExplicitBlock: !isFilteredFinish,
      });
      if (fromChoiceRatings) return { matchedFilter: fromChoiceRatings };
    }
  }

  return null;
}

export const REASONING_REFUSAL_HEADING_KEYWORDS = ['safety', 'refusal', 'ethic'];

const REASONING_HEADING_KEYWORD_RE =
  /(?<![\p{L}\p{N}])(safety|refusals?|ethic[\p{L}]*)(?![\p{L}\p{N}])/iu;

function cleanReasoningHeadingCandidate(raw) {
  const stripped = String(raw || '')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s:.;—–-]+$/g, '')
    .replace(/\.{2,}$/g, '')
    .replace(/…+$/g, '')
    .trim();
  if (stripped.length < 2 || stripped.length > 120) return null;
  return stripped;
}

function extractCompletedReasoningHeadingFromLine(rawLine = '', { allowAtx = true } = {}) {
  const trimmed = String(rawLine || '').trim();
  if (!trimmed) return null;

  const withoutListPrefix = trimmed.replace(
    /^(?:[-*•]\s+|\d+[.)]\s+|step\s+\d+\s*[:.—–-]\s*)/i,
    '',
  );

  // 1. Standalone bold heading line: `**Evaluating Safety**`, `***Safety***:`, `__Ethics__`
  const standaloneBold = withoutListPrefix.match(
    /^(?:\*{2,3}([^*\n]{2,120}?)\*{2,3}|_{2,3}([^_\n]{2,120}?)_{2,3})\s*[:—–.-]?\s*$/,
  );
  if (standaloneBold) {
    return cleanReasoningHeadingCandidate(standaloneBold[1] || standaloneBold[2]);
  }

  // 2. Bold step lead followed by a colon/dash: `**Safety Check:** The user...` or `**Refusal** - ...`
  const leadBoldInsideColon = withoutListPrefix.match(
    /^(?:\*{2,3}([^*\n]{2,90}?):\*{2,3}|_{2,3}([^_\n]{2,90}?):_{2,3})(?:\s|$)/,
  );
  if (leadBoldInsideColon) {
    return cleanReasoningHeadingCandidate(leadBoldInsideColon[1] || leadBoldInsideColon[2]);
  }

  const leadBoldOutsideColon = withoutListPrefix.match(
    /^(?:\*{2,3}([^*\n]{2,90}?)\*{2,3}|_{2,3}([^_\n]{2,90}?)_{2,3})\s*(?::|—|–|-)(?:\s|$)/,
  );
  if (leadBoldOutsideColon) {
    return cleanReasoningHeadingCandidate(leadBoldOutsideColon[1] || leadBoldOutsideColon[2]);
  }

  // 3. Markdown ATX heading (`#`..`######`) — checked once completed by a newline (or stream end)
  if (allowAtx) {
    const atxMatch = trimmed.match(/^#{1,6}\s+(.{2,120}?)\s*#*$/);
    if (atxMatch) {
      return cleanReasoningHeadingCandidate(atxMatch[1]);
    }
  }

  return null;
}

export function matchReasoningRefusalKeyword(headingText = '') {
  const m = REASONING_HEADING_KEYWORD_RE.exec(String(headingText || ''));
  if (!m) return null;
  const lower = m[1].toLowerCase();
  if (lower.startsWith('safety')) return 'safety';
  if (lower.startsWith('refusal')) return 'refusal';
  if (lower.startsWith('ethic')) return 'ethic';
  return lower;
}

/**
 * Inspects completed Chain-of-Thought / reasoning headings during streaming for
 * safety/refusal/ethics evaluation steps (`"safety"`, `"refusal"`, `"ethic"`).
 * Plain body sentences inside reasoning paragraphs are ignored.
 *
 * @returns {{ matchedHeading: string, matchedHeadingKeyword: string, rawError: string } | null}
 */
export function detectRefusalInReasoningHeadings(
  reasoningText = '',
  { startLineIndex = 0, allowFinalAtxWithoutNewline = false } = {},
) {
  if (!reasoningText) return null;
  const normalized = String(reasoningText).replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const fromIdx = Math.max(0, Math.min(Number(startLineIndex) || 0, lines.length - 1));

  for (let i = fromIdx; i < lines.length; i += 1) {
    const isUnterminatedTailLine = i === lines.length - 1 && !allowFinalAtxWithoutNewline;
    const heading = extractCompletedReasoningHeadingFromLine(lines[i], {
      allowAtx: !isUnterminatedTailLine,
    });
    if (!heading) continue;

    const keyword = matchReasoningRefusalKeyword(heading);
    if (keyword) {
      return {
        matchedHeading: heading,
        matchedHeadingKeyword: keyword,
        rawError: `Reasoning heading "${heading}" matched "${keyword}"`,
      };
    }
  }

  return null;
}

/**
 * Formats a clean English error string parsed by `parseSmartNotification` into a
 * structured M3 error toast (`REFUSAL CATCHER` badge + retry action).
 */
export function formatRefusalErrorMessage(matchedPhrase = '') {
  const clean = String(matchedPhrase || '').trim();
  if (clean) {
    return `Refusal Catcher: The model refused to continue generation (matched "${clean}").`;
  }
  return 'Refusal Catcher: The model refused to continue generation.';
}

export function formatReasoningRefusalErrorMessage(matchedHeading = '', matchedKeyword = '') {
  const cleanHeading = String(matchedHeading || '').trim();
  const cleanKeyword = String(matchedKeyword || '').trim();
  if (cleanHeading && cleanKeyword) {
    return `Refusal Catcher: Refusal detected in reasoning heading "${cleanHeading}" (matched "${cleanKeyword}").`;
  }
  if (cleanHeading) {
    return `Refusal Catcher: Refusal detected in reasoning heading "${cleanHeading}".`;
  }
  return 'Refusal Catcher: Refusal detected in model reasoning.';
}

export function formatFilterRefusalErrorMessage(filterName = '') {
  const clean = String(filterName || '').trim();
  if (clean) {
    return `Refusal Catcher: Generation blocked by safety filter (${clean}).`;
  }
  return 'Refusal Catcher: Generation blocked by safety filter.';
}

export function formatFallbackSwitchedNotice(fromModelName = '', toModelName = '') {
  const fromLabel = String(fromModelName || '').trim() || 'Selected model';
  const toLabel = String(toModelName || '').trim() || 'fallback model';
  return `Refusal Catcher: ${fromLabel} refused; response received from ${toLabel}.`;
}

/**
 * Builds structured fallback redirect metadata stored on the message/swipe
 * and displayed inside the M3 rich tooltip next to the model badge.
 */
export function buildFallbackRedirectInfo({
  primaryTarget = null,
  fallbackTarget = null,
  primaryErr = null,
} = {}) {
  const fromApi = String(primaryTarget?.connectionName || '').trim() || 'Primary API';
  const fromModel = String(primaryTarget?.modelName || '').trim() || 'Primary model';
  const toApi = String(fallbackTarget?.connectionName || '').trim() || 'Fallback API';
  const toModel = String(fallbackTarget?.modelName || '').trim() || 'Fallback model';

  const matchedFilter = String(primaryErr?.matchedFilter || '').trim();
  const matchedHeading = String(primaryErr?.matchedHeading || '').trim();
  const matchedHeadingKeyword = String(primaryErr?.matchedHeadingKeyword || '').trim();
  const matchedPhrase = String(primaryErr?.matchedPhrase || '').trim();

  let triggerType = 'refusal';
  let reason = 'Model refused generation';
  let rawError = String(primaryErr?.rawError || primaryErr?.message || '')
    .replace(/^Refusal Catcher\s*:\s*/i, '')
    .trim();

  if (matchedFilter) {
    triggerType = 'safety_filter';
    reason = `Safety filter block (${matchedFilter})`;
    if (!rawError) {
      rawError = `Upstream blocked generation (${matchedFilter})`;
    }
  } else if (matchedHeading) {
    triggerType = 'reasoning_heading';
    reason = matchedHeadingKeyword
      ? `Reasoning heading matched "${matchedHeadingKeyword}"`
      : 'Reasoning refusal/safety heading';
    if (!rawError) {
      rawError = `Heading "${matchedHeading}"`;
    }
  } else if (matchedPhrase) {
    triggerType = 'banned_phrase';
    reason = 'Banned refusal phrase in opening output';
    rawError = `Matched "${matchedPhrase}"`;
  }

  return {
    fromApi,
    fromModel,
    toApi,
    toModel,
    triggerType,
    reason,
    error: rawError || reason,
  };
}

export function formatAllModelsRefusedMessage(fromModelName = '', toModelName = '') {
  const fromLabel = String(fromModelName || '').trim();
  const toLabel = String(toModelName || '').trim();
  if (fromLabel && toLabel) {
    return `Refusal Catcher: Refusal received from all models (${fromLabel} → ${toLabel}).`;
  }
  return 'Refusal Catcher: Refusal received from all models.';
}

export function formatEmptyResponseErrorMessage() {
  return 'Empty Response: The model returned an empty message.';
}
