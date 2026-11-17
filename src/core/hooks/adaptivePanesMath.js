export const DEFAULT_TOME_WIDTH = 550;
export const MIN_DUAL_TOME_WIDTH = 400;
export const MIN_SINGLE_TOME_WIDTH = 380;
export const MAX_STORED_TOME_WIDTH = 2400;
export const DEFAULT_CHAT_COLUMN_WIDTH = 784;

const TOME_TOGGLE_CLEARANCE = 52; // 8px from tome edge + 36px toggle button + 8px gap to chat edge
const SINGLE_STAGE_MIN_CLEARANCE = 660;

/**
 * Pure geometry calculator for Left & Right Tomes across M3 Window Size Classes.
 * Guarantees zero overlap between side tomes, TopBar, and the chat reading column.
 */
export function computeAdaptiveTomeGeometry({
  layoutMode,
  viewportWidth,
  chatColumnMaxWidth = DEFAULT_CHAT_COLUMN_WIDTH,
  leftOpen = false,
  rightOpen = false,
  leftWidth = DEFAULT_TOME_WIDTH,
  rightWidth = DEFAULT_TOME_WIDTH,
}) {
  const safeVw = Math.max(320, Math.round(Number(viewportWidth) || 1280));
  const rawChatMax = Number(chatColumnMaxWidth);
  const resolvedChatWidth =
    Number.isFinite(rawChatMax) && rawChatMax >= 480 ? rawChatMax : DEFAULT_CHAT_COLUMN_WIDTH;

  if (layoutMode === 'expanded-dual') {
    const minTomeWidth = MIN_DUAL_TOME_WIDTH;
    const maxTomeWidth = Math.max(
      minTomeWidth,
      Math.floor((safeVw - resolvedChatWidth) / 2) - TOME_TOGGLE_CLEARANCE,
    );
    const effectiveLeftWidth = Math.max(minTomeWidth, Math.min(maxTomeWidth, leftWidth));
    const effectiveRightWidth = Math.max(minTomeWidth, Math.min(maxTomeWidth, rightWidth));
    return {
      minTomeWidth,
      maxTomeWidth,
      effectiveLeftWidth,
      effectiveRightWidth,
      leftTomeInset: leftOpen ? effectiveLeftWidth : 0,
      rightTomeInset: rightOpen ? effectiveRightWidth : 0,
      allowResize: true,
      isOverlayDrawer: false,
    };
  }

  if (layoutMode === 'expanded-single') {
    const minTomeWidth = MIN_SINGLE_TOME_WIDTH;
    const reservedCenter = Math.min(resolvedChatWidth + 56, SINGLE_STAGE_MIN_CLEARANCE);
    const maxTomeWidth = Math.max(minTomeWidth, Math.min(640, safeVw - reservedCenter));
    const effectiveLeftWidth = Math.max(minTomeWidth, Math.min(maxTomeWidth, leftWidth));
    const effectiveRightWidth = Math.max(minTomeWidth, Math.min(maxTomeWidth, rightWidth));
    return {
      minTomeWidth,
      maxTomeWidth,
      effectiveLeftWidth,
      effectiveRightWidth,
      leftTomeInset: 0,
      rightTomeInset: 0,
      allowResize: true,
      isOverlayDrawer: false,
    };
  }

  const drawerWidth = Math.min(420, Math.round(safeVw * 0.86));
  return {
    minTomeWidth: MIN_SINGLE_TOME_WIDTH,
    maxTomeWidth: drawerWidth,
    effectiveLeftWidth: drawerWidth,
    effectiveRightWidth: drawerWidth,
    leftTomeInset: 0,
    rightTomeInset: 0,
    allowResize: false,
    isOverlayDrawer: true,
  };
}

/**
 * Pure state-transition resolver when the browser window crosses an M3 Size Class boundary.
 */
export function resolveModeTransitionPanes({
  prevMode,
  nextMode,
  leftOpen,
  rightOpen,
  desktopPanes,
  lastActiveSide = 'left',
}) {
  if (prevMode === nextMode) {
    return { leftOpen, rightOpen };
  }

  if (nextMode === 'compact' || nextMode === 'medium') {
    return { leftOpen: false, rightOpen: false };
  }

  if (nextMode === 'expanded-single') {
    if (prevMode === 'expanded-dual') {
      if (leftOpen && rightOpen) {
        return lastActiveSide === 'right'
          ? { leftOpen: false, rightOpen: true }
          : { leftOpen: true, rightOpen: false };
      }
      return { leftOpen, rightOpen };
    }
    const wantLeft = Boolean(desktopPanes?.leftOpen);
    const wantRight = Boolean(desktopPanes?.rightOpen);
    if (wantLeft && wantRight) {
      return lastActiveSide === 'right'
        ? { leftOpen: false, rightOpen: true }
        : { leftOpen: true, rightOpen: false };
    }
    return { leftOpen: wantLeft, rightOpen: wantRight };
  }

  return {
    leftOpen: Boolean(desktopPanes?.leftOpen),
    rightOpen: Boolean(desktopPanes?.rightOpen),
  };
}
