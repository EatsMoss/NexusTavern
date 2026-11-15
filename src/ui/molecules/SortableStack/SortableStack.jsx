import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './SortableStack.css';

const DRAG_THRESHOLD_PX = 6;
const AUTO_SCROLL_EDGE_PX = 52;
const AUTO_SCROLL_MAX_STEP_PX = 12;

function findNearestScrollParent(el) {
  let cur = el?.parentElement || null;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const style = window.getComputedStyle(cur);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight + 2) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

function measureStackSlots(containerEl) {
  if (!containerEl) return null;
  const containerRect = containerEl.getBoundingClientRect();
  const slotEls = Array.from(containerEl.querySelectorAll(':scope > [data-bb-sortable-slot]'));
  const rects = slotEls.map((el) => {
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
      cy: r.top + r.height / 2,
    };
  });

  let gap = 8;
  if (rects.length >= 2) {
    gap = Math.max(0, rects[1].top - rects[0].bottom);
  }

  return { containerRect, rects, gap };
}

function hitTestVerticalStack(clientY, metrics, sourceIndex) {
  if (!metrics || !metrics.rects || metrics.rects.length === 0) return sourceIndex;
  const { rects, gap } = metrics;
  const srcRect = rects[sourceIndex];
  if (!srcRect) return sourceIndex;

  // Build hypothetical slot centers if dragged card sits at each candidate targetIndex
  // Using midpoints of remaining items guarantees zero oscillation on variable-height cards.
  const otherIndices = [];
  for (let i = 0; i < rects.length; i += 1) {
    if (i !== sourceIndex) otherIndices.push(i);
  }

  let cursorTop = rects[0].top;
  let targetSlot = otherIndices.length;

  for (let pos = 0; pos < otherIndices.length; pos += 1) {
    const itemRect = rects[otherIndices[pos]];
    const midpoint = cursorTop + itemRect.height / 2;
    if (clientY < midpoint) {
      targetSlot = pos;
      break;
    }
    cursorTop += itemRect.height + gap;
  }

  return targetSlot;
}

function computeStackDisplacement(index, sourceIndex, targetIndex, metrics) {
  if (
    !metrics ||
    typeof sourceIndex !== 'number' ||
    typeof targetIndex !== 'number' ||
    index === sourceIndex
  ) {
    return undefined;
  }
  const srcRect = metrics.rects[sourceIndex];
  if (!srcRect) return undefined;
  const pitch = srcRect.height + (metrics.gap ?? 8);

  if (sourceIndex < targetIndex && index > sourceIndex && index <= targetIndex) {
    return { transform: `translate3d(0, ${-Math.round(pitch)}px, 0)` };
  }
  if (sourceIndex > targetIndex && index >= targetIndex && index < sourceIndex) {
    return { transform: `translate3d(0, ${Math.round(pitch)}px, 0)` };
  }
  return undefined;
}

function computeDropSlotRect(sourceIndex, targetIndex, metrics) {
  if (!metrics || !metrics.rects?.[sourceIndex]) return null;
  const { rects, gap, containerRect } = metrics;
  const srcHeight = rects[sourceIndex].height;

  let topPx = rects[0].top - containerRect.top;
  let slotCursor = 0;
  for (let i = 0; i < rects.length; i += 1) {
    if (i === sourceIndex) continue;
    if (slotCursor === targetIndex) break;
    topPx += rects[i].height + gap;
    slotCursor += 1;
  }

  return {
    top: Math.round(topPx),
    height: Math.round(srcHeight),
  };
}

