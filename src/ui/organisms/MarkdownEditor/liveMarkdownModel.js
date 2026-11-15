/**
 * Pure helper functions for NexusTavern's LiveMD editor:
 * - Escapes & highlights Markdown + RP macros (`{{char}}`, `<tag>`, `<img src="...">`, `"quotes"`, headings, lists, HR, code fences)
 * - Reads/restores character selection offsets inside `.bb-md-rich-editor`
 */

import { DEFAULT_IMG_PLACEHOLDER } from './markdownEditTransforms.js';

export {
  DEFAULT_IMG_PLACEHOLDER,
  toggleInlineWrap,
  toggleLinePrefix,
  insertCodeBlock,
  insertHorizontalRule,
  insertImageTag,
  applySmartEnter,
  applyTabIndent,
  detectActiveHeadingLevel,
} from './markdownEditTransforms.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isSafeImagePreviewSrc(rawSrc) {
  const src = String(rawSrc ?? '').trim();
  if (!src || src === DEFAULT_IMG_PLACEHOLDER) return false;
  if (/^(javascript|vbscript|data:text\/html):/i.test(src)) return false;
  return true;
}

function highlightInlineMarkdown(escapedLine) {
  const tokens = [];
  const stash = (html) => {
    const key = `\u0000T${tokens.length}\u0000`;
    tokens.push(html);
    return key;
  };

  let out = escapedLine;

  out = out.replace(/(`+)([^`]+?)\1/g, (_m, ticks, body) =>
    stash(
      `<span class="bb-md-syn-code"><span class="bb-md-syn-marker">${ticks}</span>${body}<span class="bb-md-syn-marker">${ticks}</span></span>`,
    ),
  );

  out = out.replace(/(\{\{)([^{}\n]+?)(\}\})/g, (_m, open, body, close) =>
    stash(
      `<span class="bb-md-syn-macro"><span class="bb-md-syn-marker">${open}</span>${body}<span class="bb-md-syn-marker">${close}</span></span>`,
    ),
  );

  out = out.replace(
    /(&lt;\/?)([a-zA-Z0-9_:-]+)((?:\s+[^&]*?)?\/?&gt;)/g,
    (_m, open, name, rest) => {
      const isClosing = open === '&lt;/';
      if (!isClosing && name.toLowerCase() === 'img') {
        const srcMatch = rest.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'&]+))/i);
        const rawSrc = srcMatch ? (srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? '').trim() : '';
        const safeAttrSrc = rawSrc.replace(/"/g, '&quot;');
        const previewHtml = isSafeImagePreviewSrc(rawSrc)
          ? `<span class="bb-md-img-preview-box" contenteditable="false" data-bb-md-ignore="true"><img class="bb-md-img-preview" src="${safeAttrSrc}" alt="" loading="lazy" decoding="async" /></span>`
          : '';
        return stash(
          `<span class="bb-md-img-widget"><span class="bb-md-syn-xml"><span class="bb-md-syn-marker">${open}</span>${name}<span class="bb-md-syn-marker">${rest}</span></span>${previewHtml}</span>`,
        );
      }
      return stash(
        `<span class="bb-md-syn-xml"><span class="bb-md-syn-marker">${open}</span>${name}<span class="bb-md-syn-marker">${rest}</span></span>`,
      );
    },
  );

  out = out.replace(
    /(!\[)([^\]\n]*)(\]\()([^)\s\n]+)(\))/g,
    (_m, bangOpen, alt, mid, rawSrc, closeParen) => {
      const safeAttrSrc = rawSrc.trim().replace(/"/g, '&quot;');
      const previewHtml = isSafeImagePreviewSrc(rawSrc)
        ? `<span class="bb-md-img-preview-box" contenteditable="false" data-bb-md-ignore="true"><img class="bb-md-img-preview" src="${safeAttrSrc}" alt="" loading="lazy" decoding="async" /></span>`
        : '';
      return stash(
        `<span class="bb-md-img-widget"><span class="bb-md-syn-xml"><span class="bb-md-syn-marker">${bangOpen}</span>${alt}<span class="bb-md-syn-marker">${mid}</span>${rawSrc}<span class="bb-md-syn-marker">${closeParen}</span></span>${previewHtml}</span>`,
      );
    },
  );

  out = out.replace(/(\*\*\*)([^\s*](?:.*?[^\s*])?)\1/g, (_m, sym, body) =>
    stash(
      `<span class="bb-md-syn-bold bb-md-syn-italic"><span class="bb-md-syn-marker">${sym}</span>${body}<span class="bb-md-syn-marker">${sym}</span></span>`,
    ),
  );

  out = out.replace(/(\*\*)([^\s*](?:.*?[^\s*])?)\1/g, (_m, sym, body) =>
    stash(
      `<span class="bb-md-syn-bold"><span class="bb-md-syn-marker">${sym}</span>${body}<span class="bb-md-syn-marker">${sym}</span></span>`,
    ),
  );

  out = out.replace(/(__)([^\s_](?:.*?[^\s_])?)\1/g, (_m, sym, body) =>
    stash(
      `<span class="bb-md-syn-underline"><span class="bb-md-syn-marker">${sym}</span>${body}<span class="bb-md-syn-marker">${sym}</span></span>`,
    ),
  );

  out = out.replace(/(~~)([^\s~](?:.*?[^\s~])?)\1/g, (_m, sym, body) =>
    stash(
      `<span class="bb-md-syn-strike"><span class="bb-md-syn-marker">${sym}</span>${body}<span class="bb-md-syn-marker">${sym}</span></span>`,
    ),
  );

  out = out.replace(/(^|[^*])(\*)([^\s*](?:.*?[^\s*])?)\2(?!\*)/g, (_m, pre, sym, body) =>
    `${pre}${stash(
      `<span class="bb-md-syn-italic"><span class="bb-md-syn-marker">${sym}</span>${body}<span class="bb-md-syn-marker">${sym}</span></span>`,
    )}`,
  );

  out = out.replace(/(")([^"\n]{1,400}?)(")/g, (_m, q1, body, q2) =>
    stash(
      `<span class="bb-md-syn-quote"><span class="bb-md-syn-marker">${q1}</span>${body}<span class="bb-md-syn-marker">${q2}</span></span>`,
    ),
  );

  let prev;
  do {
    prev = out;
    out = out.replace(/\u0000T(\d+)\u0000/g, (_, idx) => tokens[Number(idx)] || '');
  } while (out !== prev && out.includes('\u0000T'));

  return out;
}

