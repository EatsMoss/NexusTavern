/**
 * Isomorphic token estimator shared across client PromptManager, AppShell live chat
 * history tracking, and server Tail-First chat window summaries (`chatStore.js`).
 */

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
      ch === ' '
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
