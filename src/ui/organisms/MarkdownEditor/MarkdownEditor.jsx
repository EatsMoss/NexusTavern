import React, { useState, useRef, useMemo, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { Tooltip } from '@ui/atoms/Tooltip/Tooltip.jsx';
import { ScrollIndicator } from '@ui/atoms/ScrollIndicator/ScrollIndicator.jsx';
import { EmojiPicker } from '@ui/molecules/EmojiPicker/EmojiPicker.jsx';
import { useViewport } from '@core/hooks/useViewport.js';
import {
  renderLiveMarkdownHtml,
  extractRichPlainText,
  getRichSelectionOffsets,
  setRichSelectionOffsets,
  toggleInlineWrap,
  toggleLinePrefix,
  insertCodeBlock,
  insertHorizontalRule,
  insertImageTag,
  applySmartEnter,
  applyTabIndent,
  detectActiveHeadingLevel,
} from './liveMarkdownModel.js';
import './MarkdownEditor.css';

const MAX_HISTORY_STEPS = 120;
const TYPING_COALESCE_MS = 450;

const HEADING_OPTIONS = [
  { level: 1, prefix: '# ', badge: 'H1', label: 'Heading 1', syntax: '# ' },
  { level: 2, prefix: '## ', badge: 'H2', label: 'Heading 2', syntax: '## ' },
  { level: 3, prefix: '### ', badge: 'H3', label: 'Heading 3', syntax: '### ' },
];

/**
 * Scrolls `.bb-md-rich-editor` so the active caret / newly inserted line stays
 * comfortably inside the visible viewport (accounting for vertical padding).
 */
function scrollRichCaretIntoView(richEl, caretOffset, fullText = '') {
  if (!richEl || richEl.scrollHeight <= richEl.clientHeight + 1) return;

  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!richEl.contains(range.endContainer)) return;

  let caretTop = 0;
  let caretBottom = 0;
  let hasRect = false;

  const clientRects = range.getClientRects?.();
  if (clientRects && clientRects.length > 0) {
    const r = clientRects[clientRects.length - 1];
    if (r.height > 0) {
      caretTop = r.top;
      caretBottom = r.bottom;
      hasRect = true;
    }
  }

  if (!hasRect) {
    let node = range.endContainer;
    if (node === richEl) {
      const idx = Math.min(
        Math.max(0, range.endOffset),
        Math.max(0, richEl.children.length - 1),
      );
      node = richEl.children[idx] || null;
    } else if (node && node.nodeType !== 1) {
      node = node.parentElement;
    }
    const lineEl =
      node?.closest?.('.bb-md-line') || (node instanceof Element ? node : null);
    if (lineEl && richEl.contains(lineEl)) {
      const lr = lineEl.getBoundingClientRect();
      if (lr.height > 0) {
        caretTop = lr.top;
        caretBottom = lr.bottom;
        hasRect = true;
      }
    }
  }

  if (!hasRect) return;

  const hostRect = richEl.getBoundingClientRect();
  const cs = window.getComputedStyle?.(richEl);
  const padTop = (parseFloat(cs?.paddingTop) || 10) + 2;
  const padBottom = (parseFloat(cs?.paddingBottom) || 10) + 2;
  const visibleTop = hostRect.top + padTop;
  const visibleBottom = hostRect.bottom - padBottom;

  if (caretBottom > visibleBottom) {
    if (caretOffset >= fullText.length) {
      richEl.scrollTop = richEl.scrollHeight;
    } else {
      richEl.scrollTop += Math.ceil(caretBottom - visibleBottom);
    }
  } else if (caretTop < visibleTop) {
    richEl.scrollTop = Math.max(0, richEl.scrollTop - Math.ceil(visibleTop - caretTop));
  }
}

