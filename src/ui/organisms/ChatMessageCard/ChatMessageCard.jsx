import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import { Input } from '../../atoms/Input/Input.jsx';
import { Tooltip } from '../../atoms/Tooltip/Tooltip.jsx';
import { ModelIcon } from '../../atoms/ModelIcon/ModelIcon.jsx';
import { SafeImage } from '../../atoms/SafeImage/SafeImage.jsx';
import { KebabMenu } from '../../molecules/KebabMenu/KebabMenu.jsx';
import { MessageDecorator } from '../../molecules/MessageDecorator/MessageDecorator.jsx';
import { AttachmentLightbox } from '../../molecules/AttachmentPreview/AttachmentPreview.jsx';
import {
  formatFileSize,
  getFileExtension,
  inferAttachmentKind,
  resolveAttachmentIcon,
} from '../../molecules/AttachmentPreview/attachmentModel.js';
import { MarkdownEditor } from '../MarkdownEditor/MarkdownEditor.jsx';
import './ChatMessageCard.css';

const TELEMETRY_STORAGE_KEY = 'nexustavern_msg_telemetry_collapsed_v1';
const telemetryListeners = new Set();

function readTelemetryCollapsed() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TELEMETRY_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let cachedTelemetryCollapsed = readTelemetryCollapsed();

function subscribeTelemetryCollapsed(listener) {
  telemetryListeners.add(listener);
  const handleStorage = (e) => {
    if (e.key === TELEMETRY_STORAGE_KEY) {
      cachedTelemetryCollapsed = readTelemetryCollapsed();
      listener();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage);
  }
  return () => {
    telemetryListeners.delete(listener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage);
    }
  };
}

function getTelemetryCollapsedSnapshot() {
  return cachedTelemetryCollapsed;
}

function toggleTelemetryCollapsed() {
  const next = !cachedTelemetryCollapsed;
  cachedTelemetryCollapsed = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(TELEMETRY_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Ignore storage quota errors
    }
  }
  telemetryListeners.forEach((fn) => fn());
}

function formatTimerBadge(durationMs, tokens) {
  if (typeof durationMs !== 'number' || durationMs <= 0) return null;
  const seconds = durationMs / 1000;
  const secStr = seconds < 10 ? seconds.toFixed(1) : Math.round(seconds).toString();
  if (typeof tokens === 'number' && tokens > 4 && seconds > 0.2) {
    const tps = Math.round(tokens / seconds);
    if (tps > 0 && tps < 600) {
      return `${secStr}s • ${tps} t/s`;
    }
  }
  return `${secStr}s`;
}

