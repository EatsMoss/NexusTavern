import React, { useState, useRef, useLayoutEffect, useEffect, useCallback, useMemo } from 'react';
import {
  Icon,
  BrandLogo,
  ProgressIndicator,
  SkeletonMessage,
  Button,
  Checkbox,
  KebabMenu,
  MultiSelectBar,
  Modal,
  PearlescentShader,
  ChatMessageCard,
  TimelineTree,
  ScrollIndicator,
  ConnectionModelPicker,
  PersonaPicker,
  EmojiPicker,
  AttachmentTray,
  ToastStack,
  ConsoleDrawer,
  ConsoleToggleButton,
} from '@ui/index.js';
import { useViewport } from '@core/hooks/useViewport.js';
import { buildTimelineForest } from '@core/chats/timelineForest.js';
import { postClientConsoleLog } from '@core/system/consoleApi.js';
import { useConsoleStream } from './useConsoleStream.js';
import './ChatViewport.css';

function parseEmbeddedChatTimestamp(fileName = '') {
  const m = String(fileName).match(
    /(\d{4})-(\d{1,2})-(\d{1,2})\s*@\s*(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s(?:\s*(\d{1,3})ms)?/,
  );
  if (!m) return 0;
  const ts = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
    Number(m[7] || 0),
  ).getTime();
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
}

function resolveChatTimestampMs(chat) {
  if (!chat) return 0;
  if (typeof chat.sortTimestampMs === 'number' && chat.sortTimestampMs > 0) {
    return chat.sortTimestampMs;
  }
  const embedded = parseEmbeddedChatTimestamp(chat.fileName);
  if (embedded > 0) return embedded;
  if (typeof chat.lastModifiedMs === 'number' && chat.lastModifiedMs > 0) {
    return chat.lastModifiedMs;
  }
  return 0;
}

function formatChatDateBadge(chat) {
  const ts = resolveChatTimestampMs(chat);
  if (!ts) return chat?.lastSendDate || 'Unknown date';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return chat?.lastSendDate || 'Saved';
  }
}

