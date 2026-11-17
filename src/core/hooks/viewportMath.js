export const COMPACT_MAX_WIDTH = 767;
export const MEDIUM_MAX_WIDTH = 1179;
export const EXPANDED_SINGLE_MIN_WIDTH = 1180;
export const DEFAULT_EXPANDED_DUAL_MIN_WIDTH = 1680;
export const SHORT_VIEWPORT_MAX_HEIGHT = 520;
export const KEYBOARD_OPEN_THRESHOLD_PX = 132;

const DEFAULT_CHAT_COLUMN_WIDTH = 784;
const MIN_SIDE_TOME_CLEARANCE = 448; // 400px min tome + 48px toggle clearance

/**
 * Minimum viewport width required to keep both Left & Right Tomes docked beside the chat column.
 */
export function computeDualTomeMinWidth(chatColumnMaxWidth = DEFAULT_CHAT_COLUMN_WIDTH) {
  const numericChatWidth = Number(chatColumnMaxWidth);
  const resolvedChatWidth =
    Number.isFinite(numericChatWidth) && numericChatWidth > 0
      ? numericChatWidth
      : DEFAULT_CHAT_COLUMN_WIDTH;
  return Math.max(
    DEFAULT_EXPANDED_DUAL_MIN_WIDTH,
    Math.round(resolvedChatWidth + MIN_SIDE_TOME_CLEARANCE * 2),
  );
}

/**
 * Resolves the canonical M3 Window Size Class:
 * `'compact' | 'medium' | 'expanded-single' | 'expanded-dual'`
 */
export function resolveLayoutMode(width, chatColumnMaxWidth = DEFAULT_CHAT_COLUMN_WIDTH) {
  const w = Number(width) || 0;
  if (w <= COMPACT_MAX_WIDTH) return 'compact';
  if (w <= MEDIUM_MAX_WIDTH) return 'medium';
  if (w < computeDualTomeMinWidth(chatColumnMaxWidth)) return 'expanded-single';
  return 'expanded-dual';
}

/**
 * Pure viewport & visualViewport state calculator shared between runtime store and unit tests.
 */
export function computeViewportSnapshot({
  width = 1280,
  height = 800,
  visualHeight = height,
  visualOffsetTop = 0,
  isCoarsePointer = false,
  editableFocused = false,
  chatColumnMaxWidth = DEFAULT_CHAT_COLUMN_WIDTH,
} = {}) {
  const safeWidth = Math.max(0, Math.round(Number(width) || 0));
  const safeHeight = Math.max(0, Math.round(Number(height) || 0));
  const rawVisualHeight = Number(visualHeight);
  const safeVisualHeight =
    Number.isFinite(rawVisualHeight) && rawVisualHeight > 0
      ? Math.min(safeHeight || Math.round(rawVisualHeight), Math.round(rawVisualHeight))
      : safeHeight;
  const safeOffsetTop = Math.max(0, Math.round(Number(visualOffsetTop) || 0));

  const layoutMode = resolveLayoutMode(safeWidth, chatColumnMaxWidth);
  const isMobile = layoutMode === 'compact';
  const isTablet = layoutMode === 'medium';

  const rawHeightDelta = Math.max(0, safeHeight - safeVisualHeight - safeOffsetTop);
  const isTouchLike = Boolean(isCoarsePointer) || safeWidth <= MEDIUM_MAX_WIDTH;
  const isKeyboardOpen =
    isTouchLike &&
    rawHeightDelta >= KEYBOARD_OPEN_THRESHOLD_PX &&
    (editableFocused || rawHeightDelta >= 180);
  const keyboardInset = isKeyboardOpen ? rawHeightDelta : 0;

  const effectiveShellHeight = isKeyboardOpen ? safeHeight : safeVisualHeight || safeHeight;
  const isShortViewport =
    effectiveShellHeight > 0 && effectiveShellHeight <= SHORT_VIEWPORT_MAX_HEIGHT;

  return {
    width: safeWidth,
    height: safeHeight,
    visualHeight: safeVisualHeight,
    keyboardInset,
    isKeyboardOpen,
    layoutMode,
    isMobile,
    isTablet,
    isShortViewport,
    isCoarsePointer: Boolean(isCoarsePointer),
  };
}

export function snapshotsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.visualHeight === b.visualHeight &&
    a.keyboardInset === b.keyboardInset &&
    a.isKeyboardOpen === b.isKeyboardOpen &&
    a.layoutMode === b.layoutMode &&
    a.isMobile === b.isMobile &&
    a.isTablet === b.isTablet &&
    a.isShortViewport === b.isShortViewport &&
    a.isCoarsePointer === b.isCoarsePointer
  );
}
