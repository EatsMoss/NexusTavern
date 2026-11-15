import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './TomeResizeCurtain.css';

function clampWidth(value, minW, maxW) {
  const effectiveMax = Math.max(minW, maxW);
  return Math.max(minW, Math.min(effectiveMax, Math.round(value)));
}

/**
 * TomeResizeCurtain — Inner-edge resize handle for the Left & Right Tomes.
 * Ported 1:1 from BookboundUI (ui/panelResize.js):
 * - Dragging resizes the tome within [minWidth, maxWidth] and shows a floating pixel readout at the cursor.
 * - Single-clicking (without dragging) opens a compact pixel input at the click point (Enter applies, Esc/outside cancels).
 * - Double-clicking resets the tome width to `defaultWidth` (clamped to [minWidth, maxWidth]).
 */
export function TomeResizeCurtain({
  side = 'left',
  width = 550,
  minWidth = 400,
  maxWidth = 900,
  defaultWidth = 550,
  onChangeWidth,
}) {
  const curtainRef = useRef(null);
  const tooltipRef = useRef(null);
  const editorRef = useRef(null);
  const editorInputRef = useRef(null);

  const [dragging, setDragging] = useState(false);
  const [tooltip, setTooltip] = useState(null); // { x, y, widthPx }
  const [editor, setEditor] = useState(null); // { sessionId, x, y, draftValue }
  const editorSessionRef = useRef(0);

  const latestPropsRef = useRef({ width, minWidth, maxWidth, defaultWidth, onChangeWidth });
  latestPropsRef.current = { width, minWidth, maxWidth, defaultWidth, onChangeWidth };

  const closeEditor = useCallback(() => {
    setEditor(null);
  }, []);

  // Position the floating drag tooltip inside viewport bounds
  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) return;
    const el = tooltipRef.current;
    const rect = el.getBoundingClientRect();
    let left = tooltip.x + 14;
    let top = tooltip.y - 32;
    if (left + rect.width > window.innerWidth - 8) {
      left = tooltip.x - rect.width - 14;
    }
    if (left < 8) left = 8;
    if (top < 8) top = tooltip.y + 18;
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }, [tooltip]);

  // Position and focus the single-click width editor inside viewport bounds
  useLayoutEffect(() => {
    if (!editor || !editorRef.current) return;
    const wrap = editorRef.current;
    const rect = wrap.getBoundingClientRect();
    let left = editor.x + 12;
    let top = editor.y - 14;
    if (left + rect.width > window.innerWidth - 8) {
      left = editor.x - rect.width - 12;
    }
    if (left < 8) left = 8;
    if (top + rect.height > window.innerHeight - 8) {
      top = editor.y - rect.height - 12;
    }
    if (top < 8) top = 8;
    wrap.style.left = `${Math.round(left)}px`;
    wrap.style.top = `${Math.round(top)}px`;
  }, [editor?.x, editor?.y]);

  const editorSessionId = editor?.sessionId ?? 0;

  useEffect(() => {
    if (!editorSessionId) return undefined;
    const input = editorInputRef.current;
    if (input) {
      input.focus();
      input.select();
    }

    const handleOutsidePointerDown = (e) => {
      if (editorRef.current && !editorRef.current.contains(e.target)) {
        closeEditor();
      }
    };

    const handleWindowResize = () => {
      closeEditor();
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    window.addEventListener('resize', handleWindowResize);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [editorSessionId, closeEditor]);

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const curtain = curtainRef.current;
    if (!curtain) return;

    try {
      curtain.setPointerCapture(e.pointerId);
    } catch (_err) {
      // pointer capture is best-effort
    }

    const startX = e.clientX;
    const startW = latestPropsRef.current.width;
    let movedDuringDrag = false;

    setDragging(true);
    document.body.classList.add('bb-panel-resize-dragging');

    const onPointerMove = (ev) => {
      const dx = ev.clientX - startX;
      if (!movedDuringDrag && Math.abs(dx) < 2) {
        return;
      }
      if (!movedDuringDrag) {
        movedDuringDrag = true;
        setEditor(null);
      }

      const { minWidth: minW, maxWidth: maxW, onChangeWidth: applyWidth } =
        latestPropsRef.current;
      // Left tome grows when dragged right (+1); right tome grows when dragged left (-1)
      const dir = side === 'left' ? 1 : -1;
      const nextW = clampWidth(startW + dx * dir, minW, maxW);
      if (applyWidth) applyWidth(nextW);
      setTooltip({ x: ev.clientX, y: ev.clientY, widthPx: nextW });
    };

    const onPointerUp = (ev) => {
      curtain.removeEventListener('pointermove', onPointerMove);
      curtain.removeEventListener('pointerup', onPointerUp);
      curtain.removeEventListener('pointercancel', onPointerUp);
      document.body.classList.remove('bb-panel-resize-dragging');
      setDragging(false);

      try {
        curtain.releasePointerCapture(ev.pointerId);
      } catch (_err) {
        // ignore
      }

      if (movedDuringDrag) {
        setTooltip(null);
      } else if (ev.type === 'pointerup') {
        const currentW = Math.round(latestPropsRef.current.width);
        editorSessionRef.current += 1;
        setEditor({
          sessionId: editorSessionRef.current,
          x: ev.clientX,
          y: ev.clientY,
          draftValue: String(currentW),
        });
      }
      movedDuringDrag = false;
    };

    curtain.addEventListener('pointermove', onPointerMove);
    curtain.addEventListener('pointerup', onPointerUp);
    curtain.addEventListener('pointercancel', onPointerUp);
  };

  const handleDoubleClick = (e) => {
    e.preventDefault();
    setEditor(null);
    setTooltip(null);
    const { minWidth: minW, defaultWidth: defW, onChangeWidth: applyWidth } =
      latestPropsRef.current;
    if (applyWidth) {
      applyWidth(Math.max(minW, Math.round(defW)));
    }
  };

  const handleEditorKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      const { width: currentW, minWidth: minW, maxWidth: maxW, onChangeWidth: applyWidth } =
        latestPropsRef.current;
      const parsed = Number(editor?.draftValue);
      const raw = Number.isFinite(parsed) && parsed > 0 ? parsed : currentW;
      const nextW = clampWidth(raw, minW, maxW);
      if (applyWidth) applyWidth(nextW);
      closeEditor();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeEditor();
    }
  };

  const curtainPositionClass =
    side === 'left' ? 'bb-tome-curtain--right' : 'bb-tome-curtain--left';

  const titleText =
    side === 'left'
      ? 'Drag to resize Left Tome • Click to enter width in px • Double-click to reset (550px)'
      : 'Drag to resize Right Tome • Click to enter width in px • Double-click to reset (550px)';

  return (
    <>
      <div
        ref={curtainRef}
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(width)}
        aria-valuemin={minWidth}
        aria-valuemax={Math.max(minWidth, maxWidth)}
        className={`bb-tome-curtain ${curtainPositionClass} ${dragging ? 'is-active' : ''}`.trim()}
        title={titleText}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
      />

      {tooltip &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tooltipRef}
            className="bb-panel-resize-tooltip"
            aria-hidden="true"
            style={{ left: tooltip.x + 14, top: tooltip.y - 32 }}
          >
            {Math.round(tooltip.widthPx)} px
          </div>,
          document.body,
        )}

      {editor &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={editorRef}
            className="bb-panel-resize-editor"
            style={{ left: editor.x + 12, top: editor.y - 14 }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              ref={editorInputRef}
              type="number"
              className="bb-panel-resize-editor-input"
              min={minWidth}
              max={Math.max(minWidth, maxWidth)}
              step={1}
              inputMode="numeric"
              aria-label="Tome width in pixels"
              value={editor.draftValue}
              onChange={(e) =>
                setEditor((prev) => (prev ? { ...prev, draftValue: e.target.value } : null))
              }
              onKeyDown={handleEditorKeyDown}
            />
            <span className="bb-panel-resize-editor-unit">px</span>
          </div>,
          document.body,
        )}
    </>
  );
}