function ToolBtn({ tip, isMobile, children, ...btnProps }) {
  return (
    <Tooltip content={tip} disabled={isMobile || Boolean(btnProps.disabled)} delayMs={180}>
      <button type="button" aria-label={typeof tip === 'string' ? tip : undefined} {...btnProps}>
        {children}
      </button>
    </Tooltip>
  );
}

export function MarkdownEditor({
  label,
  headerActions = null,
  value = '',
  onChange,
  placeholder = 'Write character description, first message, or prompt...',
  defaultLiveMd = true,
  fillHeight = false,
  autoFocusEnd = false,
  className = '',
}) {
  const { isMobile } = useViewport();
  const [liveMd, setLiveMd] = useState(defaultLiveMd);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [headingOpen, setHeadingOpen] = useState(false);
  const [headingCoords, setHeadingCoords] = useState({ top: 0, left: 0, ready: false });
  const [activeHeadingLevel, setActiveHeadingLevel] = useState(0);
  const [historyMeta, setHistoryMeta] = useState({ index: 0, length: 1 });

  const textareaRef = useRef(null);
  const richRef = useRef(null);
  const emojiBtnRef = useRef(null);
  const headingBtnRef = useRef(null);
  const headingMenuRef = useRef(null);
  const lastRenderedValueRef = useRef(null);
  const pendingSelectionRef = useRef(null);
  const savedSelectionRef = useRef(null);
  const shouldScrollCaretRef = useRef(false);
  const composingRef = useRef(false);
  const didAutoFocusRef = useRef(false);

  const strValue = String(value ?? '');
  const historyRef = useRef([{ text: strValue, start: 0, end: 0 }]);
  const historyIdxRef = useRef(0);
  const lastEditMetaRef = useRef({ time: 0, kind: 'init' });
  const lastCommittedTextRef = useRef(strValue);

  const approxTokens = useMemo(
    () => Math.max(0, Math.ceil(strValue.length / 3.8)),
    [strValue],
  );

  useEffect(() => {
    if (strValue !== lastCommittedTextRef.current) {
      lastCommittedTextRef.current = strValue;
      historyRef.current = [{ text: strValue, start: 0, end: 0 }];
      historyIdxRef.current = 0;
      lastEditMetaRef.current = { time: 0, kind: 'external' };
      setHistoryMeta({ index: 0, length: 1 });
      setActiveHeadingLevel(detectActiveHeadingLevel(strValue, 0));
    }
  }, [strValue]);

  const syncHistoryMeta = useCallback(() => {
    setHistoryMeta({
      index: historyIdxRef.current,
      length: historyRef.current.length,
    });
  }, []);

  const recordHistorySnapshot = useCallback(
    (nextText, selStart, selEnd, kind = 'command') => {
      const stack = historyRef.current;
      const current = stack[historyIdxRef.current];
      if (current && current.text === nextText) {
        current.start = selStart;
        current.end = selEnd;
        return;
      }

      const now = Date.now();
      const canCoalesce =
        kind === 'typing' &&
        lastEditMetaRef.current.kind === 'typing' &&
        now - lastEditMetaRef.current.time < TYPING_COALESCE_MS &&
        historyIdxRef.current === stack.length - 1 &&
        historyIdxRef.current > 0 &&
        Math.abs(nextText.length - (current?.text.length ?? 0)) <= 2 &&
        !nextText.slice(Math.max(0, selStart - 1), selStart).includes('\n');

      if (canCoalesce) {
        stack[historyIdxRef.current] = { text: nextText, start: selStart, end: selEnd };
      } else {
        const truncated = stack.slice(0, historyIdxRef.current + 1);
        truncated.push({ text: nextText, start: selStart, end: selEnd });
        if (truncated.length > MAX_HISTORY_STEPS) {
          truncated.shift();
        }
        historyRef.current = truncated;
        historyIdxRef.current = truncated.length - 1;
      }

      lastEditMetaRef.current = { time: now, kind };
      syncHistoryMeta();
    },
    [syncHistoryMeta],
  );

  useLayoutEffect(() => {
    if (!liveMd || !richRef.current || composingRef.current) return;
    const el = richRef.current;
    if (lastRenderedValueRef.current === strValue && el.childNodes.length > 0) {
      if (pendingSelectionRef.current) {
        const { start, end } = pendingSelectionRef.current;
        pendingSelectionRef.current = null;
        el.focus({ preventScroll: true });
        setRichSelectionOffsets(el, start, end);
        if (shouldScrollCaretRef.current) {
          shouldScrollCaretRef.current = false;
          scrollRichCaretIntoView(el, end, strValue);
        }
      }
      return;
    }

    const activeSel =
      pendingSelectionRef.current ||
      (document.activeElement === el ? getRichSelectionOffsets(el) : null);
    pendingSelectionRef.current = null;
    const needsCaretScroll = shouldScrollCaretRef.current;
    shouldScrollCaretRef.current = false;

    el.innerHTML = renderLiveMarkdownHtml(strValue);
    lastRenderedValueRef.current = strValue;

    if (activeSel && document.activeElement === el) {
      setRichSelectionOffsets(el, activeSel.start, activeSel.end);
      if (needsCaretScroll) {
        scrollRichCaretIntoView(el, activeSel.end, strValue);
      }
    }

    if (autoFocusEnd && !didAutoFocusRef.current) {
      didAutoFocusRef.current = true;
      const endPos = strValue.length;
      el.focus({ preventScroll: true });
      setRichSelectionOffsets(el, endPos, endPos);
      el.scrollTop = el.scrollHeight;
    }
  }, [strValue, liveMd, autoFocusEnd]);

  useLayoutEffect(() => {
    if (!autoFocusEnd || didAutoFocusRef.current || liveMd) return;
    const ta = textareaRef.current;
    if (!ta) return;
    didAutoFocusRef.current = true;
    const endPos = strValue.length;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(endPos, endPos);
    ta.scrollTop = ta.scrollHeight;
  }, [autoFocusEnd, liveMd, strValue.length]);

  const captureSelection = useCallback(() => {
    let resolved = null;
    if (liveMd && richRef.current) {
      const offsets = getRichSelectionOffsets(richRef.current);
      if (offsets) {
        savedSelectionRef.current = offsets;
        resolved = offsets;
      }
    } else if (!liveMd && textareaRef.current) {
      const ta = textareaRef.current;
      if (document.activeElement === ta) {
        const offsets = {
          start: ta.selectionStart ?? strValue.length,
          end: ta.selectionEnd ?? strValue.length,
        };
        savedSelectionRef.current = offsets;
        resolved = offsets;
      }
    }
    if (!resolved && savedSelectionRef.current) {
      resolved = {
        start: Math.min(savedSelectionRef.current.start, strValue.length),
        end: Math.min(savedSelectionRef.current.end, strValue.length),
      };
    }
    if (!resolved) {
      resolved = { start: strValue.length, end: strValue.length };
    }
    const lvl = detectActiveHeadingLevel(strValue, resolved.start);
    setActiveHeadingLevel((prev) => (prev === lvl ? prev : lvl));
    return resolved;
  }, [liveMd, strValue]);

  const getSelection = useCallback(() => captureSelection(), [captureSelection]);

  const commitEdit = useCallback(
    (nextText, selStart, selEnd = selStart, options = {}) => {
      const { keepBlurred = false, historyKind = 'command', skipHistory = false } = options;
      savedSelectionRef.current = { start: selStart, end: selEnd };
      if (!keepBlurred) {
        pendingSelectionRef.current = { start: selStart, end: selEnd };
        shouldScrollCaretRef.current = true;
        if (liveMd && richRef.current && document.activeElement !== richRef.current) {
          richRef.current.focus({ preventScroll: true });
        }
      }
      lastCommittedTextRef.current = nextText;
      if (!skipHistory) {
        recordHistorySnapshot(nextText, selStart, selEnd, historyKind);
      }
      setActiveHeadingLevel(detectActiveHeadingLevel(nextText, selStart));
      lastRenderedValueRef.current = null;
      onChange?.(nextText);
      if (!liveMd && textareaRef.current && !keepBlurred) {
        requestAnimationFrame(() => {
          const ta = textareaRef.current;
          if (!ta) return;
          ta.focus({ preventScroll: true });
          ta.setSelectionRange(selStart, selEnd);
          if (selEnd >= nextText.length && ta.scrollHeight > ta.clientHeight) {
            ta.scrollTop = ta.scrollHeight;
          }
        });
      }
    },
    [liveMd, onChange, recordHistorySnapshot],
  );

  const runTransform = useCallback(
    (transformFn) => {
      const { start, end } = getSelection();
      const res = transformFn(strValue, start, end);
      if (!res) return;
      commitEdit(res.text, res.start, res.end, { historyKind: 'command' });
    },
    [commitEdit, getSelection, strValue],
  );

  const handleToggleWrap = useCallback(
    (openSym, closeSym = openSym, sample = 'text') => {
      runTransform((txt, s, e) => toggleInlineWrap(txt, s, e, openSym, closeSym, sample));
    },
    [runTransform],
  );

  const handleToggleBlock = useCallback(
    (mode, prefix = '') => {
      runTransform((txt, s, e) => toggleLinePrefix(txt, s, e, mode, prefix));
    },
    [runTransform],
  );

  const insertSnippet = useCallback(
    (snippet, options = {}) => {
      const { start, end } = getSelection();
      const next = `${strValue.slice(0, start)}${snippet}${strValue.slice(end)}`;
      const cursor = start + snippet.length;
      commitEdit(next, cursor, cursor, options);
    },
    [commitEdit, getSelection, strValue],
  );

  const handleUndo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const entry = historyRef.current[historyIdxRef.current];
    lastEditMetaRef.current = { time: Date.now(), kind: 'undo' };
    syncHistoryMeta();
    commitEdit(entry.text, entry.start, entry.end, { skipHistory: true });
  }, [commitEdit, syncHistoryMeta]);

  const handleRedo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const entry = historyRef.current[historyIdxRef.current];
    lastEditMetaRef.current = { time: Date.now(), kind: 'redo' };
    syncHistoryMeta();
    commitEdit(entry.text, entry.start, entry.end, { skipHistory: true });
  }, [commitEdit, syncHistoryMeta]);

  const focusEditorAtSavedSelection = useCallback(() => {
    const sel = savedSelectionRef.current || { start: strValue.length, end: strValue.length };
    const start = Math.min(sel.start, strValue.length);
    const end = Math.min(sel.end, strValue.length);
    if (liveMd && richRef.current) {
      richRef.current.focus();
      setRichSelectionOffsets(richRef.current, start, end);
    } else if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(start, end);
    }
  }, [liveMd, strValue.length]);

  const handleToggleEmoji = () => {
    setHeadingOpen(false);
    if (!emojiOpen) {
      captureSelection();
      if (isMobile) {
        richRef.current?.blur();
        textareaRef.current?.blur();
      }
      setEmojiOpen(true);
    } else {
      setEmojiOpen(false);
    }
  };

  useLayoutEffect(() => {
    if (!headingOpen) {
      setHeadingCoords((prev) => (prev.ready ? { top: 0, left: 0, ready: false } : prev));
      return;
    }
    const anchor = headingBtnRef.current;
    const menuEl = headingMenuRef.current;
    if (!anchor || !menuEl) return;
    const rect = anchor.getBoundingClientRect();
    const mRect = menuEl.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 5;
    if (left + mRect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - mRect.width - 8);
    }
    if (top + mRect.height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - mRect.height - 5);
    }
    setHeadingCoords({ top: Math.round(top), left: Math.round(left), ready: true });
  }, [headingOpen]);

  useEffect(() => {
    if (!headingOpen) return undefined;
    const onPointerDown = (e) => {
      if (
        headingBtnRef.current?.contains(e.target) ||
        headingMenuRef.current?.contains(e.target)
      ) {
        return;
      }
      setHeadingOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setHeadingOpen(false);
    };
    const onViewportChange = () => setHeadingOpen(false);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [headingOpen]);

  const handleRichInput = () => {
    if (composingRef.current || !richRef.current) return;
    const el = richRef.current;
    const sel = getRichSelectionOffsets(el);
    const plain = extractRichPlainText(el);
    const resolvedSel = sel || { start: plain.length, end: plain.length };
    savedSelectionRef.current = resolvedSel;
    pendingSelectionRef.current = resolvedSel;
    shouldScrollCaretRef.current = true;
    lastCommittedTextRef.current = plain;
    recordHistorySnapshot(plain, resolvedSel.start, resolvedSel.end, 'typing');
    setActiveHeadingLevel(detectActiveHeadingLevel(plain, resolvedSel.start));
    lastRenderedValueRef.current = null;
    onChange?.(plain);
  };

  const handleRichBeforeInput = (e) => {
    const type = e.nativeEvent?.inputType || e.inputType;
    if (type === 'formatBold') {
      e.preventDefault();
      handleToggleWrap('**', '**', 'bold');
    } else if (type === 'formatItalic') {
      e.preventDefault();
      handleToggleWrap('*', '*', 'italic');
    } else if (type === 'formatUnderline') {
      e.preventDefault();
      handleToggleWrap('__', '__', 'underline');
    } else if (type === 'formatStrikeThrough') {
      e.preventDefault();
      handleToggleWrap('~~', '~~', 'strike');
    }
  };

  const handleSharedKeyDown = (e, isRichMode) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const code = e.code;
      const key = e.key?.toLowerCase();

      if (!e.shiftKey && (code === 'KeyZ' || key === 'z')) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (code === 'KeyY' || key === 'y' || (e.shiftKey && (code === 'KeyZ' || key === 'z'))) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (!e.shiftKey && (code === 'KeyB' || key === 'b')) {
        e.preventDefault();
        handleToggleWrap('**', '**', 'bold');
        return;
      }
      if (!e.shiftKey && (code === 'KeyI' || key === 'i')) {
        e.preventDefault();
        handleToggleWrap('*', '*', 'italic');
        return;
      }
      if (!e.shiftKey && (code === 'KeyU' || key === 'u')) {
        e.preventDefault();
        handleToggleWrap('__', '__', 'underline');
        return;
      }
      if (!e.shiftKey && (code === 'KeyK' || key === 'k')) {
        e.preventDefault();
        handleToggleWrap('`', '`', 'code');
        return;
      }
      if (e.shiftKey && (code === 'Backquote' || e.key === '~' || e.key === '`')) {
        e.preventDefault();
        handleToggleWrap('~~', '~~', 'strike');
        return;
      }
    }

    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      runTransform((txt, s, end) => applyTabIndent(txt, s, end, e.shiftKey, '  '));
      return;
    }

    if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (e.shiftKey) {
        if (isRichMode) {
          e.preventDefault();
          insertSnippet('\n', { historyKind: 'typing' });
        }
        return;
      }
      const { start } = getSelection();
      const lineStart = strValue.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
      const linePrefixSlice = strValue.slice(lineStart, start);
      const isListLine = /^(\s*(?:[-*+]|\d+\.)\s+)/.test(linePrefixSlice);
      if (isRichMode || isListLine) {
        e.preventDefault();
        runTransform((txt, s, ePos) => applySmartEnter(txt, s, ePos));
      }
    }
  };

  const handleRichPaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (text) insertSnippet(text.replace(/\r\n/g, '\n'));
  };

  const preventFocusLoss = (e) => e.preventDefault();
  const canUndo = historyMeta.index > 0;
  const canRedo = historyMeta.index < historyMeta.length - 1;
  const headingBadge =
    activeHeadingLevel >= 1 && activeHeadingLevel <= 6 ? `H${activeHeadingLevel}` : null;

  return (
    <div
      className={[
        'bb-md-editor-wrap',
        fillHeight ? 'bb-md-editor-wrap--fill' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {(label || headerActions) && (
        <div className="bb-md-editor-head">
          <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            {label && <span className="bb-md-editor-label">{label}</span>}
            <span className="bb-md-editor-counter">
              {strValue.length.toLocaleString()} chars • ~{approxTokens.toLocaleString()} tok
            </span>
          </div>
          {headerActions && <div style={{ display: 'inline-flex', gap: 5 }}>{headerActions}</div>}
        </div>
      )}

      <div className="bb-md-editor-shell">
        <div className="bb-md-toolbar" onMouseDown={preventFocusLoss}>
          <div className="bb-md-toolbar-group">
              <ToolBtn
                className="bb-md-tool-btn"
                tip="Undo · Ctrl+Z"
                isMobile={isMobile}
                disabled={!canUndo}
                onClick={handleUndo}
              >
                <Icon name="undo" size={14} />
              </ToolBtn>
              <ToolBtn
                className="bb-md-tool-btn"
                tip="Redo · Ctrl+Y"
                isMobile={isMobile}
                disabled={!canRedo}
                onClick={handleRedo}
              >
                <Icon name="redo" size={14} />
              </ToolBtn>
            </div>

            <span className="bb-md-toolbar-sep" />

            <div className="bb-md-toolbar-group">
              <Tooltip
                content="Headings (H1 / H2 / H3)"
                disabled={isMobile || headingOpen}
                delayMs={180}
              >
                <button
                  ref={headingBtnRef}
                  type="button"
                  aria-label="Headings"
                  aria-haspopup="menu"
                  aria-expanded={headingOpen}
                  className={[
                    'bb-md-tool-btn',
                    'bb-md-tool-heading-trigger',
                    headingOpen ? 'is-active' : '',
                    headingBadge ? 'has-heading' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    captureSelection();
                    setEmojiOpen(false);
                    setHeadingOpen((prev) => !prev);
                  }}
                >
                  {headingBadge ? <span>{headingBadge}</span> : <Icon name="heading" size={14} />}
                  <Icon name="chevronDown" size={12} />
                </button>
              </Tooltip>

              <ToolBtn
                className="bb-md-tool-btn"
                tip="Bold (**text**) · Ctrl+B"
                isMobile={isMobile}
                onClick={() => handleToggleWrap('**', '**', 'bold')}
              >
                <Icon name="bold" size={14} />
              </ToolBtn>
              <ToolBtn
                className="bb-md-tool-btn"
                tip="Italic (*text*) · Ctrl+I"
                isMobile={isMobile}
                onClick={() => handleToggleWrap('*', '*', 'italic')}
              >
                <Icon name="italic" size={14} />
              </ToolBtn>
              <ToolBtn
                className="bb-md-tool-btn"
                tip="Underline (__text__) · Ctrl+U"
                isMobile={isMobile}
                onClick={() => handleToggleWrap('__', '__', 'underline')}
              >
                <Icon name="underline" size={14} />
              </ToolBtn>
              <ToolBtn
                className="bb-md-tool-btn"
                tip="Strikethrough (~~text~~) · Ctrl+Shift+`"
                isMobile={isMobile}
                onClick={() => handleToggleWrap('~~', '~~', 'strike')}
              >
                <Icon name="strikethrough" size={14} />
              </ToolBtn>
              <ToolBtn
                className="bb-md-tool-btn"
                tip="Inline Code (`code`) · Ctrl+K"
                isMobile={isMobile}
                onClick={() => handleToggleWrap('`', '`', 'code')}
              >
                <Icon name="code" size={14} />
              </ToolBtn>
              <ToolBtn
                className="bb-md-tool-btn"
                tip="Code Block (```)"
                isMobile={isMobile}
                onClick={() => runTransform(insertCodeBlock)}
              >
                <Icon name="fileCode" size={14} />
              </ToolBtn>
            </div>
            <span className="bb-md-toolbar-sep" />

            <div className="bb-md-toolbar-group">
              <ToolBtn
                className="bb-md-tool-btn"
                tip="Bullet List (- item)"
                isMobile={isMobile}
                onClick={() => handleToggleBlock('ul', '- ')}
              >
                <Icon name="listUl" size={14} />
              </ToolBtn>
              <ToolBtn
                className="bb-md-tool-btn"
                tip="Numbered List (1. item)"
                isMobile={isMobile}
                onClick={() => handleToggleBlock('ol', '1. ')}
              >
                <Icon name="listOl" size={14} />
              </ToolBtn>
              <ToolBtn
                className="bb-md-tool-btn"
                tip="Blockquote (> quote)"
                isMobile={isMobile}
                onClick={() => handleToggleBlock('blockquote', '> ')}
              >
                <Icon name="blockquote" size={14} />
              </ToolBtn>
              <ToolBtn
                className="bb-md-tool-btn"
                tip="Horizontal Rule (---)"
                isMobile={isMobile}
                onClick={() => runTransform(insertHorizontalRule)}
              >
                <Icon name="horizontalRule" size={14} />
              </ToolBtn>
              <ToolBtn
                className="bb-md-tool-btn"
                tip={'Insert Image (<img src="...">)'}
                isMobile={isMobile}
                onClick={() => runTransform(insertImageTag)}
              >
                <Icon name="image" size={14} />
              </ToolBtn>
              <Tooltip content="Insert Emoji" disabled={isMobile || emojiOpen} delayMs={180}>
                <button
                  ref={emojiBtnRef}
                  type="button"
                  aria-label="Insert emoji"
                  className={`bb-md-tool-btn ${emojiOpen ? 'is-active' : ''}`.trim()}
                  onClick={handleToggleEmoji}
                >
                  <Icon name={isMobile && emojiOpen ? 'keyboard' : 'smile'} size={15} />
                </button>
              </Tooltip>
            </div>

            <span className="bb-md-toolbar-sep" />

            <div className="bb-md-toolbar-group">
              <ToolBtn
                className="bb-md-tool-btn bb-md-tool-pill"
                tip="Insert {{char}} macro"
                isMobile={isMobile}
                onClick={() => insertSnippet('{{char}}')}
              >
                {'{{char}}'}
              </ToolBtn>
              <ToolBtn
                className="bb-md-tool-btn bb-md-tool-pill"
                tip="Insert {{user}} macro"
                isMobile={isMobile}
                onClick={() => insertSnippet('{{user}}')}
              >
                {'{{user}}'}
              </ToolBtn>
            </div>

          <div className="bb-md-toolbar-right">
            <button
              type="button"
              className={`bb-md-livemd-toggle ${liveMd ? 'is-active' : ''}`}
              title={
                liveMd
                  ? 'LiveMD is ON (live syntax highlighting while typing) — click for plain textarea'
                  : 'LiveMD is OFF (plain textarea) — click to enable live Markdown highlighting'
              }
              onClick={() => {
                lastRenderedValueRef.current = null;
                setLiveMd((v) => !v);
              }}
            >
              <span className="bb-md-livemd-dot" aria-hidden="true" />
              <span>LiveMD</span>
            </button>
          </div>
        </div>

        <div className="bb-md-editor-stage">
          {liveMd ? (
            <div
              ref={richRef}
              contentEditable
              suppressContentEditableWarning
              spellCheck
              role="textbox"
              aria-multiline="true"
              data-placeholder={placeholder}
              className={`bb-md-rich-editor bb-md-editor__surface bb-scrollbar--hidden ${
                strValue.length === 0 ? 'is-empty' : ''
              }`.trim()}
              onBeforeInput={handleRichBeforeInput}
              onInput={handleRichInput}
              onKeyUp={captureSelection}
              onMouseUp={captureSelection}
              onKeyDown={(e) => handleSharedKeyDown(e, true)}
              onPaste={handleRichPaste}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
                handleRichInput();
              }}
              onLoadCapture={(e) => {
                if (e.target?.classList?.contains('bb-md-img-preview') && e.target.parentElement) {
                  e.target.parentElement.style.display = '';
                }
              }}
              onErrorCapture={(e) => {
                if (e.target?.classList?.contains('bb-md-img-preview') && e.target.parentElement) {
                  e.target.parentElement.style.display = 'none';
                }
              }}
            />
          ) : (
            <textarea
              ref={textareaRef}
              value={strValue}
              onChange={(e) => {
                const nextVal = e.target.value;
                const sel = {
                  start: e.target.selectionStart ?? nextVal.length,
                  end: e.target.selectionEnd ?? nextVal.length,
                };
                savedSelectionRef.current = sel;
                lastCommittedTextRef.current = nextVal;
                recordHistorySnapshot(nextVal, sel.start, sel.end, 'typing');
                setActiveHeadingLevel(detectActiveHeadingLevel(nextVal, sel.start));
                onChange?.(nextVal);
              }}
              onKeyDown={(e) => handleSharedKeyDown(e, false)}
              onSelect={captureSelection}
              onKeyUp={captureSelection}
              onMouseUp={captureSelection}
              placeholder={placeholder}
              className="bb-md-textarea bb-md-editor__surface bb-scrollbar--hidden"
            />
          )}
          <ScrollIndicator
            key={liveMd ? 'rich' : 'plain'}
            scrollRef={liveMd ? richRef : textareaRef}
            variant="compact"
            watchValue={strValue}
            className={
              !liveMd && !fillHeight ? 'bb-md-editor__textarea-scroll' : ''
            }
          />
        </div>
      </div>

      {headingOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={headingMenuRef}
            role="menu"
            aria-label="Heading level"
            className="bb-md-heading-popover"
            style={{
              top: `${headingCoords.top}px`,
              left: `${headingCoords.left}px`,
              visibility: headingCoords.ready ? 'visible' : 'hidden',
            }}
            onMouseDown={preventFocusLoss}
          >
            {HEADING_OPTIONS.map((opt) => {
              const isSelected = activeHeadingLevel === opt.level;
              return (
                <button
                  key={opt.level}
                  type="button"
                  role="menuitem"
                  className={`bb-md-heading-popover__item ${isSelected ? 'is-selected' : ''}`.trim()}
                  onClick={() => {
                    setHeadingOpen(false);
                    handleToggleBlock('heading', opt.prefix);
                  }}
                >
                  <span className="bb-md-heading-popover__left">
                    <span className="bb-md-heading-popover__badge">{opt.badge}</span>
                    <span
                      className={`bb-md-heading-popover__title bb-md-heading-popover__title--h${opt.level}`}
                    >
                      {opt.label}
                    </span>
                  </span>
                  {isSelected ? (
                    <Icon name="check" size={14} />
                  ) : (
                    <span className="bb-md-heading-popover__syntax">{opt.syntax.trim()}</span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}

      <EmojiPicker
        open={emojiOpen}
        onOpenChange={setEmojiOpen}
        anchorRef={emojiBtnRef}
        placement="auto"
        onRequestKeyboard={focusEditorAtSavedSelection}
        onSelect={(emoji) => {
          const searchActive =
            document.activeElement &&
            document.activeElement.classList?.contains('bb-emoji-picker__search-input');
          insertSnippet(emoji, { keepBlurred: isMobile || Boolean(searchActive) });
        }}
      />
    </div>
  );
}

