/**
 * NexusTavern — pure message decoration engine.
 *
 * Works on an HTML string so the very same rules can be reused both in the
 * React render path and inside the generated sandbox document. Decoration is
 * applied strictly to TEXT NODES, so markup coming from a character card
 * (tables, <details>, inputs, custom structures) is never rewritten.
 */

const INLINE_TOKEN_REGEX =
  /(`[^`\n]+`|\*\*[\s\S]+?\*\*|\*[^*\n]+\*|"[^"\n]+"|“[^”\n]+”|«[^»\n]+»)/g;

const THINKING_REGEX = /<(?:think|thinking|reasoning)>([\s\S]*?)<\/(?:think|thinking|reasoning)>/gi;
const OPEN_STREAM_THINKING_REGEX = /<(?:think|thinking|reasoning)\b[^>]*>([\s\S]*)$/i;

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

/**
 * Extracts <think>…</think> blocks (plus an unclosed trailing <think>… stream
 * when `isStreaming` is active) and merges them with explicit reasoning
 * metadata. Returns the reasoning text plus the remaining body.
 */
export function extractThinkingAndCleanBody(
  rawText = '',
  explicitReasoning = '',
  { isStreaming = false } = {},
) {
  let body = String(rawText || '');
  const collected = [];

  if (explicitReasoning && String(explicitReasoning).trim()) {
    collected.push(String(explicitReasoning).trim());
  }

  body = body.replace(THINKING_REGEX, (_, inner) => {
    const clean = String(inner || '').trim();
    if (clean && !collected.includes(clean)) {
      collected.push(clean);
    }
    return '';
  });

  if (isStreaming) {
    const openMatch = body.match(OPEN_STREAM_THINKING_REGEX);
    if (openMatch) {
      const partialReasoning = String(openMatch[1] || '').trim();
      if (partialReasoning && !collected.includes(partialReasoning)) {
        collected.push(partialReasoning);
      }
      body = body.slice(0, openMatch.index);
    }
  }

  return {
    reasoningText: collected.join('\n\n').trim(),
    cleanBody: body.trim(),
  };
}

const RECAP_BLOCK_REGEX = /<recap\b[^>]*>([\s\S]*?)<\/recap>/gi;
const OPEN_STREAM_RECAP_REGEX = /<recap\b[^>]*>([\s\S]*)$/i;

function unwrapLegacyRecapDetails(rawInner = '') {
  let cleaned = String(rawInner || '').trim();
  const detailsMatch = cleaned.match(
    /^<details\b[^>]*>\s*(?:<summary\b[^>]*>[\s\S]*?<\/summary>\s*)?([\s\S]*?)<\/details>$/i,
  );
  if (detailsMatch) {
    cleaned = String(detailsMatch[1] || '').trim();
  }
  return cleaned;
}

/**
 * Extracts `<recap>...</recap>` blocks (and an unclosed trailing `<recap>...`
 * shard while `isStreaming` is active) from an AI message body so the recap
 * can be rendered in the dedicated M3 `MessageRecapBox` molecule.
 */
export function extractRecapAndCleanBody(rawBody = '', { isStreaming = false } = {}) {
  let body = String(rawBody || '');
  const collected = [];
  let isRecapStreaming = false;

  if (!body || !/<recap\b/i.test(body)) {
    return { recapText: '', cleanBody: body, isRecapStreaming: false };
  }

  body = body.replace(RECAP_BLOCK_REGEX, (_, inner) => {
    const clean = unwrapLegacyRecapDetails(inner);
    if (clean) collected.push(clean);
    return '';
  });

  if (isStreaming) {
    const openMatch = body.match(OPEN_STREAM_RECAP_REGEX);
    if (openMatch) {
      isRecapStreaming = true;
      const partial = unwrapLegacyRecapDetails(openMatch[1]);
      if (partial) collected.push(partial);
      body = body.slice(0, openMatch.index);
    }
  }

  return {
    recapText: collected.join('\n\n').trim(),
    cleanBody: body.trim(),
    isRecapStreaming,
  };
}

/**
 * Surgically updates (or removes if empty) the `<recap>...</recap>` block inside
 * a raw AI message string while leaving `<story>...</story>` and `<think>` intact.
 */
export function replaceRecapBlockInRawText(rawText = '', nextRecapText = '') {
  const source = String(rawText || '');
  const trimmedRecap = String(nextRecapText || '').trim();
  const replacementBlock = trimmedRecap ? `<recap>\n${trimmedRecap}\n</recap>` : '';

  if (/<recap\b[^>]*>[\s\S]*?<\/recap>/i.test(source)) {
    let replacedFirst = false;
    const updated = source.replace(RECAP_BLOCK_REGEX, () => {
      if (!replacedFirst) {
        replacedFirst = true;
        return replacementBlock;
      }
      return '';
    });
    return updated.replace(/\n{3,}/g, '\n\n').trim();
  }

  if (!trimmedRecap) return source;
  return `${source.trimEnd()}\n\n${replacementBlock}`.trim();
}

/**
 * Extracts the latest completed section heading from a streaming or finished
 * Chain-of-Thought / reasoning trace (e.g. `**Interpreting the Scene**`,
 * `### Analyzing Character Voice`, `1. **Drafting Reply**: ...`).
 *
 * Incomplete trailing headings (unclosed `**` or an unfinished `# Heading` line
 * without a newline yet) are ignored so the UI label updates cleanly per step
 * instead of flickering character-by-character.
 */