export function ChatMessageCard({
  message,
  chatScopeKey = '',
  depth = 0,
  isLast = false,
  dimmed = false,
  userName = 'User',
  userAvatarUrl = null,
  charName = 'Character',
  charAvatarUrl = null,
  charInitials = 'CH',
  onSwipe,
  onGenerateSwipe,
  onContinue,
  onDeleteSwipe,
  onSaveEdit,
  onRemoveAttachment,
  onDelete,
  onTruncateBranch,
  onCreateBranch,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(message?.text || '');
  const [draftReasoning, setDraftReasoning] = useState(message?.reasoning || '');
  const [copied, setCopied] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(-1);
  const touchStartRef = useRef(null);

  const isStreamingProp = Boolean(message?.isStreaming);
  const [postStreamHold, setPostStreamHold] = useState(false);
  const [sizerHeight, setSizerHeight] = useState(null);
  const [sizerAnimate, setSizerAnimate] = useState(false);
  const wasStreamingRef = useRef(isStreamingProp);
  const streamInnerRef = useRef(null);

  // Swipe stage state — animates only MessageDecorator; portrait, header & footer stay stationary
  const swipeStageRef = useRef(null);
  const activeSwipePaneRef = useRef(null);
  const liveSwipeHeightRef = useRef(0);
  const prevSwipeSnapRef = useRef(null);
  const swipeSeqRef = useRef(0);
  const swipeTimerRef = useRef(null);
  const swipeRafRef = useRef(null);

  const [swipeTransition, setSwipeTransition] = useState(null);
  const [activePaneSeq, setActivePaneSeq] = useState(0);
  const [activePaneDir, setActivePaneDir] = useState(null);
  const [swipeStageHeight, setSwipeStageHeight] = useState(null);
  const [swipeHeightAnimating, setSwipeHeightAnimating] = useState(false);

  const totalSwipesVal = Math.max(1, Number(message?.swipeCount ?? 1));
  const currentSwipeVal = Math.max(
    0,
    Math.min(Number(message?.swipeId ?? 0), totalSwipesVal - 1),
  );
  const msgIdentity = `${chatScopeKey || ''}::${message?.id ?? ''}::${message?.index ?? ''}`;

  useEffect(() => () => {
    if (swipeTimerRef.current) clearTimeout(swipeTimerRef.current);
    if (swipeRafRef.current) cancelAnimationFrame(swipeRafRef.current);
  }, []);

  useLayoutEffect(() => {
    const paneEl = activeSwipePaneRef.current;
    if (!paneEl || isEditing) return undefined;
    const measurePane = () => {
      const h = Math.ceil(paneEl.getBoundingClientRect().height);
      if (h > 0) liveSwipeHeightRef.current = h;
    };
    measurePane();
    const ro = new ResizeObserver(measurePane);
    ro.observe(paneEl);
    return () => ro.disconnect();
  }, [activePaneSeq, isEditing]);

  useLayoutEffect(() => {
    if (
      isStreamingProp &&
      swipeStageHeight !== null &&
      Boolean(message?.text || message?.reasoning)
    ) {
      if (swipeRafRef.current) {
        cancelAnimationFrame(swipeRafRef.current);
        swipeRafRef.current = null;
      }
      setSwipeHeightAnimating(false);
      setSwipeStageHeight(null);
    }
  }, [isStreamingProp, message?.text, message?.reasoning, swipeStageHeight]);

  useEffect(() => {
    if (isStreamingProp) {
      wasStreamingRef.current = true;
      setPostStreamHold(false);
      const rafId = requestAnimationFrame(() => {
        setSizerAnimate(true);
      });
      return () => cancelAnimationFrame(rafId);
    }
    if (wasStreamingRef.current) {
      wasStreamingRef.current = false;
      setPostStreamHold(true);
      const timer = setTimeout(() => {
        setPostStreamHold(false);
        setSizerAnimate(false);
        setSizerHeight(null);
      }, 230);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isStreamingProp]);

  const smoothResizeActive = (isStreamingProp || postStreamHold) && !isEditing;

  useLayoutEffect(() => {
    if (!smoothResizeActive) return undefined;
    const innerEl = streamInnerRef.current;
    if (!innerEl) return undefined;

    const measure = () => {
      const nextH = Math.ceil(innerEl.getBoundingClientRect().height);
      if (nextH > 0) {
        setSizerHeight((prev) => (prev === nextH ? prev : nextH));
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(innerEl);
    return () => ro.disconnect();
  }, [
    smoothResizeActive,
    message?.text,
    message?.reasoning,
    message?.streamPhase,
    message?.streamStalled,
    isStreamingProp,
  ]);

  useLayoutEffect(() => {
    if (!message) return;
    const prev = prevSwipeSnapRef.current;
    const nextSnap = {
      msgIdentity,
      swipeIdx: currentSwipeVal,
      totalSwipes: totalSwipesVal,
      text: message.text || '',
      reasoning: message.reasoning || '',
      reasoningDurationMs: message.reasoningDurationMs ?? null,
      isStreaming: isStreamingProp,
    };

    if (prev && prev.msgIdentity === msgIdentity && !isEditing) {
      const idxChanged = currentSwipeVal !== prev.swipeIdx;
      const deletedShift =
        !idxChanged &&
        totalSwipesVal < prev.totalSwipes &&
        !isStreamingProp &&
        prev.text !== nextSnap.text;

      if (idxChanged || deletedShift) {
        const dir = idxChanged && currentSwipeVal < prev.swipeIdx ? 'prev' : 'next';
        if (swipeTimerRef.current) clearTimeout(swipeTimerRef.current);
        if (swipeRafRef.current) cancelAnimationFrame(swipeRafRef.current);

        const stageRectH = swipeStageRef.current
          ? Math.ceil(swipeStageRef.current.getBoundingClientRect().height)
          : 0;
        const fromH =
          swipeStageHeight !== null && stageRectH > 0
            ? stageRectH
            : liveSwipeHeightRef.current || stageRectH;
        const toH = activeSwipePaneRef.current
          ? Math.ceil(activeSwipePaneRef.current.getBoundingClientRect().height)
          : 0;

        const nextSeq = swipeSeqRef.current + 1;
        swipeSeqRef.current = nextSeq;
        setActivePaneSeq(nextSeq);
        setActivePaneDir(dir);
        setSwipeTransition({
          seq: nextSeq,
          dir,
          outgoing:
            !prev.isStreaming && (prev.text || prev.reasoning)
              ? {
                  text: prev.text,
                  reasoning: prev.reasoning,
                  reasoningDurationMs: prev.reasoningDurationMs,
                }
              : null,
        });

        if (
          fromH > 0 &&
          toH > 0 &&
          Math.abs(fromH - toH) > 1 &&
          !(isStreamingProp && Boolean(message.text || message.reasoning))
        ) {
          setSwipeHeightAnimating(false);
          setSwipeStageHeight(fromH);
          swipeRafRef.current = requestAnimationFrame(() => {
            swipeRafRef.current = requestAnimationFrame(() => {
              swipeRafRef.current = null;
              const targetH = activeSwipePaneRef.current
                ? Math.ceil(activeSwipePaneRef.current.getBoundingClientRect().height)
                : toH;
              setSwipeHeightAnimating(true);
              setSwipeStageHeight(targetH > 0 ? targetH : toH);
            });
          });
        } else {
          setSwipeHeightAnimating(false);
          setSwipeStageHeight(null);
        }

        swipeTimerRef.current = setTimeout(() => {
          swipeTimerRef.current = null;
          setSwipeTransition(null);
          setActivePaneDir(null);
          setSwipeHeightAnimating(false);
          setSwipeStageHeight(null);
        }, 275);
      }
    } else if (prev && prev.msgIdentity !== msgIdentity) {
      if (swipeTimerRef.current) clearTimeout(swipeTimerRef.current);
      if (swipeRafRef.current) cancelAnimationFrame(swipeRafRef.current);
      setSwipeTransition(null);
      setActivePaneDir(null);
      setSwipeHeightAnimating(false);
      setSwipeStageHeight(null);
    }

    prevSwipeSnapRef.current = nextSnap;
  }, [
    msgIdentity,
    currentSwipeVal,
    totalSwipesVal,
    message?.text,
    message?.reasoning,
    message?.reasoningDurationMs,
    isStreamingProp,
    isEditing,
  ]);

  useEffect(() => {
    if (!isEditing) {
      setDraftText(message?.text || '');
      setDraftReasoning(message?.reasoning || '');
    }
  }, [message?.text, message?.reasoning, isEditing]);

  if (!message) return null;

  const isUser = Boolean(message.isUser);
  const isStreaming = Boolean(message.isStreaming);
  const isDimmed = dimmed && !isLast;
  const msgNum = Number.isInteger(message.index) ? message.index + 1 : 1;
  const senderLabel = message.sender || (isUser ? userName : charName);
  const resolvedUserAvatarSrc = message.userAvatarMissing
    ? null
    : message.userAvatarUrl || userAvatarUrl;
  const avatarSrc = isUser ? resolvedUserAvatarSrc : charAvatarUrl;
  const avatarFallback = isUser
    ? String(senderLabel || userName || 'ME').trim().slice(0, 2).toUpperCase() || 'ME'
    : charInitials || (charName || 'CH').slice(0, 2).toUpperCase();

  const totalSwipes = Math.max(1, Number(message.swipeCount ?? 1));
  const currentSwipeIdx = Math.max(
    0,
    Math.min(Number(message.swipeId ?? 0), totalSwipes - 1),
  );
  const isGreetingMsg = message.index === 0 && !isUser;
  const canSwipe = isLast && !isUser;
  const canGenerateNextSwipe =
    canSwipe && !isGreetingMsg && Boolean(onGenerateSwipe);
  const isAtLastSwipe = currentSwipeIdx >= totalSwipes - 1;
  const canCreateBranch = Boolean(onCreateBranch);
  const canEdit = Boolean(onSaveEdit);
  const canUserTriggerReply = isLast && isUser && Boolean(onGenerateSwipe);
  const showSwipeBar =
    canSwipe ||
    canCreateBranch ||
    canEdit ||
    canUserTriggerReply;

  const telemetryCollapsed = useSyncExternalStore(
    subscribeTelemetryCollapsed,
    getTelemetryCollapsedSnapshot,
    () => false,
  );

  const timerLabel = formatTimerBadge(message.durationMs, message.tokens);
  const hasModelInfo = !isUser && Boolean(message.model || message.api);
  const modelTooltipText = String(message.model || message.api || '').trim();
  const fallbackInfo =
    !isUser && message.fallbackInfo && typeof message.fallbackInfo === 'object'
      ? message.fallbackInfo
      : null;

  const formatEndpointLabel = (modelVal, apiVal) => {
    const cleanModel = String(modelVal || '').trim();
    const cleanApi = String(apiVal || '').trim();
    if (cleanModel && cleanApi && cleanModel.toLowerCase() !== cleanApi.toLowerCase()) {
      return `${cleanModel} (${cleanApi})`;
    }
    return cleanModel || cleanApi || 'Unknown';
  };

  const fallbackFromLabel = fallbackInfo
    ? formatEndpointLabel(fallbackInfo.fromModel, fallbackInfo.fromApi)
    : '';
  const fallbackToLabel = fallbackInfo
    ? formatEndpointLabel(
        fallbackInfo.toModel || message.model,
        fallbackInfo.toApi || message.api,
      )
    : '';

  const fallbackTooltipNode = fallbackInfo ? (
    <div className="bb-m3-tooltip-detail">
      <div className="bb-m3-tooltip-detail__head">
        <Icon name="shuffle" size={12} />
        <span>Fallback Redirect</span>
      </div>
      <div className="bb-m3-tooltip-detail__row">
        <span className="bb-m3-tooltip-detail__label">Route</span>
        <span className="bb-m3-tooltip-detail__value bb-m3-tooltip-detail__value--mono">
          {fallbackFromLabel}
          <span className="bb-m3-tooltip-detail__arrow" aria-hidden="true">
            →
          </span>
          {fallbackToLabel}
        </span>
      </div>
      <div className="bb-m3-tooltip-detail__row">
        <span className="bb-m3-tooltip-detail__label">Trigger</span>
        <span className="bb-m3-tooltip-detail__value">
          {fallbackInfo.reason || 'Refusal Catcher triggered'}
        </span>
      </div>
      <div className="bb-m3-tooltip-detail__row">
        <span className="bb-m3-tooltip-detail__label">Error</span>
        <span className="bb-m3-tooltip-detail__value bb-m3-tooltip-detail__value--mono bb-m3-tooltip-detail__value--error">
          {fallbackInfo.error || fallbackInfo.reason || 'Generation refused'}
        </span>
      </div>
    </div>
  ) : null;

  const handleCopyText = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(message.text || '').catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const handleCommitEdit = async (asNewSwipe = false) => {
    if (onSaveEdit) {
      const ok = await onSaveEdit(message.index, draftText, asNewSwipe, draftReasoning);
      if (ok === false) return;
    }
    setIsEditing(false);
  };

  const kebabItems = [
    {
      id: 'copy',
      icon: copied ? 'check' : 'copy',
      label: copied ? 'Copied' : 'Copy Text',
      onClick: handleCopyText,
    },
    onTruncateBranch && {
      id: 'truncate',
      icon: 'scissors',
      label: 'Truncate from Here',
      onClick: () => onTruncateBranch(message.index),
    },
    !isUser &&
      !isGreetingMsg &&
      totalSwipes > 1 &&
      onDeleteSwipe && {
        id: 'delete-swipe',
        icon: 'trash',
        label: `Delete Swipe ${currentSwipeIdx + 1}/${totalSwipes}`,
        danger: true,
        onClick: () => onDeleteSwipe(message.index, currentSwipeIdx),
      },
    onDelete && {
      id: 'delete',
      icon: 'trash',
      label: 'Delete Message',
      danger: true,
      onClick: () => onDelete(message.index),
    },
  ].filter(Boolean);

  const handleTouchStart = (e) => {
    if (!canSwipe || isEditing || isStreaming) return;
    const t = e.touches?.[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e) => {
    if (!touchStartRef.current || !canSwipe || isEditing || isStreaming) return;
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const t = e.changedTouches?.[0];
    if (!t) return;
    if (typeof window !== 'undefined' && window.getSelection?.()?.toString()) return;

    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.8) return;

    if (dx > 0) {
      if (currentSwipeIdx > 0 && onSwipe) {
        onSwipe(message, currentSwipeIdx - 1);
      }
    } else if (!isAtLastSwipe && onSwipe) {
      onSwipe(message, currentSwipeIdx + 1);
    } else if (canGenerateNextSwipe) {
      onGenerateSwipe(message);
    }
  };

  return (
    <article
      className={[
        'bb-chat-msg-card',
        isUser ? 'bb-chat-msg-card--user' : 'bb-chat-msg-card--ai',
        isLast ? 'bb-chat-msg-card--last' : '',
        isDimmed ? 'bb-chat-msg-card--dimmed' : '',
        isEditing ? 'bb-chat-msg-card--editing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-message-index={message.index}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="bb-chat-msg-card__avatar">
        <SafeImage
          src={avatarSrc}
          alt={senderLabel}
          loading="lazy"
          className="bb-chat-msg-card__avatar-img"
          fallback={<span>{avatarFallback}</span>}
        />
        {!isLast && (
          <span className="bb-chat-msg-card__avatar-num">#{msgNum}</span>
        )}
      </div>

      <div className="bb-chat-msg-card__content">
        <header className="bb-chat-msg-card__header">
          <div className="bb-chat-msg-card__sender-wrap">
            <h3 className="bb-chat-msg-card__sender">{senderLabel}</h3>
            {(hasModelInfo || fallbackInfo) && (
              <span className="bb-chat-msg-card__model-group">
                {hasModelInfo && (
                  <Tooltip content={modelTooltipText} mono>
                    <span
                      className="bb-chat-msg-card__model-badge"
                      tabIndex={0}
                      aria-label={`Model: ${modelTooltipText}`}
                    >
                      <ModelIcon model={message.model} api={message.api} size={15} />
                    </span>
                  </Tooltip>
                )}
                {fallbackInfo && (
                  <Tooltip content={fallbackTooltipNode} rich>
                    <span
                      className="bb-chat-msg-card__fallback-badge"
                      tabIndex={0}
                      aria-label={`Fallback redirect: ${fallbackFromLabel} to ${fallbackToLabel}. ${fallbackInfo.reason || ''} (${fallbackInfo.error || ''})`}
                    >
                      <Icon name="shuffle" size={13} />
                    </span>
                  </Tooltip>
                )}
              </span>
            )}
            {message.index === 0 && !isUser && totalSwipes > 1 && (
              <span className="bb-chat-msg-card__role-pill">
                Intro {currentSwipeIdx + 1}/{totalSwipes}
              </span>
            )}
          </div>

          <div className="bb-chat-msg-card__header-right">
            {telemetryCollapsed ? (
              <button
                type="button"
                className="bb-chat-msg-card__telemetry-dot-btn"
                aria-expanded="false"
                aria-label="Expand message metadata"
                onClick={toggleTelemetryCollapsed}
              >
                <span className="bb-chat-msg-card__telemetry-dot" aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className="bb-chat-msg-card__telemetry"
                aria-expanded="true"
                aria-label="Collapse message metadata"
                onClick={toggleTelemetryCollapsed}
              >
                {!isStreaming && message.time && (
                  <span className="bb-chat-msg-card__pill">{message.time}</span>
                )}
                <span className="bb-chat-msg-card__pill">
                  {message.tokens || 0} tok
                </span>
                {timerLabel && !isStreaming && (
                  <span className="bb-chat-msg-card__pill bb-chat-msg-card__pill--timer">
                    {timerLabel}
                  </span>
                )}
              </button>
            )}

            <div className="bb-chat-msg-card__actions">
              <KebabMenu
                items={kebabItems}
                size="sm"
                title="Message options"
                disabled={isStreaming}
              />
            </div>
          </div>
        </header>

        {isEditing ? (
          <div className="bb-chat-msg-card__editor">
            <MarkdownEditor
              label={`Delta Edit Message #${msgNum}`}
              value={draftText}
              onChange={setDraftText}
              autoFocusEnd
            />
            {(!isUser || draftReasoning) && (
              <Input
                label="Chain of Thought / Reasoning (optional)"
                value={draftReasoning}
                onChange={(e) => setDraftReasoning(e.target.value)}
                placeholder="Optional thinking process..."
              />
            )}
            <div className="bb-chat-msg-card__editor-actions">
              <Button
                variant="b1"
                size="sm"
                icon="close"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </Button>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {canSwipe && (
                  <Button
                    variant="b1"
                    size="sm"
                    icon="plus"
                    onClick={() => handleCommitEdit(true)}
                  >
                    Save as New Swipe
                  </Button>
                )}
                <Button
                  variant="b1"
                  size="sm"
                  emphasis="filled"
                  icon="check"
                  onClick={() => handleCommitEdit(false)}
                >
                  Save Delta
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={[
              'bb-chat-msg-card__stream-sizer',
              smoothResizeActive ? 'is-sizing' : '',
              smoothResizeActive && sizerAnimate ? 'is-animating' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={
              smoothResizeActive && sizerHeight !== null
                ? { height: `${sizerHeight}px` }
                : undefined
            }
          >
            <div ref={streamInnerRef} className="bb-chat-msg-card__stream-inner">
              <div
                ref={swipeStageRef}
                className={[
                  'bb-chat-msg-card__swipe-stage',
                  swipeTransition ? 'is-swiping' : '',
                  swipeHeightAnimating ? 'is-height-animating' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={
                  swipeStageHeight !== null
                    ? { height: `${swipeStageHeight}px` }
                    : undefined
                }
              >
                {swipeTransition?.outgoing && (
                  <div
                    key={`out-${swipeTransition.seq}`}
                    className={`bb-chat-msg-card__swipe-pane bb-chat-msg-card__swipe-pane--outgoing bb-chat-msg-card__swipe-pane--out-${swipeTransition.dir}`}
                    aria-hidden="true"
                  >
                    <MessageDecorator
                      text={swipeTransition.outgoing.text}
                      reasoning={swipeTransition.outgoing.reasoning}
                      reasoningDurationMs={swipeTransition.outgoing.reasoningDurationMs}
                      userName={userName}
                      charName={charName}
                      isUser={isUser}
                      depth={depth}
                      isStreaming={false}
                      streamPhase={null}
                      streamStalled={false}
                    />
                  </div>
                )}

                <div
                  key={activePaneSeq}
                  ref={activeSwipePaneRef}
                  className={[
                    'bb-chat-msg-card__swipe-pane',
                    'bb-chat-msg-card__swipe-pane--active',
                    activePaneDir ? `bb-chat-msg-card__swipe-pane--in-${activePaneDir}` : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {(Boolean(message.text) ||
                    Boolean(message.reasoning) ||
                    isStreaming ||
                    !Array.isArray(message.attachments) ||
                    message.attachments.length === 0) && (
                    <MessageDecorator
                      text={message.text}
                      reasoning={message.reasoning}
                      reasoningDurationMs={message.reasoningDurationMs}
                      userName={userName}
                      charName={charName}
                      isUser={isUser}
                      depth={depth}
                      isStreaming={isStreaming}
                      streamPhase={message.streamPhase || null}
                      streamStalled={Boolean(isStreaming && message.streamStalled)}
                    />
                  )}

                  {Array.isArray(message.attachments) && message.attachments.length > 0 && (
                    <div className="bb-chat-msg-card__attachments">
                      {message.attachments.map((att, attIdx) => {
                        const kind = att.kind || inferAttachmentKind(att);
                        const srcUrl = att.url || att.previewUrl || '';
                        const removeBtn =
                          onRemoveAttachment && !isStreaming ? (
                            <button
                              type="button"
                              className="bb-chat-msg-card__attachment-remove"
                              title={`Remove ${att.name || 'attachment'} from message`}
                              aria-label={`Remove ${att.name || 'attachment'} from message`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveAttachment(message.index, attIdx, message);
                              }}
                            >
                              <Icon name="close" size={14} />
                            </button>
                          ) : null;

                        if (kind === 'image' && srcUrl) {
                          return (
                            <div
                              key={att.id || `${att.name}-${attIdx}`}
                              className="bb-chat-msg-card__attachment-item bb-chat-msg-card__attachment-item--image"
                            >
                              <button
                                type="button"
                                className="bb-chat-msg-card__image-frame"
                                title={`Click to view ${att.name || att.title || 'image'}`}
                                aria-label={`View ${att.name || att.title || 'image'}`}
                                onClick={() => setLightboxIdx(attIdx)}
                              >
                                <img
                                  src={srcUrl}
                                  alt={att.name || att.title || 'Attached image'}
                                  loading="lazy"
                                  className="bb-chat-msg-card__image"
                                />
                              </button>
                              {removeBtn}
                            </div>
                          );
                        }

                        const ext = (att.ext || getFileExtension(att.name)).slice(0, 5);
                        const sizeStr = att.size ? formatFileSize(att.size) : '';
                        return (
                          <div
                            key={att.id || `${att.name}-${attIdx}`}
                            className="bb-chat-msg-card__attachment-item bb-chat-msg-card__attachment-item--file"
                          >
                            <button
                              type="button"
                              className="bb-chat-msg-card__file-card"
                              title={`Click to open ${att.name || 'file'}`}
                              aria-label={`Open ${att.name || 'file'}`}
                              onClick={() => setLightboxIdx(attIdx)}
                            >
                              <span className="bb-chat-msg-card__file-badge" aria-hidden="true">
                                <Icon name={resolveAttachmentIcon(kind)} size={18} />
                                {ext && <span className="bb-chat-msg-card__file-ext">{ext}</span>}
                              </span>
                              <span className="bb-chat-msg-card__file-meta">
                                <span className="bb-chat-msg-card__file-name">
                                  {att.name || 'Attached file'}
                                </span>
                                <span className="bb-chat-msg-card__file-sub">
                                  {sizeStr || (ext ? `${ext.toUpperCase()} file` : 'Attachment')}
                                </span>
                              </span>
                              <span className="bb-chat-msg-card__file-open" aria-hidden="true">
                                <Icon name="expand" size={16} />
                              </span>
                            </button>
                            {removeBtn}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {showSwipeBar && (
                <footer className="bb-chat-msg-card__footer">
                  <div className="bb-chat-msg-card__swipes">
                    {canUserTriggerReply && (
                      <Button
                        variant="b2"
                        size="md"
                        className="bb-chat-msg-card__ctrl-btn is-generate-next"
                        icon={<Icon name="sparkles" size={16} />}
                        disabled={isStreaming}
                        title={`Generate ${charName}'s reply`}
                        aria-label={`Generate ${charName}'s reply`}
                        onClick={() => onGenerateSwipe(message)}
                      />
                    )}

                    {canSwipe && onContinue && (
                      <Button
                        variant="b2"
                        size="md"
                        className="bb-chat-msg-card__ctrl-btn"
                        icon={<Icon name="continueArrow" size={17} />}
                        disabled={isStreaming}
                        title="Continue message"
                        aria-label="Continue message"
                        onClick={() => onContinue(message)}
                      />
                    )}

                    {canGenerateNextSwipe && (
                      <Button
                        variant="b2"
                        size="md"
                        className="bb-chat-msg-card__ctrl-btn"
                        icon={<Icon name="refresh" size={16} />}
                        disabled={isStreaming}
                        title="Regenerate (new swipe)"
                        aria-label="Regenerate (new swipe)"
                        onClick={() => onGenerateSwipe(message)}
                      />
                    )}

                    {canSwipe && (onContinue || canGenerateNextSwipe) && (
                      <span className="bb-chat-msg-card__ctrl-sep" aria-hidden="true" />
                    )}

                    {canSwipe && (
                      <>
                        <Button
                          variant="b2"
                          size="md"
                          className="bb-chat-msg-card__ctrl-btn"
                          icon={<Icon name="chevronLeft" size={20} />}
                          disabled={isStreaming || currentSwipeIdx <= 0}
                          title="Previous swipe (←)"
                          aria-label="Previous swipe"
                          onClick={() => onSwipe && onSwipe(message, currentSwipeIdx - 1)}
                        />
                        <span className="bb-chat-msg-card__swipe-count">
                          {currentSwipeIdx + 1} / {totalSwipes}
                        </span>
                        <Button
                          variant="b2"
                          size="md"
                          className={`bb-chat-msg-card__ctrl-btn ${
                            isAtLastSwipe && canGenerateNextSwipe ? 'is-generate-next' : ''
                          }`.trim()}
                          icon={<Icon name="chevronRight" size={20} />}
                          disabled={isStreaming || (isAtLastSwipe && !canGenerateNextSwipe)}
                          title={
                            isAtLastSwipe && canGenerateNextSwipe
                              ? 'Generate new swipe (→)'
                              : 'Next swipe (→)'
                          }
                          aria-label={
                            isAtLastSwipe && canGenerateNextSwipe
                              ? 'Generate new swipe'
                              : 'Next swipe'
                          }
                          onClick={() => {
                            if (isAtLastSwipe && canGenerateNextSwipe) {
                              onGenerateSwipe(message);
                            } else if (onSwipe) {
                              onSwipe(message, currentSwipeIdx + 1);
                            }
                          }}
                        />
                      </>
                    )}
                    {canSwipe && (canCreateBranch || canEdit) && (
                      <span className="bb-chat-msg-card__ctrl-sep" aria-hidden="true" />
                    )}
                    {canCreateBranch && (
                      <Button
                        variant="b2"
                        size="md"
                        className="bb-chat-msg-card__ctrl-btn"
                        icon={<Icon name="codeBranch" size={18} />}
                        disabled={isStreaming}
                        title="Create branch from this message"
                        aria-label="Create branch from this message"
                        onClick={() => onCreateBranch(message.index)}
                      />
                    )}
                    {canEdit && (
                      <Button
                        variant="b2"
                        size="md"
                        className="bb-chat-msg-card__ctrl-btn"
                        icon={<Icon name="edit" size={16} />}
                        active={isEditing}
                        disabled={isStreaming}
                        title="Edit message"
                        aria-label="Edit message"
                        onClick={() => setIsEditing((prev) => !prev)}
                      />
                    )}
                  </div>
                </footer>
              )}
            </div>
          </div>
        )}
      </div>

      {Array.isArray(message?.attachments) && message.attachments.length > 0 && (
        <AttachmentLightbox
          items={message.attachments}
          activeIndex={lightboxIdx}
          onClose={() => setLightboxIdx(-1)}
          onChangeIndex={setLightboxIdx}
        />
      )}
    </article>
  );
}

