import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import {
  DEFAULT_DURATION_BY_VARIANT,
  DEFAULT_ICON_BY_VARIANT,
  parseSmartNotification,
  useToastQueue,
} from './toastUtils.js';
import './Toast.css';

export { parseSmartNotification, useToastQueue };

/**
 * Single M3 Notification Toast with hover-reset timer and shrinking bottom bar.
 * Hovering cancels the current timeout and restores the progress bar to 100%;
 * leaving restarts the full countdown from scratch with a fresh shrinking animation.
 */
export function Toast({
  id,
  variant = 'info',
  icon,
  badge = '',
  title = '',
  message = '',
  fullText = '',
  count = 1,
  durationMs,
  resetToken = 0,
  actionLabel = '',
  actionIcon = '',
  onAction,
  onDismiss,
}) {
  const resolvedVariant = DEFAULT_DURATION_BY_VARIANT[variant] ? variant : 'info';
  const effectiveDuration =
    Number.isFinite(Number(durationMs)) && Number(durationMs) > 0
      ? Number(durationMs)
      : DEFAULT_DURATION_BY_VARIANT[resolvedVariant];
  const resolvedIcon = icon || DEFAULT_ICON_BY_VARIANT[resolvedVariant];

  const [hovered, setHovered] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [cycleKey, setCycleKey] = useState(0);
  const dismissTimerRef = useRef(null);
  const exitTimerRef = useRef(null);
  const isDismissingRef = useRef(false);

  const triggerExit = useCallback(() => {
    if (isDismissingRef.current) return;
    isDismissingRef.current = true;
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setExiting(true);
    exitTimerRef.current = setTimeout(() => {
      onDismiss?.(id);
    }, 160);
  }, [id, onDismiss]);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isDismissingRef.current) return undefined;

    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }

    if (hovered) {
      return undefined;
    }

    dismissTimerRef.current = setTimeout(() => {
      triggerExit();
    }, effectiveDuration + 35);

    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [hovered, cycleKey, resetToken, effectiveDuration, triggerExit]);

  const handleMouseEnter = () => {
    if (isDismissingRef.current) return;
    setHovered(true);
  };

  const handleMouseLeave = () => {
    if (isDismissingRef.current) return;
    setHovered(false);
    setCycleKey((prev) => prev + 1);
  };

  const hasHeaderRow = Boolean(badge || title || count > 1);
  const hasActionButton = Boolean(actionLabel && typeof onAction === 'function');
  const tooltipText = fullText && fullText.length > 78 ? fullText : undefined;

  const handleToastKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      triggerExit();
    }
  };

  return (
    <div
      role={resolvedVariant === 'error' ? 'alert' : 'status'}
      aria-live={resolvedVariant === 'error' ? 'assertive' : 'polite'}
      tabIndex={0}
      title={tooltipText}
      className={`bb-toast bb-toast--${resolvedVariant} ${exiting ? 'is-exiting' : ''}`.trim()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={triggerExit}
      onKeyDown={handleToastKeyDown}
    >
      <span className="bb-toast__icon-wrap" aria-hidden="true">
        <Icon name={resolvedIcon} size={15} />
      </span>

      <div
        className={`bb-toast__content ${!hasHeaderRow ? 'bb-toast__content--single' : ''}`.trim()}
      >
        {hasHeaderRow && (
          <div className="bb-toast__head">
            {badge && <span className="bb-toast__badge">{badge}</span>}
            {title && <span className="bb-toast__title">{title}</span>}
            {count > 1 && <span className="bb-toast__repeat">×{count}</span>}
          </div>
        )}
        {message && <div className="bb-toast__message">{message}</div>}
      </div>

      {hasActionButton && (
        <div className="bb-toast__actions">
          <button
            type="button"
            className="bb-toast__action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onAction();
              triggerExit();
            }}
          >
            {actionIcon && <Icon name={actionIcon} size={13} />}
            <span>{actionLabel}</span>
          </button>
        </div>
      )}

      <div className="bb-toast__progress-track" aria-hidden="true">
        {hovered ? (
          <div className="bb-toast__progress-bar bb-toast__progress-bar--reset" />
        ) : (
          <div
            key={`bar-${cycleKey}-${resetToken}`}
            className="bb-toast__progress-bar bb-toast__progress-bar--running"
            style={{ animationDuration: `${effectiveDuration}ms` }}
            onAnimationEnd={triggerExit}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Floating M3 Toast Stack positioned directly beneath TopBar (`placement="top"`),
 * directly above the chat composer (`placement="composer"`), or inline in Sandbox.
 */
export function ToastStack({
  toasts = [],
  onDismiss,
  placement = 'top',
  inline = false,
  className = '',
}) {
  if (!Array.isArray(toasts) || toasts.length === 0) return null;

  const placementClass = inline
    ? 'bb-toast-stack--inline'
    : placement === 'composer'
      ? 'bb-toast-stack--composer'
      : 'bb-toast-stack--top';

  return (
    <div
      className={`bb-toast-stack ${placementClass} ${className}`.trim()}
      aria-label="Notifications"
    >
      {toasts.map((item) => (
        <Toast key={item.id} {...item} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