export function extractLatestReasoningHeading(reasoningText = '') {
  if (!reasoningText) return null;
  const normalized = String(reasoningText).replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  let latest = null;

  const cleanHeadingCandidate = (raw) => {
    const stripped = String(raw || '')
      .replace(/[*_`~]+/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[\s:.;—–-]+$/g, '')
      .replace(/\.{2,}$/g, '')
      .replace(/…+$/g, '')
      .trim();
    if (stripped.length < 2 || stripped.length > 110) return null;
    return /[?!]$/.test(stripped) ? stripped : `${stripped}…`;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    const withoutListPrefix = rawLine.replace(
      /^(?:[-*•]\s+|\d+[.)]\s+|step\s+\d+\s*[:.-]\s*)/i,
      '',
    );

    // 1. Standalone bold heading line: `**Analyzing the Scene**` or `__Drafting__:`
    const standaloneBold = withoutListPrefix.match(
      /^(?:\*\*([^*\n]{2,110}?)\*\*|__([^_\n]{2,110}?)__)\s*[:—–.-]?\s*$/,
    );
    if (standaloneBold) {
      const cleaned = cleanHeadingCandidate(standaloneBold[1] || standaloneBold[2]);
      if (cleaned) latest = cleaned;
      continue;
    }

    // 2. Bold step lead followed by a colon/dash: `**Analyzing the Scene:** The user...`
    const leadBoldInsideColon = withoutListPrefix.match(
      /^(?:\*\*([^*\n]{2,80}?):\*\*|__([^_\n]{2,80}?):__)\s+\S/,
    );
    if (leadBoldInsideColon) {
      const cleaned = cleanHeadingCandidate(leadBoldInsideColon[1] || leadBoldInsideColon[2]);
      if (cleaned) latest = cleaned;
      continue;
    }

    const leadBoldOutsideColon = withoutListPrefix.match(
      /^(?:\*\*([^*\n]{2,80}?)\*\*|__([^_\n]{2,80}?)__)\s*(?::|—|–|-)\s+\S/,
    );
    if (leadBoldOutsideColon) {
      const cleaned = cleanHeadingCandidate(leadBoldOutsideColon[1] || leadBoldOutsideColon[2]);
      if (cleaned) latest = cleaned;
      continue;
    }

    // 3. Markdown ATX heading (`#`..`######`) — wait for newline so it doesn't flicker mid-word
    if (i < lines.length - 1) {
      const atxMatch = rawLine.match(/^#{1,6}\s+(.{2,110}?)\s*#*$/);
      if (atxMatch) {
        const cleaned = cleanHeadingCandidate(atxMatch[1]);
        if (cleaned) latest = cleaned;
      }
    }
  }

  return latest;
}

/** Resolves {{user}} / {{char}} macros for display. */
export function replaceDisplayMacros(text, userName, charName) {
  if (!text) return '';
  let result = text;
  if (userName) {
    result = result.replace(/\{\{user\}\}/gi, userName);
  }
  if (charName) {
    result = result.replace(/\{\{char\}\}/gi, charName);
  }
  return result;
}

const BLOCK_ELEMENT_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DETAILS', 'DIALOG',
  'DD', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE',
  'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HEADER', 'HGROUP', 'HR', 'LI', 'MAIN', 'NAV', 'OL',
  'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE', 'THEAD', 'TBODY',
  'TFOOT', 'TR', 'TD', 'TH', 'UL', 'STYLE', 'CUSTOM-STYLE',
]);

const STRUCTURAL_CONTAINER_TAGS = new Set([
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'COLGROUP',
  'UL', 'OL', 'DL', 'SELECT', 'OPTGROUP', 'MENU', 'FIGURE',
]);

const HR_BLOCK_SPLIT_REGEX =
  /(?:^|\n+)[ \t]*(?:-\s*-\s*-+|\*\s*\*\s*\*+|_\s*_\s*_+)[ \t]*(?=\n+|$)\n*/g;

/**
 * Decorates a single plain-text chunk into markup (inline code, bold,
 * thoughts, direct speech quotes). Tokenization runs before HTML escaping
 * so straight double quotes ("...") match before becoming `&quot;`.
 */
export function decorateInlineText(text = '') {
  const parts = String(text).split(INLINE_TOKEN_REGEX);

  return parts
    .map((segment) => {
      if (!segment) return '';

      if (segment.startsWith('`') && segment.endsWith('`') && segment.length > 2) {
        return `<code class="bb-decorator-inline-code">${escapeHtml(segment.slice(1, -1))}</code>`;
      }
      if (segment.startsWith('**') && segment.endsWith('**') && segment.length > 4) {
        return `<strong class="bb-decorator-bold">${escapeHtml(segment.slice(2, -2))}</strong>`;
      }
      if (segment.startsWith('*') && segment.endsWith('*') && segment.length > 2) {
        return `<em class="bb-decorator-thought">${escapeHtml(segment.slice(1, -1))}</em>`;
      }
      if (
        (segment.startsWith('"') && segment.endsWith('"')) ||
        (segment.startsWith('“') && segment.endsWith('”')) ||
        (segment.startsWith('«') && segment.endsWith('»'))
      ) {
        return `<span class="bb-decorator-quote">${escapeHtml(segment)}</span>`;
      }
      return escapeHtml(segment);
    })
    .join('');
}

/**
 * Splits a plain prose segment into paragraph chunks on blank lines (`\n\n+`),
 * converting single line breaks inside a paragraph into `<br />` and paragraph
 * breaks into a compact `.bb-decorator-para-gap` spacer matching ST + BookboundUI.
 */
function formatProseSegmentLines(segment = '') {
  const normalized = String(segment).replace(/\r\n?/g, '\n');
  if (!normalized) return '';

  const parts = normalized.split(/\n{2,}/);
  return parts
    .map((part) => decorateInlineText(part).replace(/\n/g, '<br />'))
    .join('<span class="bb-decorator-para-gap" aria-hidden="true"></span>');
}

/**
 * Decorates a prose text segment and converts newlines (`\n`, `\n\n`)
 * and standalone Markdown horizontal rules (`---`, `- - -`) into HTML.
 */
function formatProseTextNode(rawText = '') {
  if (!rawText) return '';

  const chunks = [];
  let lastIdx = 0;
  let match;
  HR_BLOCK_SPLIT_REGEX.lastIndex = 0;

  while ((match = HR_BLOCK_SPLIT_REGEX.exec(rawText)) !== null) {
    if (match.index > lastIdx) {
      const before = rawText.slice(lastIdx, match.index);
      chunks.push(formatProseSegmentLines(before));
    }
    chunks.push('<hr class="bb-decorator-hr" />');
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < rawText.length) {
    const tail = rawText.slice(lastIdx);
    chunks.push(formatProseSegmentLines(tail));
  }

  return chunks.join('');
}

const STREAM_OPEN_TAIL_REGEX =
  /(`[^`\n]*|\*\*[^*]*|\*[^*\n]*|"[^"\n]*|“[^”\n]*|«[^»\n]*)$/;

