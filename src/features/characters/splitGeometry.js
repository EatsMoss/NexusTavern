/**
 * NexusTavern — split geometry for the optional stacked Pinned / All split mode.
 *
 * Each section reserves its own chrome plus ONE full row so neither side can
 * collapse to an unusable sliver when resized.
 */

export const SPLIT_DEFAULTS = {
  pinnedHeaderH: 30,
  allChromeH: 84,
  splitterH: 12,
  oneRowH: 150,
  totalH: 600,
  ratio: 0.36,
};

export function normalizeSplitRatio(value, fallback = SPLIT_DEFAULTS.ratio) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const num = Number.parseFloat(value);
  if (!Number.isFinite(num) || num < 0 || num > 1) return fallback;
  return num;
}

export function computeSplitLayout({
  totalH = SPLIT_DEFAULTS.totalH,
  pinnedHeaderH = SPLIT_DEFAULTS.pinnedHeaderH,
  allChromeH = SPLIT_DEFAULTS.allChromeH,
  splitterH = SPLIT_DEFAULTS.splitterH,
  oneRowH = SPLIT_DEFAULTS.oneRowH,
  ratio = SPLIT_DEFAULTS.ratio,
  extraPinnedH = 0,
} = {}) {
  const minPinnedH = pinnedHeaderH + extraPinnedH + oneRowH;
  const minAllH = allChromeH + oneRowH;
  const availableH = Math.max(minPinnedH + minAllH, totalH - splitterH);
  const maxPinnedH = Math.max(minPinnedH, availableH - minAllH);
  const target = Math.round(Math.max(minPinnedH, Math.min(maxPinnedH, availableH * ratio)));

  return { pinnedH: target, minPinnedH, maxPinnedH, minAllH, availableH };
}

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
