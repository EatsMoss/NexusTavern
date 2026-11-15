/**
 * NexusTavern — split geometry for the stacked Pinned / All sections.
 *
 * Kept pure and DOM-free so the clamping rules can be asserted in tests instead
 * of being discovered by dragging. The reference extension computed the same
 * values inline against live elements, which made the constraint impossible to
 * verify without a browser.
 *
 * The invariant: each section always reserves its own chrome plus ONE full row.
 * Therefore, when one side is dragged fully open, the other still shows a whole
 * row of cards rather than collapsing to an unusable sliver.
 */

/** Default assume of chrome heights when the DOM has not been measured yet. */
export const SPLIT_DEFAULTS = {
  pinnedHeaderH: 30,
  allChromeH: 84,
  splitterH: 12,
  oneRowH: 150,
  totalH: 600,
  ratio: 0.36,
};

/**
 * Normalizes a persisted ratio, falling back to the default when it is missing
 * or sits outside the valid [0, 1] unit interval. `computeSplitLayout` clamps
 * pixel heights against live `minPinnedH` / `maxPinnedH` bounds, so extreme
 * ratios near 0 or 1 safely pin the splitter to the top or bottom row limit.
 */
export function normalizeSplitRatio(value, fallback = SPLIT_DEFAULTS.ratio) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const num = Number.parseFloat(value);
  if (!Number.isFinite(num) || num < 0 || num > 1) return fallback;
  return num;
}

/**
 * Computes the pinned section height plus the min/max bounds for both sections.
 *
 * @param {object} metrics measured or assumed pixel heights
 * @returns {{pinnedH:number, minPinnedH:number, maxPinnedH:number, minAllH:number, availableH:number}}
 */
export function computeSplitLayout({
  totalH = SPLIT_DEFAULTS.totalH,
  pinnedHeaderH = SPLIT_DEFAULTS.pinnedHeaderH,
  allChromeH = SPLIT_DEFAULTS.allChromeH,
  splitterH = SPLIT_DEFAULTS.splitterH,
  oneRowH = SPLIT_DEFAULTS.oneRowH,
  ratio = SPLIT_DEFAULTS.ratio,
  extraPinnedH = 0,
} = {}) {
  // Each side reserves its chrome plus one row, so neither can be starved.
  const minPinnedH = pinnedHeaderH + extraPinnedH + oneRowH;
  const minAllH = allChromeH + oneRowH;

  // Never hand out less vertical space than the two minimums require.
  const availableH = Math.max(minPinnedH + minAllH, totalH - splitterH);
  // Fully-open Pinned still leaves exactly minAllH for the All section.
  const maxPinnedH = Math.max(minPinnedH, availableH - minAllH);

  const target = Math.round(Math.max(minPinnedH, Math.min(maxPinnedH, availableH * ratio)));

  return { pinnedH: target, minPinnedH, maxPinnedH, minAllH, availableH };
}

/**
 * Clamps a drag to the valid band and returns the new pinned height plus the
 * ratio to persist. `dy` is the pointer delta since the drag started.
 */
export function clampPinnedDrag({
  startPinnedH = SPLIT_DEFAULTS.totalH * SPLIT_DEFAULTS.ratio,
  dy = 0,
  minPinnedH = SPLIT_DEFAULTS.pinnedHeaderH + SPLIT_DEFAULTS.oneRowH,
  maxPinnedH = SPLIT_DEFAULTS.totalH,
  availableH = SPLIT_DEFAULTS.totalH,
} = {}) {
  const pinnedH = Math.max(minPinnedH, Math.min(maxPinnedH, startPinnedH + dy));
  const ratio = pinnedH / Math.max(1, availableH);
  return { pinnedH, ratio };
}
