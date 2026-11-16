/**
 * NexusTavern — Isomorphic Message Recap & Context Compression Engine.
 * Shared across Node.js prompt compilation (`promptCompiler.js`, `chatStore.js`)
 * and React client live token accounting (`tokenEstimator.js`, `MessageRecapManager`).
 */

import {
  REGEX_PLACEMENT,
  SUBSTITUTE_FIND_REGEX,
  normalizeRegexScript,
  analyzeRegexSafety,
} from '../regex/regexEngine.js';

export const RECAP_CONFIG_SCHEMA_VERSION = 2;
export const DEFAULT_KEEP_FULL_DEPTH = 4;

export const DEFAULT_OPENING_PROMPT = `[RESPONSE & RECAP PROTOCOL: Always write every reply in two consecutive blocks:
1. <story>...</story> — Write the full immersive roleplay response matching {{user}}'s language, with natural grammar and properly adapted names/terms. Start your reply directly with <story> on the first line (older <story> blocks are stripped from context to save tokens).
2. <recap>...</recap> — Always write a concise, complete past-tense recap strictly in English (if <story> is in another language, translate all events and key quotes into English for token efficiency). Use minimal descriptions, quote important lines of dialogue, and never omit plot-critical actions, facts, or state changes.]`;

export const DEFAULT_CLOSING_PROMPT = `[Write the full <story>...</story> block first using the original RP language the Player uses, then write the concise past-tense English <recap>...</recap> block.]`;

export const DEFAULT_STRIP_FIND_REGEX =
  '/(`{3})?\\s*<story>[\\s\\S]*?<\\/story>\\s?(`{3})?\\s*/gi';

const LEGACY_V1_STRIP_FIND_REGEX =
  '/(`{3})?\\s*<(?:story|ru)>[\\s\\S]*?<\\/(?:story|ru)>\\s?(`{3})?\\s*/gi';

const VALID_ROLES = new Set(['system', 'user']);
const VALID_OPENING_POSITIONS = new Set(['before_history', 'depth']);
const VALID_CLOSING_POSITIONS = new Set(['after_all', 'depth']);

function clampDepth(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(200, Math.round(num)));
}

/**
 * Repairs ungrouped XML/HTML tag alternation such as `<story|ru>` or `<\/story|ru>`
 * into `<(?:story|ru)>` / `<\/(?:story|ru)>` so `|` does not split the outer regex
 * into top-level branches that only strip the opening tag token.
 */
export function repairUngroupedXmlTagAlternation(rawRegex = '') {
  const str = String(rawRegex ?? '');
  if (!str.includes('|')) return str;
  return str.replace(
    /<(\\\/|\/)?([a-zA-Z0-9_:-]+(?:\|[a-zA-Z0-9_:-]+)+)(\b[^>|()]*)?>/g,
    (_m, slash = '', alts = '', rest = '') => `<${slash}(?:${alts})${rest}>`,
  );
}

/**
 * Normalizes any persisted or partial Message Recap configuration object.
 */
export function normalizeRecapConfig(raw = null) {
  const src = raw && typeof raw === 'object' ? raw : {};

  const enabled = Boolean(src.enabled);

  const openingEnabled = src.openingEnabled !== false;
  const openingRole = VALID_ROLES.has(src.openingRole) ? src.openingRole : 'system';
  const openingPosition = VALID_OPENING_POSITIONS.has(src.openingPosition)
    ? src.openingPosition
    : 'before_history';
  const openingDepth = clampDepth(src.openingDepth, 4);
  const isLegacyV1 = (Number(src.schemaVersion) || 1) < RECAP_CONFIG_SCHEMA_VERSION;
  const rawOpeningPrompt =
    typeof src.openingPrompt === 'string' ? src.openingPrompt : DEFAULT_OPENING_PROMPT;
  const openingPrompt =
    isLegacyV1 && rawOpeningPrompt.includes('<recap><details><summary>recap</summary>')
      ? DEFAULT_OPENING_PROMPT
      : rawOpeningPrompt;

  const closingEnabled = src.closingEnabled !== false;
  const closingRole = VALID_ROLES.has(src.closingRole) ? src.closingRole : 'system';
  const closingPosition = VALID_CLOSING_POSITIONS.has(src.closingPosition)
    ? src.closingPosition
    : 'after_all';
  const closingDepth = clampDepth(src.closingDepth, 0);
  const rawClosingPrompt =
    typeof src.closingPrompt === 'string' ? src.closingPrompt : DEFAULT_CLOSING_PROMPT;
  const closingPrompt =
    isLegacyV1 && rawClosingPrompt.includes('<recap><details><summary>recap</summary>')
      ? DEFAULT_CLOSING_PROMPT
      : rawClosingPrompt;

  const stripEnabled = src.stripEnabled !== false;
  const keepFullDepth = clampDepth(src.keepFullDepth, DEFAULT_KEEP_FULL_DEPTH);
  const rawStripRegex =
    typeof src.stripFindRegex === 'string' && src.stripFindRegex.trim()
      ? src.stripFindRegex.trim()
      : DEFAULT_STRIP_FIND_REGEX;
  const stripFindRegex = repairUngroupedXmlTagAlternation(
    isLegacyV1 && rawStripRegex === LEGACY_V1_STRIP_FIND_REGEX
      ? DEFAULT_STRIP_FIND_REGEX
      : rawStripRegex,
  );

  return {
    schemaVersion: RECAP_CONFIG_SCHEMA_VERSION,
    enabled,
    openingEnabled,
    openingRole,
    openingPosition,
    openingDepth,
    openingPrompt,
    closingEnabled,
    closingRole,
    closingPosition,
    closingDepth,
    closingPrompt,
    stripEnabled,
    keepFullDepth,
    stripFindRegex,
  };
}

/**
 * Returns a fresh factory-default Message Recap config (preserving `enabled` when desired).
 */
export function createDefaultRecapConfig({ enabled = false } = {}) {
  return normalizeRecapConfig({ enabled });
}

/**
 * Converts an active Message Recap strip rule into a synthetic `RegexScriptData`
 * entry compatible with `applyRegexPipeline` (reusing its LRU cache and ReDoS guard).
 * Returns `null` when the plugin or its strip rule is disabled or invalid.
 */
export function buildRecapSyntheticRegexScript(rawConfig = null) {
  const config = normalizeRecapConfig(rawConfig);
  if (!config.enabled || !config.stripEnabled) {
    return null;
  }

  const safety = analyzeRegexSafety(config.stripFindRegex);
  if (!safety.valid || safety.empty) {
    return null;
  }

  return normalizeRegexScript({
    id: '__nexustavern_message_recap_strip__',
    scriptName: 'Message Recap — Full Story Strip',
    findRegex: config.stripFindRegex,
    replaceString: '',
    trimStrings: [],
    placement: [REGEX_PLACEMENT.AI_OUTPUT],
    disabled: false,
    markdownOnly: false,
    promptOnly: true,
    runOnEdit: false,
    substituteRegex: SUBSTITUTE_FIND_REGEX.ESCAPED,
    minDepth: config.keepFullDepth,
    maxDepth: null,
  });
}