function splitSegmentIntoWordTokens(rawSlice, baseOffset) {
  const out = [];
  const wordRegex = /(\s+|\S+)/g;
  let m;
  while ((m = wordRegex.exec(rawSlice)) !== null) {
    const value = m[0];
    out.push({
      offset: baseOffset + m.index,
      text: value,
      isSpace: /^\s+$/.test(value),
    });
  }
  return out;
}

/**
 * Tokenizes an active streaming paragraph into inline styled segments
 * (`plain` | `code` | `bold` | `thought` | `quote`) — including an unclosed
 * trailing marker while the LLM is mid-sentence — and splits each segment into
 * word tokens keyed by exact character offset from the start of the paragraph.
 */
export function tokenizeStreamingInline(text = '') {
  const source = String(text || '');
  if (!source) return [];

  const segments = [];
  let cursor = 0;
  const closedRegex = new RegExp(INLINE_TOKEN_REGEX.source, 'g');
  let match;

  const pushPlainWithOptionalOpenTail = (slice, startOffset) => {
    if (!slice) return;
    const isAtVeryEnd = startOffset + slice.length === source.length;
    if (isAtVeryEnd) {
      const openMatch = STREAM_OPEN_TAIL_REGEX.exec(slice);
      if (openMatch && openMatch[0].length >= 2) {
        const plainBefore = slice.slice(0, openMatch.index);
        if (plainBefore) {
          segments.push({
            kind: 'plain',
            offset: startOffset,
            tokens: splitSegmentIntoWordTokens(plainBefore, startOffset),
          });
        }
        const tailStr = openMatch[0];
        const tailOffset = startOffset + openMatch.index;
        if (tailStr.startsWith('`')) {
          segments.push({
            kind: 'code',
            offset: tailOffset,
            tokens: splitSegmentIntoWordTokens(tailStr.slice(1), tailOffset + 1),
          });
          return;
        }
        if (tailStr.startsWith('**')) {
          segments.push({
            kind: 'bold',
            offset: tailOffset,
            tokens: splitSegmentIntoWordTokens(tailStr.slice(2), tailOffset + 2),
          });
          return;
        }
        if (tailStr.startsWith('*')) {
          segments.push({
            kind: 'thought',
            offset: tailOffset,
            tokens: splitSegmentIntoWordTokens(tailStr.slice(1), tailOffset + 1),
          });
          return;
        }
        segments.push({
          kind: 'quote',
          offset: tailOffset,
          tokens: splitSegmentIntoWordTokens(tailStr, tailOffset),
        });
        return;
      }
    }

    segments.push({
      kind: 'plain',
      offset: startOffset,
      tokens: splitSegmentIntoWordTokens(slice, startOffset),
    });
  };

  while ((match = closedRegex.exec(source)) !== null) {
    if (match.index > cursor) {
      pushPlainWithOptionalOpenTail(source.slice(cursor, match.index), cursor);
    }
    const seg = match[0];
    const segOffset = match.index;

    if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 2) {
      segments.push({
        kind: 'code',
        offset: segOffset,
        tokens: splitSegmentIntoWordTokens(seg.slice(1, -1), segOffset + 1),
      });
    } else if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
      segments.push({
        kind: 'bold',
        offset: segOffset,
        tokens: splitSegmentIntoWordTokens(seg.slice(2, -2), segOffset + 2),
      });
    } else if (seg.startsWith('*') && seg.endsWith('*') && seg.length > 2) {
      segments.push({
        kind: 'thought',
        offset: segOffset,
        tokens: splitSegmentIntoWordTokens(seg.slice(1, -1), segOffset + 1),
      });
    } else {
      segments.push({
        kind: 'quote',
        offset: segOffset,
        tokens: splitSegmentIntoWordTokens(seg, segOffset),
      });
    }

    cursor = segOffset + seg.length;
  }

  if (cursor < source.length) {
    pushPlainWithOptionalOpenTail(source.slice(cursor), cursor);
  }

  return segments;
}

