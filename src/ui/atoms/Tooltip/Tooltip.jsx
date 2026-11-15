import React, { useState, useRef, useLayoutEffect, useEffect, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

/**
 * M3 Plain Tooltip Atom — opaque tonal surface rendered in a portal
 * with automatic viewport collision clamping.
 */
export function Tooltip({
  content,
  placement = 'top',
  mono = false,
  rich = false,
  offset = 7,
  delayMs = 80,
  disabled = false,
  className = '',
  triggerClassName = '',
  children,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ left: -9999, top: -9999 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const timerRef = useRef(null);
  const tooltipId = useId();

  const isNodeContent = React.isValidElement(content);
  const hasContent =
    content !== null &&
    content !== undefined &&
    (isNodeContent || String(content).trim() !== '');

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const show = () => {
    if (disabled || !hasContent) return;
    clearTimer();
    if (delayMs <= 0) {
      setOpen(true);
    } else {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setOpen(true);
      }, delayMs);
    }
  };

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, []);

  useEffect(() => () => clearTimer(), []);

  const updatePosition = useCallback(() => {
    const anchor = triggerRef.current;
    const tip = tooltipRef.current;
    if (!anchor || !tip || typeof window === 'undefined') return;

    const anchorRect = anchor.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const pad = 8;

    let left = anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
    if (left + tipRect.width > window.innerWidth - pad) {
      left = window.innerWidth - tipRect.width - pad;
    }
    if (left < pad) left = pad;

    let top =
      placement === 'bottom'
        ? anchorRect.bottom + offset
        : anchorRect.top - tipRect.height - offset;

    if (placement !== 'bottom' && top < pad) {
      top = anchorRect.bottom + offset;
    } else if (placement === 'bottom' && top + tipRect.height > window.innerHeight - pad) {
      top = Math.max(pad, anchorRect.top - tipRect.height - offset);
    }

    setCoords({ left: Math.round(left), top: Math.round(top) });
  }, [placement, offset]);

  useLayoutEffect(() => {
    if (!open || !hasContent) return;
    updatePosition();
  }, [open, hasContent, content, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;
    const handleDismiss = (e) => {
      if (triggerRef.current && triggerRef.current.contains(e.target)) return;
      hide();
    };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('pointerdown', handleDismiss, true);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('pointerdown', handleDismiss, true);
    };
  }, [open, hide, updatePosition]);

  if (!hasContent || disabled) {
    return children;
  }

  return (
    <>
      <span
        ref={triggerRef}
        className={`bb-m3-tooltip-trigger ${triggerClassName}`.trim()}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          if (e.detail === 0 || window.matchMedia?.('(hover: none)').matches) {
            setOpen((prev) => !prev);
          }
        }}
      >
        {children}
      </span>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className={[
              'bb-m3-tooltip',
              mono ? 'bb-m3-tooltip--mono' : '',
              rich || isNodeContent ? 'bb-m3-tooltip--rich' : '',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
