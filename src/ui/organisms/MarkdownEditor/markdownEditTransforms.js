/**
 * Pure, framework-agnostic Markdown & RP prompt text editing transforms
 * for NexusTavern's MarkdownEditor (full parity with SillyTavern + BookboundUI).
 */

export const DEFAULT_IMG_PLACEHOLDER = 'https://example.com/image.png';

function hasExactSurroundingMarkers(val, start, end, openSym, closeSym) {
  const oLen = openSym.length;
  const cLen = closeSym.length;
  if (start < oLen || end + cLen > val.length) return false;
  if (val.slice(start - oLen, start) !== openSym) return false;
  if (val.slice(end, end + cLen) !== closeSym) return false;

  if (openSym === '*' && closeSym === '*') {
    const prevPrev = start - oLen - 1 >= 0 ? val[start - oLen - 1] : '';
    const nextNext = end + cLen < val.length ? val[end + cLen] : '';
    if (prevPrev === '*' && nextNext === '*') {
      const prev3 = start - oLen - 2 >= 0 ? val[start - oLen - 2] : '';
      const next3 = end + cLen + 1 < val.length ? val[end + cLen + 1] : '';
      if (prev3 !== '*' || next3 !== '*') return false;
    }
  }
  return true;
}

export function toggleInlineWrap(
  rawText,
  selStart,
  selEnd,
  openSym,
  closeSym = openSym,
  defaultPlaceholder = 'text',
) {
  const val = String(rawText ?? '');
  const start = Math.max(0, Math.min(selStart ?? 0, val.length));
  const end = Math.max(start, Math.min(selEnd ?? start, val.length));
  const oLen = openSym.length;
  const cLen = closeSym.length;

  if (start !== end) {
    const selected = val.slice(start, end);

    if (
      selected.length >= oLen + cLen &&
      selected.startsWith(openSym) &&
      selected.endsWith(closeSym) &&
      !(
        openSym === '*' &&
        closeSym === '*' &&
        selected.startsWith('**') &&
        selected.endsWith('**') &&
        !(selected.startsWith('***') && selected.endsWith('***'))
      )
    ) {
      const inner = selected.slice(oLen, selected.length - cLen);
      return {
        text: val.slice(0, start) + inner + val.slice(end),
        start,
        end: start + inner.length,
      };
    }

    if (hasExactSurroundingMarkers(val, start, end, openSym, closeSym)) {
      return {
        text: val.slice(0, start - oLen) + selected + val.slice(end + cLen),
        start: start - oLen,
        end: end - oLen,
      };
    }

    let trimmedSel = selected;
    let trailingSpace = '';
    if (openSym !== '"' && trimmedSel.endsWith(' ') && trimmedSel.trim().length > 0) {
      trimmedSel = trimmedSel.slice(0, -1);
      trailingSpace = ' ';
    }

    return {
      text: val.slice(0, start) + openSym + trimmedSel + closeSym + trailingSpace + val.slice(end),
      start: start + oLen,
      end: start + oLen + trimmedSel.length,
    };
  }

  if (hasExactSurroundingMarkers(val, start, end, openSym, closeSym)) {
    return {
      text: val.slice(0, start - oLen) + val.slice(end + cLen),
      start: start - oLen,
      end: start - oLen,
    };
  }

  const beforeChar = start > 0 ? val[start - 1] : '';
  const afterChar = start < val.length ? val[start] : '';
  const isWordChar = (ch) => ch !== '' && !/\s/.test(ch);

  if (isWordChar(beforeChar) && isWordChar(afterChar)) {
    let wStart = start - 1;
    let wEnd = start + 1;
    while (wStart > 0 && isWordChar(val[wStart - 1])) wStart -= 1;
    while (wEnd < val.length && isWordChar(val[wEnd])) wEnd += 1;

    const token = val.slice(wStart, wEnd);
    if (
      token.length >= oLen + cLen &&
      token.startsWith(openSym) &&
      token.endsWith(closeSym) &&
      !(
        openSym === '*' &&
        closeSym === '*' &&
        token.startsWith('**') &&
        token.endsWith('**') &&
        !(token.startsWith('***') && token.endsWith('***'))
      )
    ) {
      const inner = token.slice(oLen, token.length - cLen);
      const nextCaret = Math.max(wStart, Math.min(start - oLen, wStart + inner.length));
      return {
        text: val.slice(0, wStart) + inner + val.slice(wEnd),
        start: nextCaret,
        end: nextCaret,
      };
    }

    const nextCaret = start + oLen;
    return {
      text: val.slice(0, wStart) + openSym + token + closeSym + val.slice(wEnd),
      start: nextCaret,
      end: nextCaret,
    };
  }

  const content = defaultPlaceholder;
  return {
    text: val.slice(0, start) + openSym + content + closeSym + val.slice(end),
    start: start + oLen,
    end: start + oLen + content.length,
  };
}

