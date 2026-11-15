import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  SPLIT_DEFAULTS,
  normalizeSplitRatio,
  computeSplitLayout,
  clampPinnedDrag,
} from './splitGeometry.js';

const RATIO_KEY = 'nexustavern_char_split_ratio';

function readStoredSplitRatio(fallbackRatio = SPLIT_DEFAULTS.ratio) {
  const safeFallback = normalizeSplitRatio(fallbackRatio, SPLIT_DEFAULTS.ratio);
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(RATIO_KEY);
      if (raw !== null && raw.trim() !== '') {
        return normalizeSplitRatio(raw, safeFallback);
      }
    } catch {
      // ignore storage errors
    }
  }
  return safeFallback;
}

function persistSplitRatio(ratio) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (ratio === null || ratio === undefined) {
      localStorage.removeItem(RATIO_KEY);
    } else {
      localStorage.setItem(RATIO_KEY, Number(ratio).toFixed(6));
    }
  } catch {
    // Storage may be unavailable; the in-memory ratio still applies.
  }
}

/**
 * Vertical space the gallery spends outside its measured chrome block: the
 * gallery's own top/bottom padding plus the gap between the chrome and the grid.
 * Named so the split maths stay readable instead of carrying a magic number.
 */
const GALLERY_MARGINS_H = 24;

/**
 * NexusTavern — drives the Pinned / All split.
 *
 * Measures the live chrome (pinned header, All chrome, one grid row) so the pure
 * geometry module can apply the "always keep one row visible on both sides"
 * rule. The ratio is persisted across reloads, and the layout is recomputed on
 * container resize and whenever the measured chrome or card row geometry changes.
 */
export function usePinnedSplit({
  rootRef,
  pinnedRef,
  pinnedHeaderRef,
  pinnedGridRef,
  allChromeRef,
  initialRatio = null,
  onRatioChange,
  recomputeKey = '',
}) {
  const resolvedInitialRatio = readStoredSplitRatio(initialRatio);
  const ratioRef = useRef(resolvedInitialRatio);
  const [layout, setLayout] = useState(() =>
    computeSplitLayout({
      ratio: resolvedInitialRatio,
    }),
  );

  const isDraggingRef = useRef(false);
  const onRatioChangeRef = useRef(onRatioChange);
  onRatioChangeRef.current = onRatioChange;

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return null;

    const totalH = root.clientHeight;
    if (!totalH || totalH <= 120) return null;

    const header = pinnedHeaderRef.current;
    const grid = pinnedGridRef.current;

    // Measure a REAL grid row instead of a synthetic probe: the first tile's
    // height plus the grid's own row gap. Fall back only when there is no tile
    // to measure yet (empty Pinned section).
    let oneRowH = SPLIT_DEFAULTS.oneRowH;
    if (grid) {
      const tile = grid.querySelector('.bb-char-tile, .bb-pinned-folder');
      if (tile && tile.offsetHeight > 30) {
        const gap = Number.parseFloat(getComputedStyle(grid).rowGap) || 8;
        oneRowH = tile.offsetHeight + gap;
      }
    }

    return {
      totalH,
      pinnedHeaderH: header ? header.offsetHeight + 8 : SPLIT_DEFAULTS.pinnedHeaderH,
      // The All section's chrome is measured from the gallery itself, so it
      // covers the search row, chips, toolbar and count line - not just a title.
      allChromeH: allChromeRef.current
        ? allChromeRef.current.offsetHeight + GALLERY_MARGINS_H
        : SPLIT_DEFAULTS.allChromeH,
      splitterH: 12,
      oneRowH,
      ratio: ratioRef.current,
      extraPinnedH: 0,
    };
  }, [rootRef, pinnedHeaderRef, pinnedGridRef, allChromeRef]);

  const apply = useCallback(() => {
    const metrics = measure();
    if (!metrics) return;
    setLayout(computeSplitLayout(metrics));
  }, [measure]);

  // Hydrate from server session ratio if localStorage had no local entry yet.
  useEffect(() => {
    if (initialRatio === null || initialRatio === undefined || isDraggingRef.current) return;
    let hasLocal = false;
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(RATIO_KEY);
        hasLocal = raw !== null && raw.trim() !== '';
      } catch {
        hasLocal = false;
      }
    }
    if (!hasLocal) {
      const normalized = normalizeSplitRatio(initialRatio, SPLIT_DEFAULTS.ratio);
      ratioRef.current = normalized;
      persistSplitRatio(normalized);
      apply();
    }
  }, [initialRatio, apply]);

  // Recompute on mount and whenever card density, aspect, or pinned entries change.
  useLayoutEffect(() => {
    apply();
  }, [apply, recomputeKey]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return undefined;

    let raf = null;
    const observer = new ResizeObserver(() => {
      if (isDraggingRef.current) return;
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        apply();
      });
    });
    observer.observe(root);
    if (pinnedHeaderRef.current) observer.observe(pinnedHeaderRef.current);
    if (allChromeRef.current) observer.observe(allChromeRef.current);
    const firstTile = pinnedGridRef.current?.querySelector('.bb-char-tile, .bb-pinned-folder');
    if (firstTile) observer.observe(firstTile);

    return () => {
      observer.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [rootRef, pinnedHeaderRef, pinnedGridRef, allChromeRef, apply, recomputeKey]);

  const handleSplitterPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const metrics = measure();
      if (!metrics) return;

      const startY = e.clientY;
      const startPinnedH = pinnedRef.current?.offsetHeight || layout.pinnedH;
      const { minPinnedH, maxPinnedH, availableH } = computeSplitLayout(metrics);

      isDraggingRef.current = true;
      document.body.classList.add('bb-char-resizing');

      const onMove = (ev) => {
        ev.preventDefault();
        const next = clampPinnedDrag({
          startPinnedH,
          dy: ev.clientY - startY,
          minPinnedH,
          maxPinnedH,
          availableH,
        });
        ratioRef.current = next.ratio;
        setLayout((prev) => ({ ...prev, pinnedH: next.pinnedH, minPinnedH, maxPinnedH, availableH }));
      };

      const finishDrag = () => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        document.body.classList.remove('bb-char-resizing');
        const saved = Number(ratioRef.current.toFixed(6));
        persistSplitRatio(saved);
        onRatioChangeRef.current?.(saved);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finishDrag);
        window.removeEventListener('pointercancel', finishDrag);
        window.removeEventListener('blur', finishDrag);
      };

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', finishDrag);
      window.addEventListener('pointercancel', finishDrag);
      window.addEventListener('blur', finishDrag);
    },
    [measure, layout.pinnedH, pinnedRef],
  );

  const resetSplit = useCallback(() => {
    ratioRef.current = SPLIT_DEFAULTS.ratio;
    persistSplitRatio(null);
    onRatioChangeRef.current?.(null);
    apply();
  }, [apply]);

  return { layout, isDragging: isDraggingRef, handleSplitterPointerDown, resetSplit, apply };
}
