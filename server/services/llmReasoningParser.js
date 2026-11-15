/**
 * Streaming state machine that separates inline `<think>...</think>`,
 * `<thinking>...</thinking>`, or `<reasoning>...</reasoning>` blocks at the
 * start of an LLM response into `onReasoning(delta)` vs `onText(delta)`
 * without losing partial tag chunks across network boundaries.
 */
export function createInlineThinkSplitter({ onReasoning, onText }) {
  let state = 'init'; // 'init' | 'in_think' | 'body'
  let buffer = '';
  let activeCloseTag = '</think>';

  const OPEN_TAGS = [
    { open: '<think>', close: '</think>' },
    { open: '<thinking>', close: '</thinking>' },
    { open: '<reasoning>', close: '</reasoning>' },
  ];

  const flushInitAsBody = () => {
    state = 'body';
    if (buffer) {
      const out = buffer;
      buffer = '';
      onText(out);
    }
  };

  return {
    push(chunk) {
      if (!chunk) return;
      if (state === 'body') {
        onText(chunk);
        return;
      }

      buffer += chunk;

      if (state === 'init') {
        const trimmedStart = buffer.replace(/^\s+/, '');
        if (!trimmedStart) {
          if (buffer.length > 32) flushInitAsBody();
          return;
        }
        for (const tag of OPEN_TAGS) {
          if (trimmedStart.toLowerCase().startsWith(tag.open)) {
            const afterOpen = trimmedStart.slice(tag.open.length).replace(/^\r?\n/, '');
            activeCloseTag = tag.close;
            state = 'in_think';
            buffer = afterOpen;
            break;
          }
        }
        if (state === 'init') {
          const lower = trimmedStart.toLowerCase();
          const couldBePartialOpen = OPEN_TAGS.some(
            (t) => t.open.startsWith(lower) && lower.length < t.open.length,
          );
          if (!couldBePartialOpen) {
            flushInitAsBody();
          }
          return;
        }
      }

      if (state === 'in_think') {
        const lowerBuf = buffer.toLowerCase();
        const closeIdx = lowerBuf.indexOf(activeCloseTag);
        if (closeIdx !== -1) {
          const thoughtPart = buffer.slice(0, closeIdx);
          if (thoughtPart) onReasoning(thoughtPart);
          const rest = buffer.slice(closeIdx + activeCloseTag.length).replace(/^\s*\r?\n/, '');
          buffer = '';
          state = 'body';
          if (rest) onText(rest);
          return;
        }

        // Keep up to `activeCloseTag.length - 1` trailing chars in case close tag is split across chunks
        const holdLen = activeCloseTag.length - 1;
        if (buffer.length > holdLen) {
          const safeLen = buffer.length - holdLen;
          const emitPart = buffer.slice(0, safeLen);
          buffer = buffer.slice(safeLen);
          if (emitPart) onReasoning(emitPart);
        }
      }
    },
    finish() {
      if (!buffer) return;
      if (state === 'in_think') {
        onReasoning(buffer);
      } else {
        onText(buffer);
      }
      buffer = '';
    },
  };
}

/**
 * Checks whether an assistant turn is a synthetic empty `<think>` prefill block
 * rather than genuine chat history content.
 */
export function isSyntheticThinkPrefill(msg) {
  if (!msg || msg.role !== 'assistant' || msg.source === 'chatHistory') return false;
  const stripped = String(msg.content ?? '')
    .replace(/<\/?(?:think|thinking|reasoning)[^>]*>/gi, '')
    .replace(/[\s\u2800]+/g, '');
  return stripped.length === 0;
}

/**
 * Counts `\n`-delimited lines in a streaming reasoning buffer for incremental heading checks.
 */
export function countNormalizedLines(str) {
  let n = 1;
  for (let i = 0; i < str.length; i += 1) {
    if (str.charCodeAt(i) === 10) n += 1;
  }
  return n;
}
