/**
 * Isomorphic token estimator shared across client PromptManager, AppShell live chat
 * history tracking, and server Tail-First chat window summaries (`chatStore.js`).
 */

import {
  applyRegexPipeline,
  REGEX_PLACEMENT,
} from '../regex/regexEngine.js';
import {
  normalizeRecapConfig,
  buildRecapSyntheticRegexScript,
} from '../recap/recapEngine.js';

const REASONING_TAGS_RE =
  /<(?:think|thinking|reasoning|thought)>[\s\S]*?<\/(?:think|thinking|reasoning|thought)>/gi;

export function stripReasoningBlocksForTokens(rawText = '') {
  if (!rawText) return '';
  return String(rawText).replace(REASONING_TAGS_RE, '').trim();
}

export function estimateTextTokens(rawText = '', tokenContext = null) {
  if (!rawText) return 0;
  let text = String(rawText)
    .replace(/\{\{\/\/[\s\S]*?\}\}/g, '')
    .replace(/\{\{(?:trim|noop)\}\}/gi, '')
    .replace(/\{\{setvar::[^:}]*::[\s\S]*?\}\}/gi, '');

  if (tokenContext) {
    const charName = tokenContext.charName || 'Character';
    const userName = tokenContext.userName || 'User';
    text = text
      .replace(/\{\{char\}\}/gi, charName)
      .replace(/\{\{charIfNotGroup\}\}/gi, charName)
      .replace(/\{\{user\}\}/gi, userName);
  }

  const trimmed = text.trim();
  if (!trimmed) return 0;

  let latinCount = 0;
  let cyrillicCount = 0;
  let cjkOrSymbolCount = 0;
  let punctOrTagCount = 0;

  for (const ch of trimmed) {
    const code = ch.codePointAt(0) || 0;
    if (
      (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      ch === ' ' ||
      ch === '\t' ||
      ch === '\n' ||
      ch === '\r' ||
      code === 0x00a0 ||
      code === 0x2800 ||
      (code >= 0x2000 && code <= 0x200b)
    ) {
      latinCount += 1;
    } else if (code < 0x80) {
      punctOrTagCount += 1;
    } else if (
      (code >= 0x0400 && code <= 0x052f) ||
      (code >= 0x0370 && code <= 0x03ff) ||
      (code >= 0x00c0 && code <= 0x024f)
    ) {
      cyrillicCount += 1;
    } else {
      cjkOrSymbolCount += 1;
    }
  }

  return Math.max(
    1,
    Math.ceil(
      latinCount / 3.95 +
        cyrillicCount / 2.15 +
        punctOrTagCount / 2.6 +
        cjkOrSymbolCount / 1.25,
    ),
  );
}

function extractRawHistoryMessageText(msg) {
  if (!msg || typeof msg !== 'object') return '';
  if (typeof msg.text === 'string') return msg.text;
  if (
    Array.isArray(msg.swipes) &&
    typeof msg.swipe_id === 'number' &&
    msg.swipes[msg.swipe_id] !== undefined
  ) {
    return String(msg.swipes[msg.swipe_id] ?? '');
  }
  return String(msg.mes ?? '');
}

/**
 * Estimates prompt tokens contributed by an array of chat history messages
 * (either client UI message objects or raw `.jsonl` server message records).
 */
export function estimateHistorySliceTokens(messages = [], tokenContext = null) {
  if (!Array.isArray(messages) || messages.length === 0) return 0;
  let sum = 0;
  for (const msg of messages) {
    if (!msg || msg.is_system) continue;
    const isUser = Boolean(msg.isUser ?? msg.is_user);
    const rawText = extractRawHistoryMessageText(msg);
    const cleanText = isUser ? rawText : stripReasoningBlocksForTokens(rawText);
    if (!cleanText || !cleanText.trim()) continue;
    sum += estimateTextTokens(cleanText, tokenContext);
  }
  return sum;
}

/**
 * Computes both active (post-regex / post-recap) and raw (uncompressed) token counts
 * for a chat history slice, respecting message depth from the tail of the chat.
 */
export function estimateHistorySliceTokenBreakdown(
  messages = [],
  tokenContext = null,
  { regexScripts = [], recapConfig = null, tailCountAfterSlice = 0 } = {},
) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { activeTokens: 0, rawTokens: 0, savedTokens: 0 };
  }

  const charName = tokenContext?.charName || 'Character';
  const userName = tokenContext?.userName || 'User';
  const recapStripScript = recapConfig
    ? buildRecapSyntheticRegexScript(recapConfig)
    : null;
  const effectiveScripts = recapStripScript
    ? [recapStripScript, ...(Array.isArray(regexScripts) ? regexScripts : [])]
    : Array.isArray(regexScripts)
      ? regexScripts
      : [];

  const tailOffset = Math.max(0, Math.floor(Number(tailCountAfterSlice) || 0));
  let rawTokens = 0;
  let activeTokens = 0;

  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (!msg || msg.is_system) continue;
    const isUser = Boolean(msg.isUser ?? msg.is_user);
    const rawText = extractRawHistoryMessageText(msg);
    const cleanText = isUser ? rawText : stripReasoningBlocksForTokens(rawText);
    if (!cleanText || !cleanText.trim()) continue;

    const rawTok = estimateTextTokens(cleanText, tokenContext);
    rawTokens += rawTok;

    if (effectiveScripts.length === 0) {
      activeTokens += rawTok;
      continue;
    }

    const msgDepth = messages.length - 1 - i + tailOffset;
    const transformed = applyRegexPipeline(cleanText, effectiveScripts, {
      placement: isUser ? REGEX_PLACEMENT.USER_INPUT : REGEX_PLACEMENT.AI_OUTPUT,
      isPrompt: true,
      depth: msgDepth,
      charName,
      userName,
    }).trim();

    activeTokens += transformed ? estimateTextTokens(transformed, tokenContext) : 0;
  }

  return {
    activeTokens,
    rawTokens,
    savedTokens: Math.max(0, rawTokens - activeTokens),
  };
}

/**
 * Computes prompt tokens added by enabled Message Recap prompts (Opening Rules + Closing Reminder).
 */
export function estimateRecapInjectedPromptTokens(rawConfig = null, tokenContext = null) {
  const cfg = normalizeRecapConfig(rawConfig);
  if (!cfg.enabled) return 0;
  let sum = 0;
  if (cfg.openingEnabled && cfg.openingPrompt?.trim()) {
    sum += estimateTextTokens(cfg.openingPrompt, tokenContext);
  }
  if (cfg.closingEnabled && cfg.closingPrompt?.trim()) {
    sum += estimateTextTokens(cfg.closingPrompt, tokenContext);
  }
  return sum;
}
