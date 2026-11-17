import React, {
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from 'react';
import {
  Icon,
  BrandLogo,
  ProgressIndicator,
  SkeletonMessage,
  Button,
  MultiSelectBar,
  Modal,
  PearlescentShader,
  ChatMessageCard,
  ScrollIndicator,
  EmojiPicker,
  ToastStack,
} from '@ui/index.js';
import { useViewport } from '@core/hooks/useViewport.js';
import { buildTimelineForest } from '@core/chats/timelineForest.js';
import { postClientConsoleLog } from '@core/system/consoleApi.js';
import { getCustomizationRuntimeSnapshot } from '@core/customization/customizationRuntimeStore.js';
import { useConsoleStream } from './useConsoleStream.js';
import { ChatComposer } from './ChatComposer.jsx';
import './ChatViewport.css';

const LazyTimelineTree = lazy(() =>
  import('@ui/organisms/TimelineTree/TimelineTree.jsx').then((m) => ({
    default: m.TimelineTree,
  })),
);

const LazyConsoleDrawer = lazy(() =>
  import('@ui/organisms/ConsoleDrawer/ConsoleDrawer.jsx').then((m) => ({
    default: m.ConsoleDrawer,
  })),
);

/**
 * Normalizes both SillyTavern branch filename conventions:
 *   - `<base> - Branch #<N>.jsonl`
 *   - `Branch #<N> - <base>.jsonl`
 * so the branch number and base title are always consistently formatted.
 */
function parseChatTitleAndBranch(fileName = '') {
  const stem = String(fileName || '').replace(/\.jsonl$/i, '').trim();
  if (!stem) {
    return { baseTitle: 'Chat', branchNumber: null, branchLabel: null };
  }

  const suffixMatch = stem.match(/^(.+?)\s*-\s*Branch\s*#(\d+)$/i);
  if (suffixMatch) {
    const num = suffixMatch[2];
    return {
      baseTitle: suffixMatch[1].trim(),
      branchNumber: num,
      branchLabel: `Branch #${num}`,
    };
  }

  const prefixMatch = stem.match(/^Branch\s*#(\d+)\s*-\s*(.+)$/i);
  if (prefixMatch) {
    const num = prefixMatch[1];
    return {
      baseTitle: prefixMatch[2].trim(),
      branchNumber: num,
      branchLabel: `Branch #${num}`,
    };
  }

  return {
    baseTitle: stem,
    branchNumber: null,
    branchLabel: null,
  };
}

export function ChatViewport({
  streamRef,
  composerRef,
  isDemoCard: _isDemoCard = false,
  chatListOpen = false,
  timelinesOpen = false,
  timelineChats = [],
  timelineForest = null,
  loadingTimelines = false,
  focusedTimelineRequest = null,
  onTimelineFocusChange,
  leftTomeInset = 0,
  rightTomeInset = 0,
  chatFiles = [],
  totalChatsCount: _totalChatsCount = null,
  hasMoreChats: _hasMoreChats = false,
  loadingMoreChats: _loadingMoreChats = false,
  onLoadMoreChats: _onLoadMoreChats,
  onSelectChatFile,
  onBranchChatFile: _onBranchChatFile,
  onDeleteChatFiles: _onDeleteChatFiles,
  onCloseChatList: _onCloseChatList,
  onCloseTimelines: _onCloseTimelines,
  activeChatFile = '',
  chatMetaStats = {},
  loadingChat = false,
  onLoadOlderMessages,
  messages = [],
  demoSwipeIdx = 0,
  personas = [],
  activePersonaAvatar = '',
  personaName = 'User',
  personaAvatarUrl = null,
  cards = [],
  groups = [],
  activeCharacter = null,
  hasUserMessages = false,
  userMessageCount = 0,
  onSelectPersona,
  onConfirmReplacePersonaInChat,
  onToggleBindPersonaToActiveCard,
  onOpenManagePersonaModal,
  onOpenCreatePersonaModal,
  onDuplicatePersona,
  onDeletePersona,
  onClickPersonaBadge,
  modelLabel = 'No Model Selected',
  onClickModelBadge,
  hubConnections = [],
  activeProviderId = '',
  activeModelId = '',
  activeModelName = '',
  onSelectHubModel,
  onUpdateHubConnection,
  onFetchHubModels,
  onDeleteHubConnection,
  onRevealHubKey,
  onPingHubConnections,
  onFetchHubTelemetry,
  hubCustomFamilies = [],
  onAddHubCustomFamily,
  onDeleteHubCustomFamily,
  characterName = 'Character',
  characterAvatarUrl = null,
  characterInitials = 'CH',
  shaderStyle = 'silk',
  shaderIntensity = 0.78,
  lowGpu = false,
  onSwipeMessage,
  onGenerateSwipe,
  onContinueMessage,
  onDeleteSwipe,
  onSaveEditedMessage,
  onRemoveMessageAttachment,
  onDeleteMessage,
  onDeleteMessagesBatch,
  onCreateBranch,
  onNotify,
  composerToasts = [],
  onDismissComposerToast,
  onSendMessage,
  isGenerating = false,
  onStopGeneration,
  consoleStream = null,
  consoleOpen: controlledConsoleOpen,
  onChangeConsoleOpen,
  recapCompressDepth = null,
  hasActiveScenario = true,
  switchingScenario = false,
  onOpenCreateScenario,
  onOpenImportScenario,
}) {
  const { isMobile } = useViewport();
  const internalStreamRef = useRef(null);
  const resolvedStreamRef = streamRef || internalStreamRef;
  const internalComposerRef = useRef(null);
  const resolvedComposerRef = composerRef || internalComposerRef;
  const streamTrackRef = useRef(null);
  const composerEmojiBtnRef = useRef(null);

  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const [uncontrolledConsoleOpen, setUncontrolledConsoleOpen] = useState(false);
  const consoleOpen =
    controlledConsoleOpen !== undefined ? controlledConsoleOpen : uncontrolledConsoleOpen;
  const setConsoleOpen = onChangeConsoleOpen || setUncontrolledConsoleOpen;
  const internalConsoleStream = useConsoleStream({ enabled: !consoleStream });
  const activeConsoleStream = consoleStream || internalConsoleStream;
  const {
    entries: consoleEntries,
    connected: consoleConnected,
    clearLogs: clearConsoleLogs,
  } = activeConsoleStream;
  const prevLoggedChatKeyRef = useRef('');
  const [msgMultiSelectActive, setMsgMultiSelectActive] = useState(false);
  const [selectedMsgIndices, setSelectedMsgIndices] = useState([]);
  const [lastMsgSelectClick, setLastMsgSelectClick] = useState({
    index: null,
    selected: true,
  });
  const [msgDeleteConfirm, setMsgDeleteConfirm] = useState(null); // number[] | null
  const [deletingMsgs, setDeletingMsgs] = useState(false);
  const [branchingAtIndex, setBranchingAtIndex] = useState(null);
  const branchSettleTimerRef = useRef(null);
  const branchSlideAnchorRef = useRef(null);
  const branchSlidingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (branchSettleTimerRef.current) {
        clearTimeout(branchSettleTimerRef.current);
      }
    };
  }, []);

  const handleTriggerCreateBranch = useCallback(
    async (mIdx) => {
      if (!onCreateBranch || branchingAtIndex !== null) return;
      setBranchingAtIndex(mIdx);

      const minAnimDelay = new Promise((resolve) => setTimeout(resolve, 210));
      try {
        const [branchRes] = await Promise.all([
          Promise.resolve(onCreateBranch(mIdx, { deferApply: true })),
          minAnimDelay,
        ]);

        if (branchRes?.apply) {
          const streamEl = resolvedStreamRef.current;
          const anchorEl = streamEl?.querySelector(`[data-msg-index="${mIdx}"]`);
          if (streamEl && anchorEl) {
            branchSlideAnchorRef.current = {
              index: mIdx,
              prevBottom: anchorEl.getBoundingClientRect().bottom,
            };
          }
          branchRes.apply();
        }
        setBranchingAtIndex(null);

        if (branchRes?.fileName) {
          const parsed = parseChatTitleAndBranch(branchRes.fileName);
          const label = parsed.branchLabel
            ? `${parsed.branchLabel} created`
            : 'Branch created';
          onNotify?.({
            variant: 'success',
            icon: 'codeBranch',
            message: label,
          });
        }
      } catch {
        setBranchingAtIndex(null);
      }
    },
    [onCreateBranch, branchingAtIndex, resolvedStreamRef, onNotify],
  );

  const [showJumpBottom, setShowJumpBottom] = useState(false);
  // Direct DOM edge-fade class flags (zero React re-renders on scroll).
  const edgeFadeRef = useRef({ top: false, bottom: false });
  const applyStreamEdgeClasses = useCallback((el, nextTop, nextBottom) => {
    if (!el) return;
    const prev = edgeFadeRef.current;
    const topBool = Boolean(nextTop);
    const bottomBool = Boolean(nextBottom);
    if (prev.top !== topBool) {
      prev.top = topBool;
      el.classList.toggle('is-scrolled-under-top', topBool);
    }
    if (prev.bottom !== bottomBool) {
      prev.bottom = bottomBool;
      el.classList.toggle('is-scrolled-under-bottom', bottomBool);
    }
  }, []);
  const prependAnchorRef = useRef(null);
  // Sticky-to-bottom state: true only while the viewport is resting at the very
  // bottom. Any upward user scroll immediately detaches it so streaming never
  // pulls the reader away from older messages; scrolling back to the bottom
  // re-attaches it.
  const isPinnedToBottomRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const programmaticClearRafRef = useRef(0);
  const autoScrollRafRef = useRef({ outer: 0, inner: 0 });
  const smoothJumpActiveRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const lastScrollHeightRef = useRef(0);
  const wasGeneratingRef = useRef(Boolean(isGenerating));
  // Latches an in-flight auto-load so rapid `scroll` events cannot queue
  // duplicate batches. A ref, not state, so the guard is visible immediately.
  const autoLoadGateRef = useRef(false);
  // Armed when older messages are about to be prepended: tells the auto-scroll
  // effect to hold the reader's position instead of jumping to the bottom.
  // Cleared by that effect itself, because the anchor effect clears
  // `prependAnchorRef` before auto-scroll ever sees it.
  const skipAutoScrollRef = useRef(false);
  // Tracks the current loaded-message count so a load can tell whether it
  // actually prepended anything. Kept in sync by the effect below, which runs
  // after React commits the new `messages` array.
  const messagesLengthRef = useRef(messages.length);

  // Reading upward reaches the top of the loaded window: pull the next older
  // batch before the reader actually hits the wall, so scrolling feels seamless.
  const AT_TOP_THRESHOLD_PX = 160;
  const AT_BOTTOM_THRESHOLD_PX = 20;
  const JUMP_BOTTOM_THRESHOLD_PX = 96;

  const syncScrollEdges = useCallback(
    (el) => {
      if (!el) return;
      const currentTop = el.scrollTop;
      const distanceFromBottom = Math.max(
        0,
        el.scrollHeight - currentTop - el.clientHeight,
      );
      applyStreamEdgeClasses(el, currentTop > 1, distanceFromBottom > 1.5);
      const nextJump = distanceFromBottom > JUMP_BOTTOM_THRESHOLD_PX;
      setShowJumpBottom((prev) => (prev === nextJump ? prev : nextJump));
    },
    [applyStreamEdgeClasses],
  );

  const cancelPendingAutoScroll = useCallback(() => {
    if (autoScrollRafRef.current.outer) {
      cancelAnimationFrame(autoScrollRafRef.current.outer);
      autoScrollRafRef.current.outer = 0;
    }
    if (autoScrollRafRef.current.inner) {
      cancelAnimationFrame(autoScrollRafRef.current.inner);
      autoScrollRafRef.current.inner = 0;
    }
  }, []);

  const detachFromBottom = useCallback(() => {
    isPinnedToBottomRef.current = false;
    smoothJumpActiveRef.current = false;
    cancelPendingAutoScroll();
    syncScrollEdges(resolvedStreamRef.current);
  }, [cancelPendingAutoScroll, resolvedStreamRef, syncScrollEdges]);

  const applyProgrammaticScrollToBottom = useCallback(
    (el) => {
      if (!el) return;
      programmaticScrollRef.current = true;
      el.scrollTop = el.scrollHeight;
      lastScrollTopRef.current = el.scrollTop;
      lastScrollHeightRef.current = el.scrollHeight;
      applyStreamEdgeClasses(el, el.scrollTop > 1, false);
      setShowJumpBottom((prev) => (prev ? false : prev));
      if (programmaticClearRafRef.current) {
        cancelAnimationFrame(programmaticClearRafRef.current);
      }
      programmaticClearRafRef.current = requestAnimationFrame(() => {
        programmaticClearRafRef.current = requestAnimationFrame(() => {
          programmaticClearRafRef.current = 0;
          programmaticScrollRef.current = false;
        });
      });
    },
    [applyStreamEdgeClasses],
  );

  useEffect(() => {
    return () => {
      cancelPendingAutoScroll();
      if (programmaticClearRafRef.current) {
        cancelAnimationFrame(programmaticClearRafRef.current);
      }
    };
  }, [cancelPendingAutoScroll]);

  const handleLoadOlderWithAnchor = useCallback(async () => {
    const el = resolvedStreamRef.current;
    if (!el) return;
    prependAnchorRef.current = {
      prevScrollHeight: el.scrollHeight,
      prevScrollTop: el.scrollTop,
    };
    // Hold the reading position: without this the auto-scroll effect would
    // fling the chat to the bottom as soon as the older batch lands.
    skipAutoScrollRef.current = true;

    const lengthBefore = messagesLengthRef.current;
    try {
      if (onLoadOlderMessages) {
        await onLoadOlderMessages();
      }
    } finally {
      // Nothing to prepend (empty batch, failed fetch, or the host declined):
      // the auto-scroll effect will not run, so the latch would stay armed and
      // swallow the next genuine auto-scroll. The check has to happen AFTER
      // React commits the new `messages` array — comparing right here would see
      // the stale count, because `setMessages` has not been committed yet at
      // the moment this promise settles.
      requestAnimationFrame(() => {
        if (messagesLengthRef.current === lengthBefore) {
          skipAutoScrollRef.current = false;
          prependAnchorRef.current = null;
        }
      });
    }
  }, [onLoadOlderMessages, resolvedStreamRef]);

  const handleScroll = useCallback(() => {
    const el = resolvedStreamRef.current;
    if (!el) return;
    const currentTop = el.scrollTop;
    const prevTop = lastScrollTopRef.current;
    const prevHeight = lastScrollHeightRef.current;
    lastScrollTopRef.current = currentTop;
    lastScrollHeightRef.current = el.scrollHeight;

    const distanceFromBottom = Math.max(
      0,
      el.scrollHeight - currentTop - el.clientHeight,
    );

    if (!programmaticScrollRef.current && !branchSlidingRef.current) {
      if (distanceFromBottom <= AT_BOTTOM_THRESHOLD_PX) {
        isPinnedToBottomRef.current = true;
        smoothJumpActiveRef.current = false;
      } else if (
        currentTop < prevTop - 1 &&
        el.scrollHeight >= prevHeight - 1 &&
        !smoothJumpActiveRef.current
      ) {
        detachFromBottom();
      }
    }

    syncScrollEdges(el);

    // Auto-load older messages. The anchor captured inside
    // `handleLoadOlderWithAnchor` restores the reading position after the batch
    // is prepended, so the viewport does not jump.
    if (
      currentTop <= AT_TOP_THRESHOLD_PX &&
      chatMetaStats.hasMoreOlder &&
      !loadingChat &&
      !autoLoadGateRef.current &&
      !branchSlidingRef.current
    ) {
      autoLoadGateRef.current = true;
      handleLoadOlderWithAnchor().finally(() => {
        autoLoadGateRef.current = false;
      });
    }
  }, [
    resolvedStreamRef,
    chatMetaStats.hasMoreOlder,
    loadingChat,
    handleLoadOlderWithAnchor,
    detachFromBottom,
    syncScrollEdges,
  ]);

  // Restore exact reading scroll position after older messages are prepended
  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current;
    const el = resolvedStreamRef.current;
    if (anchor && el) {
      const heightDiff = el.scrollHeight - anchor.prevScrollHeight;
      if (heightDiff > 0) {
        programmaticScrollRef.current = true;
        el.scrollTop = anchor.prevScrollTop + heightDiff;
        lastScrollTopRef.current = el.scrollTop;
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
      }
      prependAnchorRef.current = null;
    }
    // React has committed the new array, so the count a load compares against
    // is now up to date.
    messagesLengthRef.current = messages.length;
  }, [messages.length, resolvedStreamRef]);

  const lastChatFileRef = useRef(activeChatFile);
  const lastRenderedCountRef = useRef(messages.length);
  const lastTailMsgIdRef = useRef(
    messages.length > 0 ? messages[messages.length - 1]?.id ?? null : null,
  );
  const wasOverlayOpenRef = useRef(Boolean(chatListOpen || timelinesOpen));

  // Auto-scroll to the very bottom when a chat is opened, returned to from
  // the chat history / timelines view, or when the user sends a new message.
  // During assistant reply creation and streaming deltas, scroll ONLY while
  // `isPinnedToBottomRef.current` is true.
  useLayoutEffect(() => {
    if (chatListOpen || timelinesOpen) {
      wasOverlayOpenRef.current = true;
      return undefined;
    }
    const el = resolvedStreamRef.current;
    if (!el) return undefined;

    const returnedFromOverlay = wasOverlayOpenRef.current;
    wasOverlayOpenRef.current = false;

    const isFreshChat = lastChatFileRef.current !== activeChatFile;
    if (isFreshChat) {
      lastChatFileRef.current = activeChatFile;
    }

    const prevCount = lastRenderedCountRef.current;
    const prevTailId = lastTailMsgIdRef.current;
    const nextTail = messages.length > 0 ? messages[messages.length - 1] : null;
    const nextTailId = nextTail?.id ?? null;
    lastRenderedCountRef.current = messages.length;
    lastTailMsgIdRef.current = nextTailId;

    const userMessageAppended =
      messages.length > prevCount &&
      nextTailId !== prevTailId &&
      messages.slice(prevCount).some((m) => Boolean(m?.isUser));

    // Older messages were prepended: keep the reader's position untouched.
    //
    // The anchor effect above runs first (it is declared first) and clears
    // `prependAnchorRef`, so this effect can no longer see it. `skipAutoScrollRef`
    // is a separate, self-clearing latch owned by this effect, which survives
    // that ordering and reliably suppresses the jump to the bottom.
    if (branchSlideAnchorRef.current) {
      const { index: anchorIdx, prevBottom } = branchSlideAnchorRef.current;
      branchSlideAnchorRef.current = null;
      skipAutoScrollRef.current = false;

      const trackEl = streamTrackRef.current;
      if (trackEl) {
        trackEl.style.transition = 'none';
        trackEl.style.transform = 'none';
      }

      // Park scroll at the exact bottom so the new last message rests right above the composer
      isPinnedToBottomRef.current = true;
      programmaticScrollRef.current = true;
      el.scrollTop = el.scrollHeight;

      const nextSlotEl =
        el.querySelector(`[data-msg-index="${anchorIdx}"]`) ||
        el.querySelector('.bb-chat-viewport__slot--last');

      if (nextSlotEl && el.scrollHeight > el.clientHeight) {
        // Ensure the new last card's bottom edge sits flush at the composer edge (20px stream padding)
        const targetComposerEdge = el.getBoundingClientRect().bottom - 20;
        const measuredBottom = nextSlotEl.getBoundingClientRect().bottom;
        if (Math.abs(measuredBottom - targetComposerEdge) > 1) {
          el.scrollTop += measuredBottom - targetComposerEdge;
        }
      }

      lastScrollTopRef.current = el.scrollTop;
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });

      applyStreamEdgeClasses(el, el.scrollTop > 1, false);
      setShowJumpBottom((prev) => (prev ? false : prev));

      if (trackEl && nextSlotEl) {
        const nextBottom = nextSlotEl.getBoundingClientRect().bottom;
        const deltaY = prevBottom - nextBottom;

        if (Math.abs(deltaY) > 2) {
          branchSlidingRef.current = true;
          trackEl.style.transform = `translate3d(0, ${deltaY}px, 0)`;
          void trackEl.offsetHeight;

          const rafSlide = requestAnimationFrame(() => {
            trackEl.style.transition =
              'transform 300ms cubic-bezier(0.22, 1, 0.36, 1)';
            trackEl.style.transform = 'translate3d(0, 0, 0)';
          });

          if (branchSettleTimerRef.current) {
            clearTimeout(branchSettleTimerRef.current);
          }
          branchSettleTimerRef.current = setTimeout(() => {
            if (streamTrackRef.current) {
              streamTrackRef.current.style.transition = '';
              streamTrackRef.current.style.transform = '';
            }
            branchSlidingRef.current = false;
          }, 320);

          return () => cancelAnimationFrame(rafSlide);
        }
      }
      branchSlidingRef.current = false;
      return undefined;
    }

    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return undefined;
    }

    const generationJustStarted = !wasGeneratingRef.current && Boolean(isGenerating);
    wasGeneratingRef.current = Boolean(isGenerating);

    const autoScrollEnabled =
      getCustomizationRuntimeSnapshot()?.chatAndAi?.autoScrollOnStream !== false;

    const forceSnapToBottom =
      isFreshChat || returnedFromOverlay || userMessageAppended;

    if (forceSnapToBottom) {
      isPinnedToBottomRef.current = true;
      smoothJumpActiveRef.current = false;
    } else if (generationJustStarted && autoScrollEnabled) {
      const distBeforeStart = Math.max(
        0,
        el.scrollHeight - el.scrollTop - el.clientHeight,
      );
      if (distBeforeStart <= JUMP_BOTTOM_THRESHOLD_PX) {
        isPinnedToBottomRef.current = true;
        smoothJumpActiveRef.current = false;
      }
    }

    if (!forceSnapToBottom && (!isPinnedToBottomRef.current || !autoScrollEnabled)) {
      syncScrollEdges(el);
      return undefined;
    }

    cancelPendingAutoScroll();
    applyProgrammaticScrollToBottom(el);

    autoScrollRafRef.current.outer = requestAnimationFrame(() => {
      autoScrollRafRef.current.outer = 0;
      if (!forceSnapToBottom && !isPinnedToBottomRef.current) {
        syncScrollEdges(el);
        return;
      }
      applyProgrammaticScrollToBottom(el);
      autoScrollRafRef.current.inner = requestAnimationFrame(() => {
        autoScrollRafRef.current.inner = 0;
        if (!forceSnapToBottom && !isPinnedToBottomRef.current) {
          syncScrollEdges(el);
          return;
        }
        applyProgrammaticScrollToBottom(el);
      });
    });

    return () => cancelPendingAutoScroll();
  }, [
    messages,
    isGenerating,
    activeChatFile,
    chatListOpen,
    timelinesOpen,
    resolvedStreamRef,
    cancelPendingAutoScroll,
    applyProgrammaticScrollToBottom,
    applyStreamEdgeClasses,
    syncScrollEdges,
  ]);

  const lastMessageItem = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastSwipeTrackKey = lastMessageItem
    ? `${activeChatFile || 'demo'}:${lastMessageItem.index ?? ''}:${
        lastMessageItem.swipes && !activeChatFile
          ? demoSwipeIdx
          : lastMessageItem.swipeId ?? 0
      }:${lastMessageItem.swipeCount ?? 1}`
    : '';

  // Detect any upward user scroll gesture immediately (wheel, trackpad, touch,
  // or navigation keys) so streaming detaches before the next animation frame.
  useEffect(() => {
    const streamEl = resolvedStreamRef.current;
    if (!streamEl) return undefined;

    const handleUserWheel = (e) => {
      if (e.deltaY < 0) {
        detachFromBottom();
      }
    };
    let lastTouchY = null;
    const handleTouchStart = (e) => {
      lastTouchY = e.touches?.[0]?.clientY ?? null;
    };
    const handleTouchMove = (e) => {
      const y = e.touches?.[0]?.clientY ?? null;
      if (y !== null && lastTouchY !== null && y - lastTouchY > 2) {
        detachFromBottom();
      }
      lastTouchY = y;
    };
    const handleKeyScroll = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'PageUp' || e.key === 'Home' || e.key === 'ArrowUp') {
        detachFromBottom();
      }
    };

    streamEl.addEventListener('wheel', handleUserWheel, { passive: true });
    streamEl.addEventListener('touchstart', handleTouchStart, { passive: true });
    streamEl.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('keydown', handleKeyScroll);

    return () => {
      streamEl.removeEventListener('wheel', handleUserWheel);
      streamEl.removeEventListener('touchstart', handleTouchStart);
      streamEl.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('keydown', handleKeyScroll);
    };
  }, [resolvedStreamRef, detachFromBottom, chatListOpen, timelinesOpen]);

  // Follow smooth card height expansion frame-by-frame during generation
  // (including Reasoning box appearance/expansion & CSS transitions) and during
  // swipe height transitions while pinned to the bottom; when unpinned, keep
  // scroll edge fades and the Jump-to-Latest button synced in real time.
  useEffect(() => {
    const streamEl = resolvedStreamRef.current;
    const trackEl = streamTrackRef.current;
    if (!streamEl || !trackEl) return undefined;

    let activeFollow = Boolean(isGenerating);
    let settleTimer = null;

    if (!isGenerating && isPinnedToBottomRef.current) {
      activeFollow = true;
      settleTimer = setTimeout(() => {
        activeFollow = false;
      }, 350);
    }

    const ro = new ResizeObserver(() => {
      if (prependAnchorRef.current || branchSlidingRef.current) {
        return;
      }
      const autoScrollEnabled =
        getCustomizationRuntimeSnapshot()?.chatAndAi?.autoScrollOnStream !== false;

      if (activeFollow && isPinnedToBottomRef.current && autoScrollEnabled) {
        const dist =
          streamEl.scrollHeight - streamEl.scrollTop - streamEl.clientHeight;
        if (dist > 0.5) {
          applyProgrammaticScrollToBottom(streamEl);
          return;
        }
      }

      syncScrollEdges(streamEl);
    });
    ro.observe(trackEl);
    ro.observe(streamEl);

    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      ro.disconnect();
    };
  }, [
    isGenerating,
    lastSwipeTrackKey,
    resolvedStreamRef,
    applyProgrammaticScrollToBottom,
    syncScrollEdges,
  ]);

  const scrollToLatest = useCallback(() => {
    isPinnedToBottomRef.current = true;
    smoothJumpActiveRef.current = true;
    const el = resolvedStreamRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    applyStreamEdgeClasses(el, true, false);
  }, [resolvedStreamRef, applyStreamEdgeClasses]);

  const handleCloseComposerEmoji = useCallback(() => {
    setComposerEmojiOpen(false);
  }, []);

  const handleToggleComposerEmoji = useCallback(() => {
    setComposerEmojiOpen((prev) => {
      if (!prev) {
        resolvedComposerRef.current?.captureSelection?.();
        if (isMobile) {
          resolvedComposerRef.current?.blurInput?.();
          setConsoleOpen(false);
        }
        return true;
      }
      if (isMobile) {
        window.requestAnimationFrame(() => {
          resolvedComposerRef.current?.focusKeyboard?.();
        });
      }
      return false;
    });
  }, [isMobile, resolvedComposerRef, setConsoleOpen]);

  const handleInsertComposerEmoji = useCallback(
    (emoji) => {
      resolvedComposerRef.current?.insertEmoji?.(emoji);
    },
    [resolvedComposerRef],
  );

  const handleFocusComposerKeyboard = useCallback(() => {
    resolvedComposerRef.current?.focusKeyboard?.();
  }, [resolvedComposerRef]);

  const handleToggleConsole = useCallback(() => {
    const streamEl = resolvedStreamRef.current;
    const wasNearBottom = streamEl
      ? streamEl.scrollHeight - streamEl.scrollTop - streamEl.clientHeight < 72
      : false;

    setConsoleOpen((prev) => {
      const next = !prev;
      if (next && isMobile) {
        setComposerEmojiOpen(false);
      }
      if (next && wasNearBottom && streamEl) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            streamEl.scrollTop = streamEl.scrollHeight;
          });
        });
      }
      return next;
    });
  }, [isMobile, resolvedStreamRef, setConsoleOpen]);

  useEffect(() => {
    if (!hasActiveScenario || !activeChatFile || switchingScenario) return;
    const key = `${characterName || 'Scenario'}::${activeChatFile}`;
    if (!prevLoggedChatKeyRef.current) {
      prevLoggedChatKeyRef.current = key;
      return;
    }
    if (prevLoggedChatKeyRef.current === key) return;
    prevLoggedChatKeyRef.current = key;
    postClientConsoleLog({
      category: 'change',
      level: 'info',
      scope: 'Workspace',
      title: `Opened chat "${activeChatFile}"`,
      summary: `Scenario: ${characterName || 'Character'}`,
    }).catch(() => {});
  }, [hasActiveScenario, activeChatFile, characterName, switchingScenario]);

  useEffect(() => {
    if (!isGenerating || !onStopGeneration) return undefined;
    const onWinKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onStopGeneration();
      }
    };
    window.addEventListener('keydown', onWinKeyDown);
    return () => window.removeEventListener('keydown', onWinKeyDown);
  }, [isGenerating, onStopGeneration]);

  // Keyboard swipe navigation (`ArrowLeft` / `ArrowRight`) on the last message when focus is outside inputs
  useEffect(() => {
    if (isGenerating || chatListOpen || timelinesOpen || messages.length === 0) {
      return undefined;
    }
    const onArrowKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('.bb-modal-backdrop')) return;
      if (window.getSelection?.()?.toString()) return;

      const lastMsg = messages[messages.length - 1];
      if (!lastMsg || lastMsg.isUser) return;

      const total =
        lastMsg.swipes && !activeChatFile
          ? lastMsg.swipes.length
          : Math.max(1, Number(lastMsg.swipeCount ?? 1));
      const cur =
        lastMsg.swipes && !activeChatFile
          ? demoSwipeIdx % lastMsg.swipes.length
          : Math.max(0, Math.min(Number(lastMsg.swipeId ?? 0), total - 1));

      if (e.key === 'ArrowLeft') {
        if (cur > 0 && onSwipeMessage) {
          e.preventDefault();
          onSwipeMessage({ ...lastMsg, swipeId: cur, swipeCount: total }, cur - 1);
        }
      } else if (e.key === 'ArrowRight') {
        if (cur < total - 1 && onSwipeMessage) {
          e.preventDefault();
          onSwipeMessage({ ...lastMsg, swipeId: cur, swipeCount: total }, cur + 1);
        } else if (lastMsg.index > 0 && onGenerateSwipe) {
          e.preventDefault();
          onGenerateSwipe({ ...lastMsg, swipeId: cur, swipeCount: total });
        }
      }
    };

    window.addEventListener('keydown', onArrowKey);
    return () => window.removeEventListener('keydown', onArrowKey);
  }, [
    isGenerating,
    chatListOpen,
    timelinesOpen,
    messages,
    activeChatFile,
    demoSwipeIdx,
    onSwipeMessage,
    onGenerateSwipe,
  ]);

  const selectableMsgIndices = useMemo(() => {
    if (!activeChatFile || !Array.isArray(messages)) return [];
    const out = [];
    for (let i = 0; i < messages.length; i += 1) {
      const m = messages[i];
      if (!m || m.isStreaming) continue;
      const mIdx = m.index !== undefined ? m.index : i;
      if (Number.isInteger(mIdx) && mIdx >= 0) {
        out.push(mIdx);
      }
    }
    return out;
  }, [activeChatFile, messages]);

  const selectedMsgSet = useMemo(
    () => new Set(selectedMsgIndices),
    [selectedMsgIndices],
  );

  const handleExitMsgMultiSelect = useCallback(() => {
    setMsgMultiSelectActive(false);
    setSelectedMsgIndices([]);
    setLastMsgSelectClick({ index: null, selected: true });
    setMsgDeleteConfirm(null);
  }, []);

  useEffect(() => {
    handleExitMsgMultiSelect();
  }, [activeChatFile, characterName, handleExitMsgMultiSelect]);

  useEffect(() => {
    if ((timelinesOpen || isGenerating) && msgMultiSelectActive) {
      handleExitMsgMultiSelect();
    }
  }, [timelinesOpen, isGenerating, msgMultiSelectActive, handleExitMsgMultiSelect]);

  useEffect(() => {
    if (!msgMultiSelectActive) return;
    const valid = new Set(selectableMsgIndices);
    setSelectedMsgIndices((prev) => {
      const filtered = prev.filter((idx) => valid.has(idx));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [msgMultiSelectActive, selectableMsgIndices]);

  useEffect(() => {
    if (!msgMultiSelectActive || msgDeleteConfirm) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleExitMsgMultiSelect();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [msgMultiSelectActive, msgDeleteConfirm, handleExitMsgMultiSelect]);

  const isGeneratingRef = useRef(isGenerating);
  isGeneratingRef.current = isGenerating;

  const handleEnterMsgMultiSelect = useCallback((mIdx) => {
    if (isGeneratingRef.current || !Number.isInteger(mIdx)) return;
    setMsgMultiSelectActive(true);
    setSelectedMsgIndices([mIdx]);
    setLastMsgSelectClick({ index: mIdx, selected: true });
  }, []);

  const handleDeleteSingleMessage = useCallback(
    (mIdx) => {
      if (getCustomizationRuntimeSnapshot()?.chatAndAi?.confirmMessageDelete !== false) {
        setMsgDeleteConfirm([mIdx]);
        return;
      }
      if (onDeleteMessage) {
        onDeleteMessage(mIdx, false);
      }
    },
    [onDeleteMessage],
  );

  const handleToggleMsgMultiSelect = useCallback(
    (mIdx, { shiftKey = false } = {}) => {
      if (!Number.isInteger(mIdx)) return;
      if (!msgMultiSelectActive) {
        setMsgMultiSelectActive(true);
      }
      setSelectedMsgIndices((prev) => {
        const set = new Set(prev);
        const targetState = !set.has(mIdx);
        if (shiftKey && lastMsgSelectClick.index !== null) {
          const a = selectableMsgIndices.indexOf(lastMsgSelectClick.index);
          const b = selectableMsgIndices.indexOf(mIdx);
          if (a !== -1 && b !== -1) {
            const [start, end] = a < b ? [a, b] : [b, a];
            for (let i = start; i <= end; i += 1) {
              if (lastMsgSelectClick.selected) set.add(selectableMsgIndices[i]);
              else set.delete(selectableMsgIndices[i]);
            }
            return Array.from(set).sort((x, y) => x - y);
          }
        }
        if (targetState) set.add(mIdx);
        else set.delete(mIdx);
        setLastMsgSelectClick({ index: mIdx, selected: targetState });
        return Array.from(set).sort((x, y) => x - y);
      });
    },
    [msgMultiSelectActive, lastMsgSelectClick, selectableMsgIndices],
  );

  const allLoadedMsgsSelected = useMemo(() => {
    if (selectableMsgIndices.length === 0) return false;
    return selectableMsgIndices.every((idx) => selectedMsgSet.has(idx));
  }, [selectableMsgIndices, selectedMsgSet]);

  const handleToggleSelectAllMsgs = useCallback(() => {
    if (allLoadedMsgsSelected) {
      setSelectedMsgIndices([]);
    } else {
      setSelectedMsgIndices([...selectableMsgIndices]);
    }
  }, [allLoadedMsgsSelected, selectableMsgIndices]);

  const handleConfirmDeleteMsgs = useCallback(async () => {
    if (
      !Array.isArray(msgDeleteConfirm) ||
      msgDeleteConfirm.length === 0 ||
      deletingMsgs
    ) {
      return;
    }
    setDeletingMsgs(true);
    try {
      let ok = false;
      if (onDeleteMessagesBatch) {
        ok = await onDeleteMessagesBatch(msgDeleteConfirm);
      } else if (onDeleteMessage) {
        const desc = [...msgDeleteConfirm].sort((a, b) => b - a);
        for (const mIdx of desc) {
          await onDeleteMessage(mIdx, false);
        }
        ok = true;
      }
      if (ok !== false) {
        handleExitMsgMultiSelect();
      }
    } finally {
      setDeletingMsgs(false);
    }
  }, [
    msgDeleteConfirm,
    deletingMsgs,
    onDeleteMessagesBatch,
    onDeleteMessage,
    handleExitMsgMultiSelect,
  ]);

  const [timelinesMounted, setTimelinesMounted] = useState(Boolean(timelinesOpen));
  const [timelinesAnimState, setTimelinesAnimState] = useState(() =>
    timelinesOpen ? 'open' : 'closed',
  );

  useEffect(() => {
    if (timelinesOpen) {
      setTimelinesMounted(true);
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setTimelinesAnimState('open');
        });
      });
      return () => {
        cancelAnimationFrame(raf1);
        if (raf2) cancelAnimationFrame(raf2);
      };
    }

    setTimelinesAnimState((prev) => (prev === 'closed' ? 'closed' : 'closing'));
    const timer = setTimeout(() => {
      setTimelinesMounted(false);
      setTimelinesAnimState('closed');
    }, 200);
    return () => clearTimeout(timer);
  }, [timelinesOpen]);

  const allTimelineChats = timelineChats.length > 0 ? timelineChats : chatFiles;

  const resolvedTimelineForest = useMemo(
    () => timelineForest || buildTimelineForest(allTimelineChats),
    [timelineForest, allTimelineChats],
  );

  const parentChatInfo = useMemo(() => {
    if (
      !activeChatFile ||
      !resolvedTimelineForest ||
      resolvedTimelineForest.byFile.size === 0
    ) {
      return null;
    }
    let currentNode = resolvedTimelineForest.byFile.get(activeChatFile) || null;
    if (!currentNode) {
      const targetLower = activeChatFile.toLowerCase();
      for (const n of resolvedTimelineForest.byFile.values()) {
        if (String(n.fileName || '').toLowerCase() === targetLower) {
          currentNode = n;
          break;
        }
      }
    }
    if (!currentNode || !currentNode.parentFile) return null;
    const parentNode = resolvedTimelineForest.byFile.get(currentNode.parentFile);
    if (!parentNode) return null;
    const label = parentNode.branchLabel || parentNode.baseTitle || parentNode.fileName;
    return {
      fileName: parentNode.fileName,
      label,
    };
  }, [activeChatFile, resolvedTimelineForest]);

  const handleReturnToParentChat = useCallback(() => {
    if (!parentChatInfo?.fileName || !onSelectChatFile) return;
    onSelectChatFile(parentChatInfo.fileName);
  }, [parentChatInfo, onSelectChatFile]);

  useEffect(() => {
    if (chatListOpen || timelinesOpen) {
      setComposerEmojiOpen(false);
    }
  }, [chatListOpen, timelinesOpen]);

  return (
    <section
      id="sheld"
      className={`bb-chat-viewport ${timelinesOpen ? 'is-timelines-active' : ''} ${
        isMobile && composerEmojiOpen ? 'is-emoji-tray-open' : ''
      } ${consoleOpen && !chatListOpen && !timelinesOpen ? 'is-console-open' : ''}`.trim()}
    >
      {timelinesMounted && (
        <div
          className={`bb-chat-viewport__timelines-layer ${
            timelinesAnimState === 'open'
              ? 'is-open'
              : timelinesAnimState === 'closing'
                ? 'is-closing'
                : 'is-entering'
          }`.trim()}
          style={{
            paddingLeft: leftTomeInset > 0 ? `${leftTomeInset}px` : undefined,
            paddingRight: rightTomeInset > 0 ? `${rightTomeInset}px` : undefined,
          }}
          aria-hidden={!timelinesOpen}
        >
          <Suspense
            fallback={
              <ProgressIndicator
                variant="linear"
                size="sm"
                overlay="top"
                ariaLabel="Loading timeline graph"
              />
            }
          >
            <LazyTimelineTree
              chats={allTimelineChats}
              activeChatFile={activeChatFile}
              focusRequest={focusedTimelineRequest}
              onFocusChange={onTimelineFocusChange}
              loading={loadingTimelines}
              characterName={characterName}
              characterAvatarUrl={characterAvatarUrl}
              characterInitials={characterInitials}
              defaultPersonaName={personaName}
              defaultPersonaAvatarUrl={personaAvatarUrl}
              shaderStyle={shaderStyle}
              shaderIntensity={shaderIntensity}
              lowGpu={lowGpu}
              onSelectChatFile={onSelectChatFile}
            />
          </Suspense>
        </div>
      )}

      <div className="bb-chat-viewport__stage" aria-hidden={timelinesOpen || undefined}>
        {loadingChat && !switchingScenario && messages.length > 0 && !chatMetaStats.hasMoreOlder && (
          <ProgressIndicator
            variant="linear"
            size="sm"
            overlay="top"
            ariaLabel="Switching timeline"
            className="bb-chat-viewport__top-progress"
          />
        )}
        <div
          ref={resolvedStreamRef}
          className={`bb-chat-viewport__stream bb-scrollbar--hidden ${
            msgMultiSelectActive ? 'has-multiselect-bar' : ''
          }`.trim()}
          onScroll={handleScroll}
        >
        <div ref={streamTrackRef} className="bb-chat-viewport__track">
        {chatMetaStats.hasMoreOlder && !switchingScenario && (
          <div className="bb-chat-viewport__tail-banner">
            <span className="bb-caption-text">
              Tail-First Window: showing messages{' '}
              <strong>#{(chatMetaStats.startIndex || 0) + 1}</strong>–
              <strong>#{chatMetaStats.endIndex || messages.length}</strong> of{' '}
              <strong>{chatMetaStats.totalMessages}</strong> ({chatMetaStats.olderCount}{' '}
              older on disk)
            </span>
            {loadingChat && (
              <span className="bb-chat-viewport__tail-loading">
                <ProgressIndicator variant="circular" size="xs" ariaLabel="Loading older messages" />
                Loading...
              </span>
            )}
          </div>
        )}

        {(switchingScenario || (loadingChat && messages.length === 0)) ? (
          <div className="bb-chat-viewport__loading-stage" role="status" aria-live="polite">
            <ProgressIndicator
              variant="linear"
              size="sm"
              label={`Opening ${characterName}...`}
            />
            <SkeletonMessage isUser={false} dimmed lines={4} />
            <SkeletonMessage isUser={true} lines={2} />
          </div>
        ) : messages.length === 0 && !loadingChat && !hasActiveScenario ? (
          <div className="bb-chat-viewport__empty-stage">
            <BrandLogo size={42} badge />
            <div className="bb-chat-viewport__empty-title">No Scenario Open</div>
            <p className="bb-chat-viewport__empty-sub">
              Create a new scenario card or import a SillyTavern PNG / JSON card to start roleplaying.
            </p>
            {(onOpenCreateScenario || onOpenImportScenario) && (
              <div className="bb-chat-viewport__empty-actions">
                {onOpenCreateScenario && (
                  <Button
                    variant="b1"
                    size="sm"
                    emphasis="filled"
                    icon="plus"
                    onClick={onOpenCreateScenario}
                  >
                    Create Scenario
                  </Button>
                )}
                {onOpenImportScenario && (
                  <Button
                    variant="b1"
                    size="sm"
                    emphasis="outlined"
                    icon="upload"
                    onClick={onOpenImportScenario}
                  >
                    Import Card
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
        messages.map((mes, idx) => {
          const isLast = idx === messages.length - 1;
          const isDemoSwipes = Boolean(mes.swipes && !activeChatFile);
          const resolvedIdx = mes.index !== undefined ? mes.index : idx;
          const totalSwipes = isDemoSwipes ? mes.swipes.length : mes.swipeCount || 1;
          const currentSwipeIdx = isDemoSwipes
            ? demoSwipeIdx % mes.swipes.length
            : mes.swipeId || 0;
          const hasActions = Boolean(activeChatFile && mes.index !== undefined);

          const normalizedMessage =
            !isDemoSwipes &&
            mes.index === resolvedIdx &&
            (mes.swipeId ?? 0) === currentSwipeIdx &&
            (mes.swipeCount ?? 1) === totalSwipes
              ? mes
              : {
                  ...mes,
                  index: resolvedIdx,
                  text: isDemoSwipes ? mes.swipes[currentSwipeIdx] : mes.text,
                  swipeId: currentSwipeIdx,
                  swipeCount: totalSwipes,
                };

          const messageDepth = Math.max(0, messages.length - 1 - idx);
          const cardElement = (
            <ChatMessageCard
              message={normalizedMessage}
              chatScopeKey={activeChatFile || characterName || 'demo'}
              depth={messageDepth}
              isLast={isLast}
              dimmed={!isLast}
              userName={personaName}
              userAvatarUrl={personaAvatarUrl}
              charName={characterName}
              charAvatarUrl={characterAvatarUrl}
              charInitials={characterInitials}
              onSwipe={isLast ? onSwipeMessage : undefined}
              onGenerateSwipe={isLast ? onGenerateSwipe : undefined}
              onContinue={isLast && !normalizedMessage.isUser ? onContinueMessage : undefined}
              onDeleteSwipe={hasActions ? onDeleteSwipe : undefined}
              onSaveEdit={hasActions ? onSaveEditedMessage : undefined}
              onRemoveAttachment={onRemoveMessageAttachment}
              onDelete={hasActions && onDeleteMessage ? handleDeleteSingleMessage : undefined}
              onCreateBranch={
                onCreateBranch ? handleTriggerCreateBranch : undefined
              }
              onReturnToParentChat={
                isLast && parentChatInfo && onSelectChatFile
                  ? handleReturnToParentChat
                  : undefined
              }
              parentChatLabel={parentChatInfo?.label || ''}
              multiSelectActive={msgMultiSelectActive && hasActions}
              multiSelected={selectedMsgSet.has(normalizedMessage.index)}
              onEnterMultiSelect={
                hasActions && (onDeleteMessagesBatch || onDeleteMessage)
                  ? handleEnterMsgMultiSelect
                  : undefined
              }
              onToggleMultiSelect={
                hasActions ? handleToggleMsgMultiSelect : undefined
              }
              recapCompressDepth={recapCompressDepth}
            />
          );

          const isBranchAnchor =
            branchingAtIndex !== null && normalizedMessage.index === branchingAtIndex;
          const isBranchExit =
            branchingAtIndex !== null && normalizedMessage.index > branchingAtIndex;
          const branchAnimClass = isBranchAnchor
            ? 'bb-chat-viewport__slot--branch-anchor'
            : isBranchExit
              ? 'bb-chat-viewport__slot--branch-exit'
              : '';

          return isLast ? (
            <div
              key={mes.id}
              data-msg-index={normalizedMessage.index}
              className={`bb-chat-viewport__slot--last ${branchAnimClass}`.trim()}
            >
              <PearlescentShader
                variant="last-message"
                shaderStyle={shaderStyle}
                intensity={shaderIntensity}
                speed={0.283}
                paused={Boolean(timelinesOpen || chatListOpen)}
                lowGpu={lowGpu}
              >
                {cardElement}
              </PearlescentShader>
            </div>
          ) : (
            <div
              key={mes.id}
              data-msg-index={normalizedMessage.index}
              className={`bb-chat-viewport__slot ${branchAnimClass}`.trim()}
            >
              {cardElement}
            </div>
          );
        })
        )}
        </div>
        </div>

        <ScrollIndicator scrollRef={resolvedStreamRef} />

        {showJumpBottom && !msgMultiSelectActive && (
          <button
            type="button"
            className="bb-chat-viewport__jump-bottom"
            onClick={scrollToLatest}
            title="Scroll to latest message"
            aria-label="Scroll to latest message"
          >
            <Icon name="doubleChevronDown" size={18} />
          </button>
        )}

        <MultiSelectBar
          open={msgMultiSelectActive}
          count={selectedMsgIndices.length}
          totalSelectable={selectableMsgIndices.length}
          allSelected={allLoadedMsgsSelected}
          onSelectAll={handleToggleSelectAllMsgs}
          onClear={() => setSelectedMsgIndices([])}
          onClose={handleExitMsgMultiSelect}
          inlineActions
          className="bb-chat-viewport__msg-multiselect"
          actions={[
            {
              id: 'delete-messages',
              label: 'Delete',
              icon: 'trash',
              danger: true,
              title: 'Delete selected messages',
              onClick: () => setMsgDeleteConfirm([...selectedMsgIndices]),
            },
          ]}
        />

        <ToastStack
          toasts={composerToasts}
          onDismiss={onDismissComposerToast}
          placement="composer"
        />
      </div>

      <ChatComposer
        ref={resolvedComposerRef}
        hasActiveScenario={hasActiveScenario}
        isGenerating={isGenerating}
        switchingScenario={switchingScenario}
        loadingChat={loadingChat}
        characterName={characterName}
        isMobile={isMobile}
        emojiOpen={composerEmojiOpen}
        emojiBtnRef={composerEmojiBtnRef}
        onToggleEmoji={handleToggleComposerEmoji}
        onCloseEmoji={handleCloseComposerEmoji}
        consoleOpen={consoleOpen}
        onToggleConsole={handleToggleConsole}
        onSendMessage={onSendMessage}
        onStopGeneration={onStopGeneration}
        modelLabel={modelLabel}
        hubConnections={hubConnections}
        hubCustomFamilies={hubCustomFamilies}
        activeProviderId={activeProviderId}
        activeModelId={activeModelId}
        activeModelName={activeModelName}
        onSelectHubModel={onSelectHubModel}
        onUpdateHubConnection={onUpdateHubConnection}
        onFetchHubModels={onFetchHubModels}
        onDeleteHubConnection={onDeleteHubConnection}
        onRevealHubKey={onRevealHubKey}
        onPingHubConnections={onPingHubConnections}
        onFetchHubTelemetry={onFetchHubTelemetry}
        onAddHubCustomFamily={onAddHubCustomFamily}
        onDeleteHubCustomFamily={onDeleteHubCustomFamily}
        onClickModelBadge={onClickModelBadge}
        personas={personas}
        activePersonaAvatar={activePersonaAvatar}
        personaName={personaName}
        personaAvatarUrl={personaAvatarUrl}
        cards={cards}
        groups={groups}
        activeCharacter={activeCharacter}
        hasUserMessages={hasUserMessages}
        userMessageCount={userMessageCount}
        onSelectPersona={onSelectPersona}
        onConfirmReplacePersonaInChat={onConfirmReplacePersonaInChat}
        onToggleBindPersonaToActiveCard={onToggleBindPersonaToActiveCard}
        onOpenManagePersonaModal={onOpenManagePersonaModal}
        onOpenCreatePersonaModal={onOpenCreatePersonaModal}
        onDuplicatePersona={onDuplicatePersona}
        onDeletePersona={onDeletePersona}
        onClickPersonaBadge={onClickPersonaBadge}
      />
      {consoleOpen && !chatListOpen && !timelinesOpen && (
        <Suspense fallback={null}>
          <LazyConsoleDrawer
            open
            entries={consoleEntries}
            connected={consoleConnected}
            onClear={clearConsoleLogs}
            onClose={() => setConsoleOpen(false)}
          />
        </Suspense>
      )}

      <EmojiPicker
        open={composerEmojiOpen}
        onOpenChange={setComposerEmojiOpen}
        anchorRef={composerEmojiBtnRef}
        placement="top-end"
        mobileInlineDock
        onRequestKeyboard={handleFocusComposerKeyboard}
        onSelect={handleInsertComposerEmoji}
      />

      <Modal
        open={Boolean(msgDeleteConfirm?.length)}
        onClose={() => !deletingMsgs && setMsgDeleteConfirm(null)}
        title={
          msgDeleteConfirm?.length === 1
            ? 'Delete Selected Message'
            : `Delete ${msgDeleteConfirm?.length || 0} Selected Messages`
        }
        subtitle="A backup of the .jsonl chat file will be saved automatically"
        icon="trash"
        width={440}
        footer={
          <>
            <Button
              variant="b1"
              emphasis="outlined"
              disabled={deletingMsgs}
              onClick={() => setMsgDeleteConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              variant="b4"
              icon="trash"
              disabled={deletingMsgs}
              onClick={handleConfirmDeleteMsgs}
            >
              {deletingMsgs
                ? 'Deleting...'
                : msgDeleteConfirm?.length === 1
                  ? 'Delete Message'
                  : `Delete (${msgDeleteConfirm?.length || 0})`}
            </Button>
          </>
        }
      >
        {msgDeleteConfirm?.length > 0 && (
          <p className="bb-caption-text">
            {msgDeleteConfirm.length === 1 ? (
              <>
                Are you sure you want to permanently remove message{' '}
                <strong>#{msgDeleteConfirm[0] + 1}</strong> from the current chat?
              </>
            ) : (
              <>
                Are you sure you want to permanently remove{' '}
                <strong>{msgDeleteConfirm.length}</strong> selected messages from the
                current chat?
              </>
            )}
          </p>
        )}
      </Modal>
    </section>
  );
}