function cleanChatPreview(raw = '') {
  if (!raw) return '';
  return String(raw)
    .replace(/<(?:think|thinking|reasoning)>[\s\S]*?<\/(?:think|thinking|reasoning)>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

const CHAT_LIST_BATCH_SIZE = 30;
const CHAT_LIST_BOTTOM_THRESHOLD_PX = 160;
const ENTER_TO_SEND_STORAGE_KEY = 'nexustavern_enter_to_send_v1';

function loadEnterToSendPref() {
  try {
    const raw = localStorage.getItem(ENTER_TO_SEND_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== 'false';
  } catch {
    return true;
  }
}

export function ChatViewport({
  streamRef,
  isDemoCard = false,
  chatListOpen = false,
  timelinesOpen = false,
  timelineChats = [],
  loadingTimelines = false,
  focusedTimelineRequest = null,
  onTimelineFocusChange,
  leftTomeInset = 0,
  rightTomeInset = 0,
  chatFiles = [],
  totalChatsCount = null,
  hasMoreChats = false,
  loadingMoreChats = false,
  onLoadMoreChats,
  onSelectChatFile,
  onBranchChatFile,
  onDeleteChatFiles,
  onCloseChatList,
  onCloseTimelines,
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
  draftMsg = '',
  onChangeDraftMsg,
  pendingAttachments = [],
  onAddAttachments,
  onRemoveAttachment,
  onSendMessage,
  isGenerating = false,
  onStopGeneration,
  hasActiveScenario = true,
  switchingScenario = false,
  onOpenCreateScenario,
  onOpenImportScenario,
}) {
  const { isMobile } = useViewport();
  const internalStreamRef = useRef(null);
  const resolvedStreamRef = streamRef || internalStreamRef;
  const streamTrackRef = useRef(null);
  const chatListScrollRef = useRef(null);
  const chatListLoadGateRef = useRef(false);
  const textareaRef = useRef(null);
  const composerEmojiBtnRef = useRef(null);
  const attachFileInputRef = useRef(null);
  const composerSelectionRef = useRef(null);

  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const {
    entries: consoleEntries,
    connected: consoleConnected,
    clearLogs: clearConsoleLogs,
  } = useConsoleStream();
  const prevLoggedChatKeyRef = useRef('');
  const [composerDragOver, setComposerDragOver] = useState(false);
  const composerDragCounterRef = useRef(0);
  const [visibleChatsLimit, setVisibleChatsLimit] = useState(CHAT_LIST_BATCH_SIZE);
  const [chatMultiSelectActive, setChatMultiSelectActive] = useState(false);
  const [selectedChatFiles, setSelectedChatFiles] = useState([]);
  const [lastSelectedChatClick, setLastSelectedChatClick] = useState({
    fileName: null,
    selected: true,
  });
  const [chatDeleteConfirm, setChatDeleteConfirm] = useState(null); // string[] | null
  const [deletingChats, setDeletingChats] = useState(false);
  const [msgMultiSelectActive, setMsgMultiSelectActive] = useState(false);
  const [selectedMsgIndices, setSelectedMsgIndices] = useState([]);
  const [lastMsgSelectClick, setLastMsgSelectClick] = useState({
    index: null,
    selected: true,
  });
  const [msgDeleteConfirm, setMsgDeleteConfirm] = useState(null); // number[] | null
  const [deletingMsgs, setDeletingMsgs] = useState(false);
  const [enterToSend, setEnterToSend] = useState(() => loadEnterToSendPref());
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
  // Which stream edges currently have content scrolled underneath them. Drives
  // the gradient mask fade; both false means the stream rests at an edge.
  const [scrolledUnderTop, setScrolledUnderTop] = useState(false);
  const [scrolledUnderBottom, setScrolledUnderBottom] = useState(false);
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
  const AT_BOTTOM_THRESHOLD_PX = 16;

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
  }, [cancelPendingAutoScroll]);

  const applyProgrammaticScrollToBottom = useCallback((el) => {
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    lastScrollTopRef.current = el.scrollTop;
    setScrolledUnderTop(el.scrollTop > 1);
    setScrolledUnderBottom(false);
    setShowJumpBottom(false);
    if (programmaticClearRafRef.current) {
      cancelAnimationFrame(programmaticClearRafRef.current);
    }
    programmaticClearRafRef.current = requestAnimationFrame(() => {
      programmaticClearRafRef.current = 0;
      programmaticScrollRef.current = false;
    });
  }, []);

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
    lastScrollTopRef.current = currentTop;

    const distanceFromBottom = el.scrollHeight - currentTop - el.clientHeight;

    if (!programmaticScrollRef.current && !branchSlidingRef.current) {
      if (currentTop < prevTop - 0.5 && !smoothJumpActiveRef.current) {
        detachFromBottom();
      } else if (distanceFromBottom <= AT_BOTTOM_THRESHOLD_PX) {
        isPinnedToBottomRef.current = true;
        smoothJumpActiveRef.current = false;
      } else if (!smoothJumpActiveRef.current) {
        isPinnedToBottomRef.current = false;
      }
    }

    setShowJumpBottom(distanceFromBottom > 240);
    // Edge fades: content is faded at an edge only while something is scrolled
    // past it. A 1px tolerance keeps a resting edge fully solid despite
    // sub-pixel rounding.
    setScrolledUnderTop(currentTop > 1);
    setScrolledUnderBottom(distanceFromBottom > 1);

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

      setScrolledUnderTop(el.scrollTop > 1);
      setScrolledUnderBottom(false);
      setShowJumpBottom(false);

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

    const forceSnapToBottom =
      isFreshChat || returnedFromOverlay || userMessageAppended;

    if (forceSnapToBottom) {
      isPinnedToBottomRef.current = true;
      smoothJumpActiveRef.current = false;
    } else if (!isPinnedToBottomRef.current) {
      return undefined;
    }

    cancelPendingAutoScroll();
    applyProgrammaticScrollToBottom(el);

    autoScrollRafRef.current.outer = requestAnimationFrame(() => {
      autoScrollRafRef.current.outer = 0;
      if (!forceSnapToBottom && !isPinnedToBottomRef.current) return;
      applyProgrammaticScrollToBottom(el);
      autoScrollRafRef.current.inner = requestAnimationFrame(() => {
        autoScrollRafRef.current.inner = 0;
        if (!forceSnapToBottom && !isPinnedToBottomRef.current) return;
        applyProgrammaticScrollToBottom(el);
      });
    });

    return () => cancelPendingAutoScroll();
  }, [
    messages,
    activeChatFile,
    chatListOpen,
    timelinesOpen,
    resolvedStreamRef,
    cancelPendingAutoScroll,
    applyProgrammaticScrollToBottom,
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
  // and during swipe height transitions ONLY while pinned to the bottom,
  // keeping stationary swipe controls anchored under the cursor.
  useEffect(() => {
    const streamEl = resolvedStreamRef.current;
    const trackEl = streamTrackRef.current;
    if (!streamEl || !trackEl) return undefined;

    let active = Boolean(isGenerating);
    let settleTimer = null;

    if (!isGenerating && isPinnedToBottomRef.current) {
      active = true;
      settleTimer = setTimeout(() => {
        active = false;
      }, 300);
    }

    const ro = new ResizeObserver(() => {
      if (
        !active ||
        !isPinnedToBottomRef.current ||
        prependAnchorRef.current ||
        branchSlidingRef.current
      ) {
        return;
      }
      const dist =
        streamEl.scrollHeight - streamEl.scrollTop - streamEl.clientHeight;
      if (dist > 0.5) {
        applyProgrammaticScrollToBottom(streamEl);
      }
    });
    ro.observe(trackEl);

    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      ro.disconnect();
    };
  }, [
    isGenerating,
    lastSwipeTrackKey,
    resolvedStreamRef,
    applyProgrammaticScrollToBottom,
  ]);

  const scrollToLatest = useCallback(() => {
    isPinnedToBottomRef.current = true;
    smoothJumpActiveRef.current = true;
    const el = resolvedStreamRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    // The smooth scroll emits `scroll` events along the way, which settle the
    // fades; nudging the top edge immediately avoids a one-frame flash.
    setScrolledUnderTop(true);
    setScrolledUnderBottom(false);
  }, [resolvedStreamRef]);

  useLayoutEffect(() => {
    if (!draftMsg && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [draftMsg]);

  const captureComposerSelection = useCallback(() => {
    const ta = textareaRef.current;
    if (ta && document.activeElement === ta) {
      const sel = {
        start: ta.selectionStart ?? draftMsg.length,
        end: ta.selectionEnd ?? draftMsg.length,
      };
      composerSelectionRef.current = sel;
      return sel;
    }
    if (composerSelectionRef.current) {
      return {
        start: Math.min(composerSelectionRef.current.start, draftMsg.length),
        end: Math.min(composerSelectionRef.current.end, draftMsg.length),
      };
    }
    return { start: draftMsg.length, end: draftMsg.length };
  }, [draftMsg.length]);

  const handleTextareaChange = (e) => {
    const val = e.target.value;
    composerSelectionRef.current = {
      start: e.target.selectionStart ?? val.length,
      end: e.target.selectionEnd ?? val.length,
    };
    if (onChangeDraftMsg) {
      onChangeDraftMsg(val);
    }
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(160, ta.scrollHeight)}px`;
    }
  };

  const handleInsertComposerEmoji = useCallback(
    (emoji) => {
      const { start, end } = captureComposerSelection();
      const next = `${draftMsg.slice(0, start)}${emoji}${draftMsg.slice(end)}`;
      const cursor = start + emoji.length;
      composerSelectionRef.current = { start: cursor, end: cursor };
      onChangeDraftMsg?.(next);

      window.requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(160, ta.scrollHeight)}px`;
        const searchActive =
          document.activeElement &&
          document.activeElement.classList?.contains('bb-emoji-picker__search-input');
        if (!isMobile && !searchActive) {
          ta.focus();
          ta.setSelectionRange(cursor, cursor);
        }
      });
    },
    [captureComposerSelection, draftMsg, isMobile, onChangeDraftMsg],
  );

  const handleFocusComposerKeyboard = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const sel = composerSelectionRef.current || {
      start: draftMsg.length,
      end: draftMsg.length,
    };
    const start = Math.min(sel.start, draftMsg.length);
    const end = Math.min(sel.end, draftMsg.length);
    ta.focus();
    ta.setSelectionRange(start, end);
  }, [draftMsg.length]);

  const handleFileInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0 && onAddAttachments) {
      onAddAttachments(files);
    }
    e.target.value = '';
  };

  const handleTextareaPaste = (e) => {
    if (!hasActiveScenario || !onAddAttachments) return;
    const items = e.clipboardData?.items;
    const files = [];
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    } else if (e.clipboardData?.files?.length > 0) {
      files.push(...Array.from(e.clipboardData.files));
    }
    if (files.length > 0) {
      // Only prevent default if clipboard contains no plain text alongside the pasted file/screenshot
      const plainText = e.clipboardData?.getData('text/plain') || '';
      if (!plainText) {
        e.preventDefault();
      }
      onAddAttachments(files);
    }
  };

  const hasDraggedFiles = (e) =>
    Array.from(e.dataTransfer?.types || []).includes('Files');

  const handleComposerDragEnter = (e) => {
    if (!hasActiveScenario || !onAddAttachments || !hasDraggedFiles(e)) return;
    e.preventDefault();
    composerDragCounterRef.current += 1;
    setComposerDragOver(true);
  };

  const handleComposerDragOver = (e) => {
    if (!hasActiveScenario || !onAddAttachments || !hasDraggedFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!composerDragOver) setComposerDragOver(true);
  };

  const handleComposerDragLeave = (e) => {
    if (!hasDraggedFiles(e)) return;
    composerDragCounterRef.current = Math.max(0, composerDragCounterRef.current - 1);
    if (composerDragCounterRef.current === 0) {
      setComposerDragOver(false);
    }
  };

  const handleComposerDrop = (e) => {
    composerDragCounterRef.current = 0;
    setComposerDragOver(false);
    if (!hasActiveScenario || !onAddAttachments) return;
    const dropped = e.dataTransfer?.files;
    if (dropped && dropped.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      onAddAttachments(dropped);
    }
  };

  const handleToggleComposerEmoji = () => {
    if (!composerEmojiOpen) {
      captureComposerSelection();
      if (isMobile) {
        textareaRef.current?.blur();
        setConsoleOpen(false);
      }
      setComposerEmojiOpen(true);
    } else {
      setComposerEmojiOpen(false);
      if (isMobile) {
        window.requestAnimationFrame(() => {
          handleFocusComposerKeyboard();
        });
      }
    }
  };

  const handleToggleConsole = useCallback(() => {
    const streamEl = resolvedStreamRef.current;
    const wasNearBottom = streamEl
      ? streamEl.scrollHeight - streamEl.scrollTop - streamEl.clientHeight < 72
      : false;

    setConsoleOpen((prev) => {
      const next = !prev;
      if (next && isMobile && composerEmojiOpen) {
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
  }, [isMobile, composerEmojiOpen, resolvedStreamRef]);

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

  const handleToggleEnterToSend = useCallback(() => {
    setEnterToSend((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(ENTER_TO_SEND_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleTextareaKeyDown = (e) => {
    if (e.key === 'Escape' && isGenerating && onStopGeneration) {
      e.preventDefault();
      onStopGeneration();
      return;
    }
    if (e.key === 'Enter') {
      const shouldSend = enterToSend
        ? !e.shiftKey
        : Boolean(e.ctrlKey || e.metaKey);
      if (shouldSend) {
        e.preventDefault();
        if (isGenerating) return;
        if (onSendMessage) {
          onSendMessage(e);
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
          }
        }
      }
    }
  };

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

  const handleFormSubmit = (e) => {
    if (isGenerating) {
      e.preventDefault();
      if (onStopGeneration) onStopGeneration();
      return;
    }
    if (onSendMessage) {
      onSendMessage(e);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const sortedChatFiles = useMemo(() => {
    if (!Array.isArray(chatFiles) || chatFiles.length === 0) return [];
    return [...chatFiles].sort((a, b) => {
      const diff = resolveChatTimestampMs(b) - resolveChatTimestampMs(a);
      if (diff !== 0) return diff;
      return (b.fileSize || 0) - (a.fileSize || 0);
    });
  }, [chatFiles]);

  // Reset the 30-item window and multi-select state when opening the chat list or switching character
  useLayoutEffect(() => {
    if (chatListOpen) {
      setVisibleChatsLimit(CHAT_LIST_BATCH_SIZE);
      setChatMultiSelectActive(false);
      setSelectedChatFiles([]);
      setChatDeleteConfirm(null);
      if (chatListScrollRef.current) {
        chatListScrollRef.current.scrollTop = 0;
      }
    }
  }, [chatListOpen, characterName]);

  const visibleChatFiles = useMemo(
    () => sortedChatFiles.slice(0, visibleChatsLimit),
    [sortedChatFiles, visibleChatsLimit],
  );

  const handleExitChatMultiSelect = useCallback(() => {
    setChatMultiSelectActive(false);
    setSelectedChatFiles([]);
    setLastSelectedChatClick({ fileName: null, selected: true });
  }, []);

  useEffect(() => {
    if (!chatListOpen || !chatMultiSelectActive || chatDeleteConfirm) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleExitChatMultiSelect();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [chatListOpen, chatMultiSelectActive, chatDeleteConfirm, handleExitChatMultiSelect]);

  const handleToggleMultiSelectChat = useCallback(
    (fileName, event) => {
      if (!fileName) return;
      if (!chatMultiSelectActive) {
        setChatMultiSelectActive(true);
      }
      setSelectedChatFiles((prev) => {
        const set = new Set(prev);
        const targetState = !set.has(fileName);
        if (
          event?.shiftKey &&
          lastSelectedChatClick.fileName &&
          lastSelectedChatClick.fileName !== fileName
        ) {
          const orderedNames = visibleChatFiles.map((c) => c.fileName);
          const a = orderedNames.indexOf(lastSelectedChatClick.fileName);
          const b = orderedNames.indexOf(fileName);
          if (a !== -1 && b !== -1) {
            const [start, end] = a < b ? [a, b] : [b, a];
            for (let i = start; i <= end; i += 1) {
              if (lastSelectedChatClick.selected) set.add(orderedNames[i]);
              else set.delete(orderedNames[i]);
            }
            return Array.from(set);
          }
        }
        if (targetState) set.add(fileName);
        else set.delete(fileName);
        setLastSelectedChatClick({ fileName, selected: targetState });
        return Array.from(set);
      });
    },
    [chatMultiSelectActive, lastSelectedChatClick, visibleChatFiles],
  );

  const allVisibleChatsSelected = useMemo(() => {
    if (visibleChatFiles.length === 0) return false;
    const set = new Set(selectedChatFiles);
    return visibleChatFiles.every((c) => set.has(c.fileName));
  }, [visibleChatFiles, selectedChatFiles]);

  const handleToggleSelectAllChats = useCallback(() => {
    if (allVisibleChatsSelected) {
      setSelectedChatFiles([]);
    } else {
      setSelectedChatFiles(visibleChatFiles.map((c) => c.fileName));
    }
  }, [allVisibleChatsSelected, visibleChatFiles]);

  const handleConfirmDeleteChats = useCallback(async () => {
    if (
      !Array.isArray(chatDeleteConfirm) ||
      chatDeleteConfirm.length === 0 ||
      !onDeleteChatFiles ||
      deletingChats
    ) {
      return;
    }
    setDeletingChats(true);
    try {
      await onDeleteChatFiles(chatDeleteConfirm);
      setSelectedChatFiles((prev) =>
        prev.filter((name) => !chatDeleteConfirm.includes(name)),
      );
      if (chatMultiSelectActive && selectedChatFiles.length <= chatDeleteConfirm.length) {
        setChatMultiSelectActive(false);
      }
      setChatDeleteConfirm(null);
    } finally {
      setDeletingChats(false);
    }
  }, [
    chatDeleteConfirm,
    onDeleteChatFiles,
    deletingChats,
    chatMultiSelectActive,
    selectedChatFiles.length,
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

  const handleEnterMsgMultiSelect = useCallback((mIdx) => {
    if (!Number.isInteger(mIdx)) return;
    setMsgMultiSelectActive(true);
    setSelectedMsgIndices([mIdx]);
    setLastMsgSelectClick({ index: mIdx, selected: true });
  }, []);

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

  const hasMoreLocalChats = visibleChatFiles.length < sortedChatFiles.length;
  const canLoadMoreChats = hasMoreLocalChats || hasMoreChats;
  const displayedTotalChats =
    typeof totalChatsCount === 'number' && totalChatsCount > 0
      ? Math.max(totalChatsCount, sortedChatFiles.length)
      : sortedChatFiles.length;

  const handleChatListScroll = useCallback(() => {
    const el = chatListScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > CHAT_LIST_BOTTOM_THRESHOLD_PX) return;

    if (hasMoreLocalChats) {
      setVisibleChatsLimit((prev) => prev + CHAT_LIST_BATCH_SIZE);
    }

    if (
      hasMoreChats &&
      onLoadMoreChats &&
      !loadingMoreChats &&
      !chatListLoadGateRef.current
    ) {
      chatListLoadGateRef.current = true;
      setVisibleChatsLimit((prev) => prev + CHAT_LIST_BATCH_SIZE);
      Promise.resolve(onLoadMoreChats()).finally(() => {
        chatListLoadGateRef.current = false;
      });
    }
  }, [hasMoreLocalChats, hasMoreChats, onLoadMoreChats, loadingMoreChats]);

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

  const parentChatInfo = useMemo(() => {
    if (!activeChatFile || !Array.isArray(allTimelineChats) || allTimelineChats.length === 0) {
      return null;
    }
    const forest = buildTimelineForest(allTimelineChats);
    const currentNode =
      forest.byFile.get(activeChatFile) ||
      Array.from(forest.byFile.values()).find(
        (n) => String(n.fileName || '').toLowerCase() === activeChatFile.toLowerCase(),
      );
    if (!currentNode || !currentNode.parentFile) return null;
    const parentNode = forest.byFile.get(currentNode.parentFile);
    if (!parentNode) return null;
    const label = parentNode.branchLabel || parentNode.baseTitle || parentNode.fileName;
    return {
      fileName: parentNode.fileName,
      label,
    };
  }, [activeChatFile, allTimelineChats]);

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
          <TimelineTree
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
        </div>
      )}

      <div className="bb-chat-viewport__stage" aria-hidden={timelinesOpen || undefined}>
        <div
          ref={resolvedStreamRef}
          className={`bb-chat-viewport__stream bb-scrollbar--hidden ${
            scrolledUnderTop ? 'is-scrolled-under-top' : ''
          } ${scrolledUnderBottom ? 'is-scrolled-under-bottom' : ''} ${
            msgMultiSelectActive ? 'has-multiselect-bar' : ''
          }`.trim()}
          onScroll={handleScroll}
        >
        <div ref={streamTrackRef} className="bb-chat-viewport__track">
        {loadingChat && !switchingScenario && messages.length > 0 && !chatMetaStats.hasMoreOlder && (
          <ProgressIndicator
            variant="linear"
            size="sm"
            ariaLabel="Switching timeline"
            className="bb-chat-viewport__top-progress"
          />
        )}
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
          const bodyText =
            mes.swipes && !activeChatFile
              ? mes.swipes[demoSwipeIdx % mes.swipes.length]
              : mes.text;
          const totalSwipes =
            mes.swipes && !activeChatFile
              ? mes.swipes.length
              : mes.swipeCount || 1;
          const currentSwipeIdx =
            mes.swipes && !activeChatFile
              ? demoSwipeIdx % mes.swipes.length
              : mes.swipeId || 0;
          const hasActions = Boolean(activeChatFile && mes.index !== undefined);

          const normalizedMessage = {
            ...mes,
            index: mes.index !== undefined ? mes.index : idx,
            text: bodyText,
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
              onDelete={
                hasActions && onDeleteMessage
                  ? (mIdx) => onDeleteMessage(mIdx, false)
                  : undefined
              }
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
                hasActions && (onDeleteMessagesBatch || onDeleteMessage) && !isGenerating
                  ? handleEnterMsgMultiSelect
                  : undefined
              }
              onToggleMultiSelect={
                hasActions ? handleToggleMsgMultiSelect : undefined
              }
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

      <form
        className={`bb-chat-viewport__composer ${
          composerDragOver ? 'is-drag-over' : ''
        }`.trim()}
        onSubmit={handleFormSubmit}
        onDragEnter={handleComposerDragEnter}
        onDragOver={handleComposerDragOver}
        onDragLeave={handleComposerDragLeave}
        onDrop={handleComposerDrop}
      >
        <input
          ref={attachFileInputRef}
          type="file"
          multiple
          hidden
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleFileInputChange}
        />
        {composerDragOver && (
          <div className="bb-chat-viewport__drop-hint" aria-hidden="true">
            <Icon name="paperclip" size={16} />
            <span>Drop files or images to attach</span>
          </div>
        )}
        <AttachmentTray items={pendingAttachments} onRemove={onRemoveAttachment} />
        <div className="bb-chat-viewport__composer-row">
          <Button
            type="button"
            variant="b2"
            size="lg"
            borderless
            active={pendingAttachments.length > 0}
            disabled={!hasActiveScenario}
            icon="paperclip"
            title="Attach files or images (or paste / drag & drop)"
            aria-label="Attach files or images"
            className="bb-chat-viewport__composer-icon-btn"
            onClick={() => attachFileInputRef.current?.click()}
          />
          <div className="bb-chat-viewport__input-stage">
            <textarea
              ref={textareaRef}
              rows={1}
              value={draftMsg}
              disabled={!hasActiveScenario}
              onChange={handleTextareaChange}
              onPaste={handleTextareaPaste}
              onSelect={captureComposerSelection}
              onKeyUp={captureComposerSelection}
              onMouseUp={captureComposerSelection}
              onFocus={() => {
                if (isMobile && composerEmojiOpen) {
                  setComposerEmojiOpen(false);
                }
              }}
              onKeyDown={handleTextareaKeyDown}
              placeholder=""
              aria-label={`Write a message to ${characterName}`}
              className="bb-chat-viewport__textarea bb-scrollbar--hidden"
            />
            <ScrollIndicator
              scrollRef={textareaRef}
              variant="compact"
              watchValue={draftMsg}
            />
            {!draftMsg && (
              <div className="bb-chat-viewport__placeholder" aria-hidden="true">
                <span className="bb-chat-viewport__placeholder-text">
                  {!hasActiveScenario
                    ? 'Select or create a scenario card to begin...'
                    : isGenerating
                      ? `${characterName} is responding... (Press Esc or Stop to halt)`
                      : enterToSend
                        ? `Write a message to ${characterName}... (Enter to send, Shift+Enter for new line)`
                        : `Write a message to ${characterName}... (Ctrl+Enter to send, Enter for new line)`}
                </span>
                {!isGenerating && (
                  <button
                    type="button"
                    className={`bb-chat-viewport__send-mode-btn ${
                      !enterToSend ? 'is-newline-mode' : ''
                    }`.trim()}
                    title={
                      enterToSend
                        ? 'Enter to send is ON • Click to switch Enter to new line'
                        : 'Enter to send is OFF (Enter = new line, Ctrl+Enter = send) • Click to enable Enter to send'
                    }
                    aria-label="Toggle Enter to send"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleToggleEnterToSend}
                  >
                    <Icon name="shuffle" size={13} />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="bb-chat-viewport__composer-actions">
            <Button
              ref={composerEmojiBtnRef}
              type="button"
              variant="b2"
              size="lg"
              borderless
              active={composerEmojiOpen}
              disabled={!hasActiveScenario}
              icon={isMobile && composerEmojiOpen ? 'keyboard' : 'smile'}
              title={
                isMobile && composerEmojiOpen
                  ? 'Switch back to keyboard'
                  : 'Insert emoji'
              }
              aria-label={
                isMobile && composerEmojiOpen
                  ? 'Switch back to keyboard'
                  : 'Insert emoji'
              }
              className="bb-chat-viewport__composer-icon-btn"
              onMouseDown={(e) => {
                // Keep caret offsets intact before toggling
                captureComposerSelection();
                if (!isMobile) e.preventDefault();
              }}
              onClick={handleToggleComposerEmoji}
            />
            {isGenerating ? (
              <Button
                key="composer-stop"
                type="button"
                variant="b2"
                size="lg"
                borderless
                icon="stop"
                title="Stop generation (Esc)"
                aria-label="Stop generation"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onStopGeneration?.();
                }}
              />
            ) : (
              <Button
                key="composer-send"
                type="submit"
                variant="b2"
                size="lg"
                borderless
                disabled={!hasActiveScenario}
                icon="send"
                title={
                  draftMsg.trim() || pendingAttachments.length > 0
                    ? 'Send message (Enter)'
                    : `Generate ${characterName}'s reply`
                }
                aria-label="Send message"
              />
            )}
          </div>
        </div>

        <div className="bb-chat-viewport__composer-chips">
          <div className="bb-chat-viewport__composer-chips-left">
            <ConnectionModelPicker
              connections={hubConnections}
              customFamilies={hubCustomFamilies}
              activeConnectionId={activeProviderId}
              activeModelId={activeModelId}
              activeModelName={activeModelName || modelLabel}
              placement="top"
              onSelectConnection={onSelectHubModel}
              onUpdateConnection={onUpdateHubConnection}
              onFetchConnectionModels={onFetchHubModels}
              onDeleteConnection={onDeleteHubConnection}
              onRevealConnectionKey={onRevealHubKey}
              onPingConnections={onPingHubConnections}
              onFetchTelemetry={onFetchHubTelemetry}
              onAddCustomFamily={onAddHubCustomFamily}
              onDeleteCustomFamily={onDeleteHubCustomFamily}
              onOpenAddConnection={onClickModelBadge}
            />

            <ConsoleToggleButton
              open={consoleOpen}
              onClick={handleToggleConsole}
              title={
                consoleOpen
                  ? 'Hide live output console'
                  : 'Open live output console (prompts, LLM outputs & workspace logs)'
              }
            />
          </div>

          <PersonaPicker
            personas={personas}
            activePersonaAvatar={activePersonaAvatar}
            personaName={personaName}
            personaAvatarUrl={personaAvatarUrl}
            cards={cards}
            groups={groups}
            activeCharacter={activeCharacter}
            hasUserMessages={hasUserMessages}
            userMessageCount={userMessageCount}
            disabled={isGenerating}
            onSelectPersona={onSelectPersona}
            onConfirmReplacePersonaInChat={onConfirmReplacePersonaInChat}
            onToggleBindActiveCharacter={onToggleBindPersonaToActiveCard}
            onOpenManageModal={onOpenManagePersonaModal || onClickPersonaBadge}
            onOpenCreateModal={onOpenCreatePersonaModal || onClickPersonaBadge}
            onDuplicatePersona={onDuplicatePersona}
            onDeletePersona={onDeletePersona}
          />
        </div>
      </form>

      <ConsoleDrawer
        open={consoleOpen && !chatListOpen && !timelinesOpen}
        entries={consoleEntries}
        connected={consoleConnected}
        onClear={clearConsoleLogs}
        onClose={() => setConsoleOpen(false)}
      />

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