export function toggleLinePrefix(rawText, selStart, selEnd, mode, targetPrefix = '') {
  const val = String(rawText ?? '');
  const start = Math.max(0, Math.min(selStart ?? 0, val.length));
  const end = Math.max(start, Math.min(selEnd ?? start, val.length));

  const lineStart = val.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const nextNl = val.indexOf('\n', end);
  const lineEnd = nextNl === -1 ? val.length : nextNl;

  const block = val.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  let transformedLines = lines;

  if (mode === 'heading') {
    const headingRe = /^(\s*)(#{1,6}\s+)?(.*)$/;
    const allHaveTarget = lines.every((l) => {
      const m = l.match(headingRe);
      return m && m[2] === targetPrefix;
    });
    transformedLines = lines.map((l) => {
      const m = l.match(headingRe);
      if (!m) return l;
      const [, indent, , content] = m;
      return allHaveTarget ? `${indent}${content}` : `${indent}${targetPrefix}${content}`;
    });
  } else if (mode === 'ul') {
    const listRe = /^(\s*)([-*+]\s+|\d+\.\s+)?(.*)$/;
    const allAreUl = lines.every((l) => (!l.trim() && lines.length > 1) || /^\s*[-*+]\s+/.test(l));
    transformedLines = lines.map((l) => {
      if (!l.trim() && lines.length > 1) return l;
      const m = l.match(listRe);
      const [, indent, , content] = m;
      return allAreUl ? `${indent}${content}` : `${indent}- ${content}`;
    });
  } else if (mode === 'ol') {
    const listRe = /^(\s*)([-*+]\s+|\d+\.\s+)?(.*)$/;
    const allAreOl = lines.every((l) => (!l.trim() && lines.length > 1) || /^\s*\d+\.\s+/.test(l));
    let num = 1;
    transformedLines = lines.map((l) => {
      if (!l.trim() && lines.length > 1) return l;
      const m = l.match(listRe);
      const [, indent, , content] = m;
      if (allAreOl) return `${indent}${content}`;
      const nextLine = `${indent}${num}. ${content}`;
      num += 1;
      return nextLine;
    });
  } else if (mode === 'blockquote') {
    const quoteRe = /^(\s*)(>\s?)?(.*)$/;
    const allQuoted = lines.every((l) => (!l.trim() && lines.length > 1) || /^\s*>\s?/.test(l));
    transformedLines = lines.map((l) => {
      if (!l.trim() && lines.length > 1) return l;
      const m = l.match(quoteRe);
      const [, indent, , content] = m;
      return allQuoted ? `${indent}${content}` : `${indent}> ${content}`;
    });
  }

  const newBlock = transformedLines.join('\n');
  const nextText = val.slice(0, lineStart) + newBlock + val.slice(lineEnd);

  if (lines.length === 1) {
    const delta = newBlock.length - block.length;
    const nextStart = Math.max(lineStart, start + delta);
    const nextEnd = Math.max(nextStart, end + delta);
    return { text: nextText, start: nextStart, end: nextEnd };
  }

  return {
    text: nextText,
    start: lineStart,
    end: lineStart + newBlock.length,
  };
}

export function insertCodeBlock(rawText, selStart, selEnd) {
  const val = String(rawText ?? '');
  const start = Math.max(0, Math.min(selStart ?? 0, val.length));
  const end = Math.max(start, Math.min(selEnd ?? start, val.length));
  const sel = val.slice(start, end) || 'code';
  const leadNl = start > 0 && val[start - 1] !== '\n' ? '\n' : '';
  const trailNl = end < val.length && val[end] !== '\n' ? '\n' : '';
  const block = `${leadNl}\`\`\`\n${sel}\n\`\`\`${trailNl}`;
  const codeStart = start + leadNl.length + 4;
  return {
    text: val.slice(0, start) + block + val.slice(end),
    start: codeStart,
    end: codeStart + sel.length,
  };
}

export function insertHorizontalRule(rawText, selStart, selEnd) {
  const val = String(rawText ?? '');
  const start = Math.max(0, Math.min(selStart ?? 0, val.length));
  const end = Math.max(start, Math.min(selEnd ?? start, val.length));
  const leadNl = start > 0 && val[start - 1] !== '\n' ? '\n' : '';
  const snippet = `${leadNl}---\n`;
  const caret = start + snippet.length;
  return {
    text: val.slice(0, start) + snippet + val.slice(end),
    start: caret,
    end: caret,
  };
}

export function insertImageTag(rawText, selStart, selEnd) {
  const val = String(rawText ?? '');
  const start = Math.max(0, Math.min(selStart ?? 0, val.length));
  const end = Math.max(start, Math.min(selEnd ?? start, val.length));
  const sel = val.slice(start, end).trim();
  const url = sel || DEFAULT_IMG_PLACEHOLDER;
  const prefix = '<img src="';
  const suffix = '">';
  const insert = `${prefix}${url}${suffix}`;
  const urlStart = start + prefix.length;
  return {
    text: val.slice(0, start) + insert + val.slice(end),
    start: urlStart,
    end: urlStart + url.length,
  };
}

export function applySmartEnter(rawText, selStart, selEnd) {
  const val = String(rawText ?? '');
  const start = Math.max(0, Math.min(selStart ?? 0, val.length));
  const end = Math.max(start, Math.min(selEnd ?? start, val.length));

  if (start === end) {
    const lineStart = val.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const currentLineUpToCursor = val.slice(lineStart, start);
    const nextNl = val.indexOf('\n', start);
    const restOfLine = val.slice(start, nextNl === -1 ? val.length : nextNl);

    const ulCont = currentLineUpToCursor.match(/^(\s*[-*+]\s+)(.*)$/);
    if (ulCont) {
      const [, prefix, body] = ulCont;
      if (!body.trim() && !restOfLine.trim()) {
        return {
          text: val.slice(0, lineStart) + val.slice(start + restOfLine.length),
          start: lineStart,
          end: lineStart,
        };
      }
      const insert = `\n${prefix}`;
      const caret = start + insert.length;
      return {
        text: val.slice(0, start) + insert + val.slice(end),
        start: caret,
        end: caret,
      };
    }

    const olCont = currentLineUpToCursor.match(/^(\s*)(\d+)\.(\s+)(.*)$/);
    if (olCont) {
      const [, indent, numStr, space, body] = olCont;
      if (!body.trim() && !restOfLine.trim()) {
        return {
          text: val.slice(0, lineStart) + val.slice(start + restOfLine.length),
          start: lineStart,
          end: lineStart,
        };
      }
      const nextNum = (parseInt(numStr, 10) || 1) + 1;
      const insert = `\n${indent}${nextNum}.${space}`;
      const caret = start + insert.length;
      return {
        text: val.slice(0, start) + insert + val.slice(end),
        start: caret,
        end: caret,
      };
    }
  }

  const caret = start + 1;
  return {
    text: val.slice(0, start) + '\n' + val.slice(end),
    start: caret,
    end: caret,
  };
}

export function applyTabIndent(rawText, selStart, selEnd, outdent = false, indentUnit = '  ') {
  const val = String(rawText ?? '');
  const start = Math.max(0, Math.min(selStart ?? 0, val.length));
  const end = Math.max(start, Math.min(selEnd ?? start, val.length));

  if (!outdent && start === end) {
    const caret = start + indentUnit.length;
    return {
      text: val.slice(0, start) + indentUnit + val.slice(end),
      start: caret,
      end: caret,
    };
  }

  const lineStart = val.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const nextNl = val.indexOf('\n', end);
  const lineEnd = nextNl === -1 ? val.length : nextNl;
  const block = val.slice(lineStart, lineEnd);
  const lines = block.split('\n');

  let firstLineDelta = 0;
  let totalDelta = 0;

  const transformed = lines.map((line, idx) => {
    if (outdent) {
      let removed = 0;
      let nextLine = line;
      if (nextLine.startsWith('\t')) {
        nextLine = nextLine.slice(1);
        removed = 1;
      } else {
        while (removed < indentUnit.length && nextLine.startsWith(' ')) {
          nextLine = nextLine.slice(1);
          removed += 1;
        }
      }
      if (idx === 0) firstLineDelta = -removed;
      totalDelta -= removed;
      return nextLine;
    }
    if (idx === 0) firstLineDelta = indentUnit.length;
    totalDelta += indentUnit.length;
    return `${indentUnit}${line}`;
  });

  const newBlock = transformed.join('\n');
  return {
    text: val.slice(0, lineStart) + newBlock + val.slice(lineEnd),
    start: Math.max(lineStart, start + firstLineDelta),
    end: Math.max(lineStart, end + totalDelta),
  };
}

export function detectActiveHeadingLevel(rawText, selStart) {
  const val = String(rawText ?? '');
  const pos = Math.max(0, Math.min(selStart ?? 0, val.length));
  const lineStart = val.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
  const nextNl = val.indexOf('\n', pos);
  const lineEnd = nextNl === -1 ? val.length : nextNl;
  const line = val.slice(lineStart, lineEnd);
  const match = line.match(/^\s*(#{1,6})\s+/);
  return match ? match[1].length : 0;
}