/**
 * Decorates the TEXT NODES of an arbitrary HTML string, leaving every tag
 * untouched. Walks the DOM so nested card structures survive intact while
 * preserving prose line breaks (`\n`) and blank lines (`\n\n`).
 */
export function decorateTextNodesInHtml(html = '') {
  if (typeof document === 'undefined') return html;
  if (!html || !html.includes('<')) {
    return formatProseTextNode(String(html || '').replace(/\r\n?/g, '\n'));
  }

  const root = document.createElement('div');
  root.innerHTML = html;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.data) continue;
    const parent = node.parentElement;
    // Never touch code / pre / style / script / textarea content.
    if (parent && parent.closest('code, pre, script, style, custom-style, textarea')) {
      continue;
    }
    // Skip whitespace-only text nodes directly inside table/list containers.
    if (parent && STRUCTURAL_CONTAINER_TAGS.has(parent.tagName) && !node.data.trim()) {
      continue;
    }
    targets.push(node);
  }

  for (const node of targets) {
    const parent = node.parentElement;
    const isBlockParent = !parent || parent === root || BLOCK_ELEMENT_TAGS.has(parent.tagName);
    const prev = node.previousSibling;
    const next = node.nextSibling;

    const stripLeadingNewlines =
      (prev === null && isBlockParent) ||
      (prev?.nodeType === 1 && BLOCK_ELEMENT_TAGS.has(prev.tagName));
    const stripTrailingNewlines =
      (next === null && isBlockParent) ||
      (next?.nodeType === 1 && BLOCK_ELEMENT_TAGS.has(next.tagName));

    let text = node.data.replace(/\r\n?/g, '\n');
    if (stripLeadingNewlines) {
      text = text.replace(/^[ \t]*\n+/, '');
    }
    if (stripTrailingNewlines) {
      text = text.replace(/\n+[ \t]*$/, '');
    }

    if (!text) {
      node.data = '';
      continue;
    }

    const formattedHtml = formatProseTextNode(text);
    const wrapper = document.createElement('span');
    wrapper.innerHTML = formattedHtml;
    node.replaceWith(...wrapper.childNodes);
  }

  return root.innerHTML;
}