export function renderLiveMarkdownHtml(rawText) {
  const normalized = String(rawText ?? '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const htmlLines = [];
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const escaped = escapeHtml(rawLine);

    if (!rawLine) {
      htmlLines.push('<div class="bb-md-line bb-md-empty-line"><br></div>');
      continue;
    }

    const fenceMatch = escaped.match(/^(\s*)(`{3,})(.*)$/);
    if (fenceMatch) {
      inCodeFence = !inCodeFence;
      const [, indent, ticks, info] = fenceMatch;
      htmlLines.push(
        `<div class="bb-md-line bb-md-codeblock-line">${indent}<span class="bb-md-syn-marker">${ticks}</span><span class="bb-md-syn-code-lang">${info}</span></div>`,
      );
      continue;
    }

    if (inCodeFence) {
      htmlLines.push(`<div class="bb-md-line bb-md-codeblock-line">${escaped}</div>`);
      continue;
    }

    if (/^\s*(?:[-]{3,}|[*]{3,}|[_]{3,})\s*$/.test(rawLine)) {
      htmlLines.push(
        `<div class="bb-md-line bb-md-hr-line"><span class="bb-md-syn-marker">${escaped}</span></div>`,
      );
      continue;
    }

    const headingMatch = escaped.match(/^(\s*)(#{1,6})(\s+)(.*)$/);
    if (headingMatch) {
      const [, indent, hashes, space, rest] = headingMatch;
      const level = Math.min(hashes.length, 6);
      htmlLines.push(
        `<div class="bb-md-line bb-md-h-line bb-md-h${level}">${indent}<span class="bb-md-syn-marker">${hashes}${space}</span><span class="bb-md-syn-heading">${highlightInlineMarkdown(rest)}</span></div>`,
      );
      continue;
    }

    const quoteMatch = escaped.match(/^(\s*)(&gt;\s?)(.*)$/);
    if (quoteMatch) {
      const [, indent, marker, rest] = quoteMatch;
      htmlLines.push(
        `<div class="bb-md-line bb-md-quote-line">${indent}<span class="bb-md-syn-marker">${marker}</span>${highlightInlineMarkdown(rest)}</div>`,
      );
      continue;
    }

    const ulMatch = escaped.match(/^(\s*)([-*+])(\s+)(.*)$/);
    if (ulMatch) {
      const [, indent, bullet, space, rest] = ulMatch;
      htmlLines.push(
        `<div class="bb-md-line bb-md-list-line bb-md-ul-line">${indent}<span class="bb-md-syn-marker bb-md-list-marker">${bullet}${space}</span>${highlightInlineMarkdown(rest)}</div>`,
      );
      continue;
    }

    const olMatch = escaped.match(/^(\s*)(\d+\.)(\s+)(.*)$/);
    if (olMatch) {
      const [, indent, num, space, rest] = olMatch;
      htmlLines.push(
        `<div class="bb-md-line bb-md-list-line bb-md-ol-line">${indent}<span class="bb-md-syn-marker bb-md-list-marker">${num}${space}</span>${highlightInlineMarkdown(rest)}</div>`,
      );
      continue;
    }

    htmlLines.push(`<div class="bb-md-line">${highlightInlineMarkdown(escaped)}</div>`);
  }

  return htmlLines.join('');
}

export function extractRichPlainText(richEl) {
  if (!richEl) return '';
  const lineEls = Array.from(richEl.children).filter(
    (el) => el.nodeType === 1 && (el.tagName === 'DIV' || el.tagName === 'P'),
  );
  if (lineEls.length > 0) {
    return lineEls
      .map((el) => (el.textContent || '').replace(/\r/g, '').replace(/\u00a0/g, ' '))
      .join('\n');
  }
  return (richEl.innerText || richEl.textContent || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ');
}

export function getRichSelectionOffsets(richEl) {
  const sel = window.getSelection?.();
  if (!richEl || !sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!richEl.contains(range.startContainer) || !richEl.contains(range.endContainer)) {
    return null;
  }

  const lines = Array.from(richEl.querySelectorAll(':scope > .bb-md-line'));
  const compute = (container, offset) => {
    if (lines.length === 0) {
      const pre = range.cloneRange();
      pre.selectNodeContents(richEl);
      pre.setEnd(container, offset);
      return pre.toString().length;
    }
    if (container === richEl) {
      let total = 0;
      const limit = Math.min(offset, lines.length);
      for (let i = 0; i < limit; i += 1) {
        total += (lines[i].textContent || '').length + 1;
      }
      return Math.max(0, total);
    }
    let total = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const lineEl = lines[i];
      if (lineEl === container || lineEl.contains(container)) {
        const sub = document.createRange();
        sub.selectNodeContents(lineEl);
        sub.setEnd(container, offset);
        return total + sub.toString().length;
      }
      total += (lineEl.textContent || '').length + 1;
    }
    return total;
  };

  const start = compute(range.startContainer, range.startOffset);
  const end = compute(range.endContainer, range.endOffset);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

export function setRichSelectionOffsets(richEl, startOffset, endOffset = startOffset) {
  const sel = window.getSelection?.();
  if (!richEl || !sel) return;
  const lines = Array.from(richEl.querySelectorAll(':scope > .bb-md-line'));
  if (lines.length === 0) return;

  const resolvePoint = (target) => {
    let rem = Math.max(0, target);
    for (let i = 0; i < lines.length; i += 1) {
      const lineEl = lines[i];
      const len = (lineEl.textContent || '').length;
      if (rem <= len || i === lines.length - 1) {
        const clamped = Math.min(rem, len);
        if (clamped === 0 && len === 0) return { node: lineEl, offset: 0 };
        const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
        let cur = walker.nextNode();
        let left = clamped;
        let last = null;
        while (cur) {
          const tLen = cur.nodeValue.length;
          if (left <= tLen) return { node: cur, offset: left };
          left -= tLen;
          last = cur;
          cur = walker.nextNode();
        }
        if (last) return { node: last, offset: last.nodeValue.length };
        return { node: lineEl, offset: 0 };
      }
      rem -= len + 1;
    }
    return { node: lines[0], offset: 0 };
  };

  try {
    const a = resolvePoint(startOffset);
    const b = endOffset === startOffset ? a : resolvePoint(endOffset);
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    // ignore transient DOM selection mismatches
  }
}

