import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';

/**
 * Pure row-window geometry calculator for virtualized CSS grids and vertical lists.
 *
 * Guarantees exact total scroll height invariance across any `(startRow, endRow)` slice:
 * `topSpacerPx + renderedHeight + bottomSpacerPx === fullUnvirtualizedHeight`.
 */
export function computeVirtualRowWindow({
  totalItems = 0,
  cols = 1,
  rowHeight = 120,
  rowGap = 8,
  scrollTop = 0,
  viewportHeight = 640,
  contentOffsetTop = 0,
  overscanRows = 2,
}) {
  const count = Math.max(0, Number(totalItems) || 0);
  if (count === 0) {
    return {
      totalRows: 0,
      startRow: 0,
      endRow: -1,
      startIndex: 0,
      endIndex: 0,
      topSpacerPx: 0,
      bottomSpacerPx: 0,
    };
  }

  const safeCols = Math.max(1, Math.floor(Number(cols) || 1));
  const safeRowH = Math.max(16, Number(rowHeight) || 120);
  const safeGap = Math.max(0, Number(rowGap) || 0);
  const parsedOverscan = Number(overscanRows);
  const safeOverscan = Math.max(0, Number.isFinite(parsedOverscan) ? Math.floor(parsedOverscan) : 2);

  const totalRows = Math.ceil(count / safeCols);
  const stride = safeRowH + safeGap;
  const effectiveScrollTop = Math.max(
    0,
    (Number(scrollTop) || 0) - (Number(contentOffsetTop) || 0),
  );
  const safeViewportH = viewportHeight > 0 ? viewportHeight : 640;

  const firstVisibleRow = Math.floor(effectiveScrollTop / stride);
  const lastVisibleRow = Math.floor(
    Math.max(0, effectiveScrollTop + safeViewportH - 1) / stride,
  );

  const startRow = Math.max(0, Math.min(totalRows - 1, firstVisibleRow - safeOverscan));
  const endRow = Math.max(startRow, Math.min(totalRows - 1, lastVisibleRow + safeOverscan));

  const startIndex = startRow * safeCols;
  const endIndex = Math.min(count, (endRow + 1) * safeCols);

  const topSpacerPx = startRow * stride;
  const remainingRows = Math.max(0, totalRows - 1 - endRow);
  const bottomSpacerPx = remainingRows * stride;

  return {
    totalRows,
    startRow,
    endRow,
    startIndex,
    endIndex,
    topSpacerPx,
    bottomSpacerPx,
  };
}

function estimateDefaultRowHeight({
  cols,
  isList,
  aspect,
  colGap,
  horizontalPadding,
  clientWidth,
}) {
  if (isList) return 78;
  const safeCols = Math.max(1, Math.floor(Number(cols) || 1));
  const width = Math.max(140, (clientWidth > 0 ? clientWidth : 460) - horizontalPadding);
  const colW = Math.max(24, (width - (safeCols - 1) * colGap) / safeCols);
  return aspect === 'square' ? colW : colW * 1.5;
}

/**
 * Reusable rAF-coalesced row windowing hook for large grids & lists (800+ cards).
 * Only triggers a React state update when `(startRow, endRow)` or row geometry changes.
 */
