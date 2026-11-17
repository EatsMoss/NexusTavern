import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MOBILE_NAV_TAB_IDS,
  resolveMobileBackAction,
  shouldHideMobileNavBar,
} from '@core/hooks/mobileShellMath.js';

/**
 * Coordinates smartphone (`compact` <= 767px) navigation tabs, `Workspace` sub-screens,
 * quick `Chats & Branches` BottomSheet, and Android/iOS hardware/gesture Back (`popstate`).
 */
export function useMobileNavigation({
  layoutMode,
  isKeyboardOpen = false,
  viewMode = 'tavern',
  setViewMode,
  activeWorkspaceSheetKind = null,
  requestCloseActiveWorkspaceSheet,
  timelinesOpen = false,
  onCloseTimelines,
  activeSheetTab = 'description',
  setActiveSheetTab,
  sheetExpanded = false,
  setSheetExpanded,
  runWithWorkspaceUnsavedGuard,
  onRefreshChatBranches,
}) {
  const isCompact = layoutMode === 'compact';
  const [mobileTab, setMobileTabState] = useState('chat');
  const [workspaceSubScreen, setWorkspaceSubScreen] = useState(null);
  const [chatBranchesOpen, setChatBranchesOpen] = useState(false);

  // Close desktop-only dual-pane expanded sheet & mobile branch sheet when crossing layout boundaries
  useEffect(() => {
    if (isCompact && sheetExpanded) {
      setSheetExpanded(false);
    }
    if (!isCompact && chatBranchesOpen) {
      setChatBranchesOpen(false);
    }
  }, [isCompact, sheetExpanded, setSheetExpanded, chatBranchesOpen]);

  const navigateMobileTab = useCallback(
    (nextTabId) => {
      if (!MOBILE_NAV_TAB_IDS.includes(nextTabId)) return;

      const proceed = () => {
        setChatBranchesOpen(false);
        if (nextTabId === 'chat' && mobileTab === 'chat' && timelinesOpen) {
          onCloseTimelines?.();
          return;
        }
        if (nextTabId === 'workspace' && mobileTab === 'workspace' && workspaceSubScreen) {
          setWorkspaceSubScreen(null);
          return;
        }
        if (nextTabId === 'card' && mobileTab === 'card' && activeSheetTab === 'advanced') {
          setActiveSheetTab?.('description');
          return;
        }
        setMobileTabState(nextTabId);
      };

      if (activeWorkspaceSheetKind && activeWorkspaceSheetKind !== 'expandedCharacter') {
        runWithWorkspaceUnsavedGuard(
          () => {
            requestCloseActiveWorkspaceSheet?.({ skipGuard: true });
            proceed();
          },
          { targetKind: activeWorkspaceSheetKind },
        );
        return;
      }

      proceed();
    },
    [
      mobileTab,
      timelinesOpen,
      onCloseTimelines,
      workspaceSubScreen,
      activeSheetTab,
      setActiveSheetTab,
      activeWorkspaceSheetKind,
      runWithWorkspaceUnsavedGuard,
      requestCloseActiveWorkspaceSheet,
    ],
  );

  const openChatBranchesSheet = useCallback(() => {
    setChatBranchesOpen(true);
    onRefreshChatBranches?.();
  }, [onRefreshChatBranches]);

  const closeChatBranchesSheet = useCallback(() => {
    setChatBranchesOpen(false);
  }, []);

  const hasActiveFullScreenEditor = Boolean(
    viewMode === 'sandbox' ||
      (activeWorkspaceSheetKind && activeWorkspaceSheetKind !== 'expandedCharacter'),
  );

  const hideMobileNav = shouldHideMobileNavBar({
    hasActiveFullScreenEditor,
    mobileTab,
    isKeyboardOpen,
  });

  const pendingBackAction = isCompact
    ? resolveMobileBackAction({
        chatBranchesOpen,
        viewMode,
        activeWorkspaceSheetKind,
        mobileTab,
        timelinesOpen,
        activeSheetTab,
        workspaceSubScreen,
      })
    : null;

  const backActionRef = useRef(pendingBackAction);
  backActionRef.current = pendingBackAction;

  const handlersRef = useRef({});
  handlersRef.current = {
    closeChatBranchesSheet,
    setViewMode,
    requestCloseActiveWorkspaceSheet,
    onCloseTimelines,
    setActiveSheetTab,
    setWorkspaceSubScreen,
    setMobileTabState,
  };

  const historyGuardActiveRef = useRef(false);

  // Push a lightweight sentinel history entry while any dismissible mobile layer/tab is active
  // so Android/iOS system Back returns step-by-step instead of exiting the tab prematurely.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return;
    if (pendingBackAction && !historyGuardActiveRef.current) {
      try {
        window.history.pushState({ ...(window.history.state || {}), nexusMobileGuard: true }, '');
        historyGuardActiveRef.current = true;
      } catch {
        // ignore restricted history environments
      }
    }
  }, [pendingBackAction]);

  useEffect(() => {
    if (!isCompact || typeof window === 'undefined') return undefined;

    const handlePopState = () => {
      const action = backActionRef.current;
      historyGuardActiveRef.current = false;
      if (!action) return;

      const h = handlersRef.current;
      switch (action) {
        case 'close-chat-branches':
          h.closeChatBranchesSheet?.();
          break;
        case 'exit-sandbox':
          h.setViewMode?.('tavern');
          break;
        case 'close-workspace-sheet':
          h.requestCloseActiveWorkspaceSheet?.();
          break;
        case 'close-timelines':
          h.onCloseTimelines?.();
          break;
        case 'exit-card-advanced':
          h.setActiveSheetTab?.('description');
          break;
        case 'exit-workspace-subscreen':
          h.setWorkspaceSubScreen?.(null);
          break;
        case 'return-to-chat':
          h.setMobileTabState?.('chat');
          break;
        default:
          break;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isCompact]);

  return {
    isCompact,
    mobileTab,
    navigateMobileTab,
    workspaceSubScreen,
    setWorkspaceSubScreen,
    chatBranchesOpen,
    openChatBranchesSheet,
    closeChatBranchesSheet,
    hasActiveFullScreenEditor,
    hideMobileNav,
  };
}