const KNOWN_HTML_TAGS = new Set([
  'a', 'abbr', 'address', 'article', 'aside', 'audio',
  'b', 'bdi', 'bdo', 'blockquote', 'br', 'button',
  'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'custom-style',
  'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt',
  'em', 'fieldset', 'figcaption', 'figure', 'font', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr',
  'i', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li',
  'main', 'mark', 'marquee', 'meter', 'nav', 'ol', 'optgroup', 'option',
  'p', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby',
  's', 'samp', 'section', 'select', 'small', 'source', 'span', 'strike',
  'strong', 'style', 'sub', 'summary', 'sup', 'svg',
  'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'tr', 'track',
  'u', 'ul', 'video', 'wbr',
]);

/**
 * Strips transparent non-HTML XML wrapper tags emitted by roleplay presets
 * (such as `<ru>...</ru>`, `<en>...</en>`, `<response>...</response>`) outside
 * code spans/fences, and optionally hides an incomplete trailing `<tag` shard
 * while a message is actively streaming.
 */
export function stripNonHtmlXmlTags(text = '', { stripTrailingPartial = false } = {}) {
  if (!text) return '';
  const source = String(text);
  if (!source.includes('<')) return source;

  const CODE_SPAN_OR_FENCE = /(```[\s\S]*?```|`[^`\n]+`)/g;
  const XML_TAG_RE = /<\/?([a-zA-Z][\w:-]*)(?:\s[^<>]*)?\/?>/g;

  const cleanPlainSegment = (segment) =>
    segment.replace(XML_TAG_RE, (fullMatch, rawName) => {
      const lower = String(rawName || '').toLowerCase();
      return KNOWN_HTML_TAGS.has(lower) ? fullMatch : '';
    });

  let result = '';
  let lastIdx = 0;
  let match;
  while ((match = CODE_SPAN_OR_FENCE.exec(source)) !== null) {
    if (match.index > lastIdx) {
      result += cleanPlainSegment(source.slice(lastIdx, match.index));
    }
    result += match[0];
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < source.length) {
    result += cleanPlainSegment(source.slice(lastIdx));
  }

  if (stripTrailingPartial) {
    result = result.replace(/<\/?[a-zA-Z][\w:-]*(?:\s[^<>]{0,80})?$/, '');
  }

  return result;
}

/**
 * Detects whether a message body carries real HTML markup worth rendering
 * (as opposed to plain prose or transparent preset XML wrappers like `<ru>`).
 */
export function hasHtmlMarkup(text = '') {
  const value = String(text);
  if (!value.includes('<')) return false;
  const tagRe = /<\/?([a-zA-Z][\w:-]*)(?:\s[^<>]*)?\/?>/g;
  let match;
  while ((match = tagRe.exec(value)) !== null) {
    if (KNOWN_HTML_TAGS.has(String(match[1] || '').toLowerCase())) {
      return true;
    }
  }
  return false;
}

/**
 * Stylesheet for the decorator classes. Emitted as a plain CSS string so it
 * can be injected into the app build AND into the generated sandbox document.
 */
export function decoratorStyles() {
  return `
.bb-decorator-bold { font-weight: 650; }
.bb-decorator-quote { color: var(--bb-quote-color, inherit); font-weight: 450; }
.bb-decorator-thought { font-style: italic; opacity: 0.92; }
.bb-decorator-para-gap { display: block; height: 9px; }
.bb-decorator-inline-code {
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--bb-page-border-mid, rgba(125, 113, 98, 0.45));
  background: var(--bb-page-input-bg, rgba(12, 11, 9, 0.75));
  font-family: var(--bb-font-mono, monospace);
  font-size: 0.9em;
}
.bb-decorator-blockquote {
  margin: 2px 0;
  padding: 6px 12px;
  border-left: 3px solid var(--md-sys-color-tertiary, #8e7cc3);
  border-radius: 0 6px 6px 0;
  background: rgba(101, 117, 179, 0.06);
  font-style: italic;
}
.bb-decorator-hr {
  border: none;
  height: 1px;
  margin: 4px 0;
  background: linear-gradient(90deg, transparent 0%, var(--bb-page-border-strong, rgba(125, 113, 98, 0.6)) 50%, transparent 100%);
}
`.trim();
}