export function useVirtualWindow({
  scrollRef,
  totalItems = 0,
  cols = 1,
  isList = false,
  aspect = 'portrait',
  rowGap = 8,
  colGap = 8,
  horizontalPadding = 0,
  basePaddingTop = 0,
  basePaddingBottom = 0,
  overscanRows = 2,
  enabled = true,
  sampleSelector = '',
  resetKey = '',
}) {
  const safeCols = isList ? 1 : Math.max(1, Math.floor(Number(cols) || 1));

  const [metrics, setMetrics] = useState(() => ({
    scrollTop: 0,
    viewportHeight: 640,
    rowHeight: estimateDefaultRowHeight({
      cols: safeCols,
      isList,
      aspect,
      colGap,
      horizontalPadding,
      clientWidth: 0,
    }),
  }));

  const rafRef = useRef(0);
  const prevResetKeyRef = useRef(resetKey);

  const readAndCommit = useCallback(() => {
    rafRef.current = 0;
    if (!enabled) return;
    const el = scrollRef?.current;
    if (!el) return;

    const scrollTop = el.scrollTop || 0;
    const viewportHeight = el.clientHeight > 0 ? el.clientHeight : 640;
    const clientWidth = el.clientWidth || 0;

    let nextRowHeight = estimateDefaultRowHeight({
      cols: safeCols,
      isList,
      aspect,
      colGap,
      horizontalPadding,
      clientWidth,
    });

    if (isList && sampleSelector) {
      const sampleEl = el.querySelector(sampleSelector);
      if (sampleEl && sampleEl.offsetHeight > 24) {
        nextRowHeight = sampleEl.offsetHeight;
      }
    }

    setMetrics((prev) => {
      const prevWin = computeVirtualRowWindow({
        totalItems,
        cols: safeCols,
        rowHeight: prev.rowHeight,
        rowGap,
        scrollTop: prev.scrollTop,
        viewportHeight: prev.viewportHeight,
        contentOffsetTop: basePaddingTop,
        overscanRows,
      });

      const nextWin = computeVirtualRowWindow({
        totalItems,
        cols: safeCols,
        rowHeight: nextRowHeight,
        rowGap,
        scrollTop,
        viewportHeight,
        contentOffsetTop: basePaddingTop,
        overscanRows,
      });

      const rowHeightChanged = Math.abs(prev.rowHeight - nextRowHeight) > 0.5;
      const windowChanged =
        prevWin.startRow !== nextWin.startRow ||
        prevWin.endRow !== nextWin.endRow ||
        prevWin.totalRows !== nextWin.totalRows;

      if (!windowChanged && !rowHeightChanged) {
        return prev;
      }

      return {
        scrollTop,
        viewportHeight,
        rowHeight: nextRowHeight,
      };
    });
  }, [
    enabled,
    scrollRef,
    safeCols,
    isList,
    aspect,
    colGap,
    horizontalPadding,
    sampleSelector,
    totalItems,
    rowGap,
    basePaddingTop,
    overscanRows,
  ]);

  const scheduleMeasure = useCallback(() => {
    if (!enabled) return;
    if (!rafRef.current) {
      rafRef.current = window.requestAnimationFrame(readAndCommit);
    }
  }, [enabled, readAndCommit]);

  useLayoutEffect(() => {
    if (prevResetKeyRef.current !== resetKey) {
      prevResetKeyRef.current = resetKey;
      const el = scrollRef?.current;
      if (el && el.scrollTop > 0) {
        el.scrollTop = 0;
      }
      setMetrics((prev) => (prev.scrollTop === 0 ? prev : { ...prev, scrollTop: 0 }));
    }
  }, [resetKey, scrollRef]);

  useEffect(() => {
    if (!enabled) return undefined;
    scheduleMeasure();
    return undefined;
  }, [enabled, totalItems, safeCols, isList, aspect, scheduleMeasure]);

  useEffect(() => {
    if (!enabled) return undefined;
    const el = scrollRef?.current;
    if (!el) return undefined;

    readAndCommit();

    const onScroll = () => {
      scheduleMeasure();
    };

    el.addEventListener('scroll', onScroll, { passive: true });

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            scheduleMeasure();
          })
        : null;
    if (ro) ro.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      if (ro) ro.disconnect();
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [enabled, scrollRef, readAndCommit, scheduleMeasure]);

  return useMemo(() => {
    if (!enabled) {
      return {
        startIndex: 0,
        endIndex: totalItems,
        topPaddingPx: basePaddingTop,
        bottomPaddingPx: basePaddingBottom,
        totalRows: totalItems > 0 ? Math.ceil(totalItems / safeCols) : 0,
        rowHeight: metrics.rowHeight,
      };
    }

    const win = computeVirtualRowWindow({
      totalItems,
      cols: safeCols,
      rowHeight: metrics.rowHeight,
      rowGap,
      scrollTop: metrics.scrollTop,
      viewportHeight: metrics.viewportHeight,
      contentOffsetTop: basePaddingTop,
      overscanRows,
    });

    return {
      startIndex: win.startIndex,
      endIndex: win.endIndex,
      topPaddingPx: Math.round(basePaddingTop + win.topSpacerPx),
      bottomPaddingPx: Math.round(basePaddingBottom + win.bottomSpacerPx),
      totalRows: win.totalRows,
      rowHeight: metrics.rowHeight,
    };
  }, [
    enabled,
    totalItems,
    safeCols,
    metrics.rowHeight,
    metrics.scrollTop,
    metrics.viewportHeight,
    rowGap,
    basePaddingTop,
    basePaddingBottom,
    overscanRows,
  ]);
}