export function SortableStack({
  items = [],
  getKey,
  renderItem,
  onReorder,
  disabled = false,
  ignoreDragSelector = 'input, textarea, select, [data-no-drag], .bb-m3-btn, .bb-kebab-menu, .bb-inline-title, .bb-intro-card__portrait-btn',
  className = '',
}) {
  const containerRef = useRef(null);
  const [dragState, setDragState] = useState(null);
  const [settling, setSettling] = useState(false);

  const handleSlotPointerDown = useCallback(
    (e, index) => {
      if (disabled || items.length <= 1) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (ignoreDragSelector && e.target.closest(ignoreDragSelector)) return;

      const slotEl = e.currentTarget;
      const slotRect = slotEl.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const offsetX = startX - slotRect.left;
      const offsetY = startY - slotRect.top;

      let active = false;
      let metrics = null;
      let latestTargetIdx = index;
      let latestClientX = startX;
      let latestClientY = startY;
      let scrollParent = null;
      let rafId = null;

      const updateGhostAndHover = () => {
        if (!active || !metrics) return;
        latestTargetIdx = hitTestVerticalStack(latestClientY, metrics, index);
        setDragState({
          active: true,
          sourceIndex: index,
          targetIndex: latestTargetIdx,
          metrics,
          ghost: {
            x: latestClientX - offsetX,
            y: latestClientY - offsetY,
            width: slotRect.width,
            height: slotRect.height,
          },
        });
      };

      const runAutoScrollLoop = () => {
        if (!active || !scrollParent) {
          rafId = null;
          return;
        }
        const spRect = scrollParent.getBoundingClientRect();
        let delta = 0;
        if (latestClientY < spRect.top + AUTO_SCROLL_EDGE_PX) {
          const ratio =
            (spRect.top + AUTO_SCROLL_EDGE_PX - latestClientY) / AUTO_SCROLL_EDGE_PX;
          delta = -Math.ceil(Math.min(1, ratio) * AUTO_SCROLL_MAX_STEP_PX);
        } else if (latestClientY > spRect.bottom - AUTO_SCROLL_EDGE_PX) {
          const ratio =
            (latestClientY - (spRect.bottom - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX;
          delta = Math.ceil(Math.min(1, ratio) * AUTO_SCROLL_MAX_STEP_PX);
        }

        if (delta !== 0) {
          const prevScroll = scrollParent.scrollTop;
          scrollParent.scrollTop += delta;
          const actualDelta = scrollParent.scrollTop - prevScroll;
          if (actualDelta !== 0 && metrics) {
            metrics = {
              ...metrics,
              containerRect: {
                ...metrics.containerRect,
                top: metrics.containerRect.top - actualDelta,
                bottom: metrics.containerRect.bottom - actualDelta,
              },
              rects: metrics.rects.map((r) => ({
                ...r,
                top: r.top - actualDelta,
                bottom: r.bottom - actualDelta,
                cy: r.cy - actualDelta,
              })),
            };
            updateGhostAndHover();
          }
        }
        rafId = requestAnimationFrame(runAutoScrollLoop);
      };

      const cleanup = () => {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
        window.removeEventListener('keydown', onKeyDown, true);
        document.body.classList.remove('bb-char-dragging');
      };

      const swallowNextClick = () => {
        const blocker = (clickEv) => {
          clickEv.preventDefault();
          clickEv.stopPropagation();
          window.removeEventListener('click', blocker, true);
        };
        window.addEventListener('click', blocker, true);
        setTimeout(() => window.removeEventListener('click', blocker, true), 80);
      };
      const onPointerMove = (ev) => {
        latestClientX = ev.clientX;
        latestClientY = ev.clientY;

        if (!active) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) {
            return;
          }
          active = true;
          document.body.classList.add('bb-char-dragging');
          metrics = measureStackSlots(containerRef.current);
          scrollParent = findNearestScrollParent(containerRef.current);
          if (scrollParent && !rafId) {
            rafId = requestAnimationFrame(runAutoScrollLoop);
          }
        }

        ev.preventDefault();
        updateGhostAndHover();
      };

      const onPointerUp = () => {
        cleanup();
        if (active) {
          swallowNextClick();
          const finalTarget = latestTargetIdx;
          if (finalTarget !== index) {
            setSettling(true);
            setDragState(null);
            onReorder?.(index, finalTarget);
            requestAnimationFrame(() => {
              requestAnimationFrame(() => setSettling(false));
            });
            return;
          }
        }
        setDragState(null);
      };

      const onPointerCancel = () => {
        cleanup();
        setDragState(null);
      };

      const onKeyDown = (ev) => {
        if (ev.key === 'Escape' && active) {
          ev.preventDefault();
          ev.stopPropagation();
          cleanup();
          setDragState(null);
        }
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
      window.addEventListener('keydown', onKeyDown, true);
    },
    [disabled, items.length, ignoreDragSelector, onReorder],
  );

  const dropSlotBox =
    dragState?.active && dragState.metrics
      ? computeDropSlotRect(dragState.sourceIndex, dragState.targetIndex, dragState.metrics)
      : null;

  const canDrag = !disabled && items.length > 1;

  return (
    <div
      ref={containerRef}
      className={[
        'bb-sortable-stack',
        settling ? 'is-settling' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {dropSlotBox && (
        <div
          className="bb-sortable-stack__drop-slot"
          style={{
            top: `${dropSlotBox.top}px`,
            height: `${dropSlotBox.height}px`,
          }}
        />
      )}

      {items.map((item, idx) => {
        const key = getKey ? getKey(item, idx) : idx;
        const isSource = Boolean(dragState?.active && dragState.sourceIndex === idx);
        const displacement = dragState?.active
          ? computeStackDisplacement(
              idx,
              dragState.sourceIndex,
              dragState.targetIndex,
              dragState.metrics,
            )
          : undefined;

        return (
          <div
            key={key}
            data-bb-sortable-slot={idx}
            style={displacement}
            className={[
              'bb-sortable-stack__slot',
              canDrag ? 'is-draggable' : '',
              isSource ? 'is-dragging-source' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onPointerDown={(e) => handleSlotPointerDown(e, idx)}
          >
            {renderItem(item, idx, { isDraggingSource: isSource, isGhost: false })}
          </div>
        );
      })}

      {dragState?.active &&
        dragState.ghost &&
        items[dragState.sourceIndex] !== undefined &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="bb-sortable-drag-ghost"
            style={{
              left: `${Math.round(dragState.ghost.x)}px`,
              top: `${Math.round(dragState.ghost.y)}px`,
              width: `${Math.round(dragState.ghost.width)}px`,
              height: `${Math.round(dragState.ghost.height)}px`,
            }}
          >
            {renderItem(items[dragState.sourceIndex], dragState.sourceIndex, {
              isDraggingSource: false,
              isGhost: true,
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}


