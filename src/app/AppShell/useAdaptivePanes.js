import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { resolveLayoutMode } from '@core/hooks/useViewport.js';
import {
  DEFAULT_TOME_WIDTH,
  MIN_SINGLE_TOME_WIDTH,
  MAX_STORED_TOME_WIDTH,
  DEFAULT_CHAT_COLUMN_WIDTH,
  computeAdaptiveTomeGeometry,
  resolveModeTransitionPanes,
} from '@core/hooks/adaptivePanesMath.js';
import { hasOpenTopLayerOverlay } from './useWorkspaceSheetDismiss.js';

export {
  DEFAULT_TOME_WIDTH,
  MIN_SINGLE_TOME_WIDTH,
  MAX_STORED_TOME_WIDTH,
  DEFAULT_CHAT_COLUMN_WIDTH,
};

function applySideChange(curr, side, nextOpen, mode, desktopPanesRef, lastActiveSideRef) {
  if (nextOpen) lastActiveSideRef.current = side;
  const isLeft = side === 'left';

  if (mode === 'expanded-dual') {
    const next = isLeft ? { ...curr, leftOpen: nextOpen } : { ...curr, rightOpen: nextOpen };
    desktopPanesRef.current = next;
    return curr.leftOpen === next.leftOpen && curr.rightOpen === next.rightOpen ? curr : next;
  }

  const nextLeft = isLeft ? nextOpen : nextOpen ? false : curr.leftOpen;
  const nextRight = !isLeft ? nextOpen : nextOpen ? false : curr.rightOpen;

  if (mode === 'expanded-single') {
    if (nextOpen) {
      desktopPanesRef.current = isLeft
        ? { ...desktopPanesRef.current, leftOpen: true }
        : { ...desktopPanesRef.current, rightOpen: true };
    } else if (!nextLeft && !nextRight) {
      desktopPanesRef.current = { leftOpen: false, rightOpen: false };
    }
  }

  return curr.leftOpen === nextLeft && curr.rightOpen === nextRight
    ? curr
    : { leftOpen: nextLeft, rightOpen: nextRight };
}

export function useAdaptivePanes({
  viewportWidth,
  chatColumnMaxWidth = DEFAULT_CHAT_COLUMN_WIDTH,
  initialLeftOpen = true,
  initialRightOpen = true,
  leftWidth,
  rightWidth,
}) {
  const layoutMode = useMemo(
    () => resolveLayoutMode(viewportWidth, chatColumnMaxWidth),
    [viewportWidth, chatColumnMaxWidth],
  );

  useEffect(() => {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-layout-mode', layoutMode);
    }
  }, [layoutMode]);

  const desktopPanesRef = useRef({
    leftOpen: Boolean(initialLeftOpen),
    rightOpen: Boolean(initialRightOpen),
  });
  const lastActiveSideRef = useRef(initialLeftOpen || !initialRightOpen ? 'left' : 'right');
  const layoutModeRef = useRef(layoutMode);
  layoutModeRef.current = layoutMode;

  const [panes, setPanes] = useState(() =>
    resolveModeTransitionPanes({
      prevMode: 'expanded-dual',
      nextMode: layoutMode,
      leftOpen: Boolean(initialLeftOpen),
      rightOpen: Boolean(initialRightOpen),
      desktopPanes: desktopPanesRef.current,
      lastActiveSide: lastActiveSideRef.current,
    }),
  );

  const prevModeRef = useRef(layoutMode);
  useEffect(() => {
    const prevMode = prevModeRef.current;
    if (prevMode === layoutMode) return;
    prevModeRef.current = layoutMode;

    setPanes((curr) =>
      resolveModeTransitionPanes({
        prevMode,
        nextMode: layoutMode,
        leftOpen: curr.leftOpen,
        rightOpen: curr.rightOpen,
        desktopPanes: desktopPanesRef.current,
        lastActiveSide: lastActiveSideRef.current,
      }),
    );
  }, [layoutMode]);

  const setLeftOpen = useCallback((updater) => {
    setPanes((curr) => {
      const nextOpen = Boolean(typeof updater === 'function' ? updater(curr.leftOpen) : updater);
      return applySideChange(
        curr,
        'left',
        nextOpen,
        layoutModeRef.current,
        desktopPanesRef,
        lastActiveSideRef,
      );
    });
  }, []);

  const setRightOpen = useCallback((updater) => {
    setPanes((curr) => {
      const nextOpen = Boolean(typeof updater === 'function' ? updater(curr.rightOpen) : updater);
      return applySideChange(
        curr,
        'right',
        nextOpen,
        layoutModeRef.current,
        desktopPanesRef,
        lastActiveSideRef,
      );
    });
  }, []);

  const closeDrawers = useCallback(() => {
    setPanes((curr) =>
      !curr.leftOpen && !curr.rightOpen ? curr : { leftOpen: false, rightOpen: false },
    );
  }, []);

  const hydrateDesktopPanes = useCallback((srvLeftOpen, srvRightOpen) => {
    desktopPanesRef.current = {
      leftOpen: Boolean(srvLeftOpen),
      rightOpen: Boolean(srvRightOpen),
    };
    setPanes(
      resolveModeTransitionPanes({
        prevMode: 'expanded-dual',
        nextMode: layoutModeRef.current,
        leftOpen: Boolean(srvLeftOpen),
        rightOpen: Boolean(srvRightOpen),
        desktopPanes: desktopPanesRef.current,
        lastActiveSide: lastActiveSideRef.current,
      }),
    );
  }, []);

  useEffect(() => {
    if (layoutMode !== 'medium' || (!panes.leftOpen && !panes.rightOpen)) return undefined;
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || hasOpenTopLayerOverlay()) return;
      e.stopPropagation();
      closeDrawers();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [layoutMode, panes.leftOpen, panes.rightOpen, closeDrawers]);

  const geometry = useMemo(
    () =>
      computeAdaptiveTomeGeometry({
        layoutMode,
        viewportWidth,
        chatColumnMaxWidth,
        leftOpen: panes.leftOpen,
        rightOpen: panes.rightOpen,
        leftWidth,
        rightWidth,
      }),
    [
      layoutMode,
      viewportWidth,
      chatColumnMaxWidth,
      panes.leftOpen,
      panes.rightOpen,
      leftWidth,
      rightWidth,
    ],
  );

  return {
    layoutMode,
    leftOpen: panes.leftOpen,
    rightOpen: panes.rightOpen,
    setLeftOpen,
    setRightOpen,
    closeDrawers,
    hydrateDesktopPanes,
    desktopPanesRef,
    ...geometry,
  };
}
