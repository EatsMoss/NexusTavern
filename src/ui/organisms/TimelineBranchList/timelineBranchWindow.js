export const TL_GROUP_GAP = 10;
export const TL_GROUP_HEAD_HEIGHT = 48;
export const TL_BRANCHES_PAD_Y = 8;
export const TL_LEAF_ROW_HEIGHT = 86;
export const TL_LEAF_ROW_GAP = 6;
export const TL_LEAF_STRIDE = TL_LEAF_ROW_HEIGHT + TL_LEAF_ROW_GAP;
export const TL_BRANCH_WINDOW_THRESHOLD = 12;
export const TL_OVERSCAN_PX = 520;

/**
 * Computes exact virtualized group & nested leaf-branch slices for TimelineBranchList
 * so characters with 500–3,000+ `.jsonl` chats mount only ~15–25 branch rows at a time.
 */
export function computeTimelineVirtualSlice({
  groups = [],
  collapsedRoots = null,
  hasSearchQuery = false,
  scrollTop = 0,
  viewportHeight = 640,
  overscanPx = TL_OVERSCAN_PX,
}) {
  const totalGroups = Array.isArray(groups) ? groups.length : 0;
  if (totalGroups === 0) {
    return {
      startGroupIndex: 0,
      endGroupIndex: -1,
      topSpacerPx: 0,
      bottomSpacerPx: 0,
      branchRanges: [],
      signature: 'empty',
    };
  }

  const layouts = new Array(totalGroups);
  let cursorY = 0;

  for (let i = 0; i < totalGroups; i += 1) {
    const grp = groups[i];
    const isCollapsed =
      Boolean(collapsedRoots && collapsedRoots.has(grp.rootFile)) && !hasSearchQuery;
    const rowsCount = grp.visibleRows?.length || 0;
    const height = isCollapsed
      ? TL_GROUP_HEAD_HEIGHT
      : TL_GROUP_HEAD_HEIGHT +
        TL_BRANCHES_PAD_Y * 2 +
        (rowsCount > 0
          ? rowsCount * TL_LEAF_ROW_HEIGHT + Math.max(0, rowsCount - 1) * TL_LEAF_ROW_GAP
          : 0);

    const top = cursorY;
    const bottom = top + height;
    layouts[i] = { top, bottom, height, isCollapsed, rowsCount };
    cursorY = bottom + (i < totalGroups - 1 ? TL_GROUP_GAP : 0);
  }

  const totalHeight = layouts[totalGroups - 1].bottom;
  const safeScrollTop = Math.max(0, Number(scrollTop) || 0);
  const safeViewportH = viewportHeight > 0 ? viewportHeight : 640;
  const winTop = Math.max(0, safeScrollTop - overscanPx);
  const winBottom = safeScrollTop + safeViewportH + overscanPx;

  let startGroupIndex = 0;
  while (
    startGroupIndex < totalGroups - 1 &&
    layouts[startGroupIndex].bottom < winTop
  ) {
    startGroupIndex += 1;
  }

  let endGroupIndex = startGroupIndex;
  while (
    endGroupIndex < totalGroups - 1 &&
    layouts[endGroupIndex + 1].top <= winBottom
  ) {
    endGroupIndex += 1;
  }

  const topSpacerPx = layouts[startGroupIndex].top;
  const bottomSpacerPx = Math.max(0, totalHeight - layouts[endGroupIndex].bottom);

  const branchRanges = [];
  const sigParts = [`${startGroupIndex}:${endGroupIndex}`];

  for (let i = startGroupIndex; i <= endGroupIndex; i += 1) {
    const layout = layouts[i];
    if (
      layout.isCollapsed ||
      layout.rowsCount <= TL_BRANCH_WINDOW_THRESHOLD
    ) {
      branchRanges.push({
        startIndex: 0,
        endIndex: layout.rowsCount,
        topPadPx: TL_BRANCHES_PAD_Y,
        bottomPadPx: TL_BRANCHES_PAD_Y,
      });
      sigParts.push(`${i}:all:${layout.rowsCount}:${layout.isCollapsed ? 1 : 0}`);
      continue;
    }

    const branchesOriginY = layout.top + TL_GROUP_HEAD_HEIGHT + TL_BRANCHES_PAD_Y;
    const relTop = Math.max(0, winTop - branchesOriginY);
    const relBottom = Math.max(0, winBottom - branchesOriginY);

    const startIndex = Math.min(
      layout.rowsCount - 1,
      Math.max(0, Math.floor(relTop / TL_LEAF_STRIDE)),
    );
    const endRowInclusive = Math.min(
      layout.rowsCount - 1,
      Math.max(startIndex, Math.floor(relBottom / TL_LEAF_STRIDE)),
    );
    const endIndex = endRowInclusive + 1;

    const topPadPx = TL_BRANCHES_PAD_Y + startIndex * TL_LEAF_STRIDE;
    const remainingRows = Math.max(0, layout.rowsCount - 1 - endRowInclusive);
    const bottomPadPx = TL_BRANCHES_PAD_Y + remainingRows * TL_LEAF_STRIDE;

    branchRanges.push({
      startIndex,
      endIndex,
      topPadPx,
      bottomPadPx,
    });
    sigParts.push(`${i}:${startIndex}-${endIndex}`);
  }

  return {
    startGroupIndex,
    endGroupIndex,
    topSpacerPx,
    bottomSpacerPx,
    branchRanges,
    signature: sigParts.join('|'),
  };
}
