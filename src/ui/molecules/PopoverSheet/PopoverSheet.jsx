import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useViewport } from '@core/hooks/useViewport.js';
import { Button } from '../../atoms/Button/Button.jsx';
import { BottomSheet } from '../../organisms/BottomSheet/BottomSheet.jsx';
import './PopoverSheet.css';

/**
 * Reusable M3 Solid Sheet Popover Molecule.
 * Anchors an opaque M3 surface (`--bb-sheet-bg`) on desktop/tablet and automatically
 * promotes to an M3 Modal BottomSheet on `compact` viewports (`mobileSheet = true`).
 */
export function PopoverSheet({
  open: controlledOpen,
  onOpenChange,
  icon = 'sliders',
  label = '',
  size = 'sm',
  variant = 'b2',
  align = 'right',
  title = 'Options',
  activeIndicator = false,
  disabled = false,
  mobileSheet = true,
  width = 276,
  triggerClassName = '',
  popoverClassName = '',
  className = '',
  children,
}) {
  const { isMobile } = useViewport();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? Boolean(controlledOpen) : uncontrolledOpen;
  const useMobileBottomSheet = Boolean(mobileSheet && isMobile);

  const setOpen = useCallback(
    (next) => {
      const resolved = typeof next === 'function' ? next(open) : Boolean(next);
      if (!isControlled) {
        setUncontrolledOpen(resolved);
      }
      onOpenChange?.(resolved);
    },
    [isControlled, open, onOpenChange],
  );

  const [coords, setCoords] = useState({ top: 0, left: 0, ready: false });
  const rootRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open, setOpen]);

  const updatePosition = useCallback(() => {
    const anchor = rootRef.current;
    const popEl = popoverRef.current;
    if (!anchor || !popEl) return;

    const rect = anchor.getBoundingClientRect();
    const pRect = popEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = align === 'left' ? rect.left : rect.right - pRect.width;
    let top = rect.bottom + 6;

    if (left < 8) left = 8;
    if (left + pRect.width > vw - 8) {
      left = Math.max(8, vw - pRect.width - 8);
    }
    if (top + pRect.height > vh - 8) {
      top = Math.max(8, rect.top - pRect.height - 6);
    }

    setCoords({
      top: Math.round(top),
      left: Math.round(left),
      ready: true,
    });
  }, [align]);

  useLayoutEffect(() => {
    if (!open || useMobileBottomSheet) {
      setCoords((prev) => (prev.ready ? { top: 0, left: 0, ready: false } : prev));
      return;
    }
    updatePosition();
  }, [open, useMobileBottomSheet, updatePosition]);

  useEffect(() => {
    if (!open || useMobileBottomSheet) return undefined;

    const handlePointerDown = (e) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target) &&
        (!popoverRef.current || !popoverRef.current.contains(e.target))
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    const handleResize = () => {
      updatePosition();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, useMobileBottomSheet, setOpen, updatePosition]);

  const resolvedContent =
    typeof children === 'function' ? children({ close: () => setOpen(false) }) : children;

  return (
    <div
      ref={rootRef}
      className={`bb-popover-sheet ${open ? 'is-open' : ''} ${className}`.trim()}
    >
      <Button
        variant={variant}
        size={size}
        icon={icon}
        active={open || activeIndicator}
        disabled={disabled}
        title={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`bb-popover-sheet__trigger ${triggerClassName}`.trim()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
      >
        {label || null}
      </Button>

      {open &&
        (useMobileBottomSheet ? (
          <BottomSheet
            open={open}
            onClose={() => setOpen(false)}
            title={title}
            icon={icon}
            zIndex={9988}
            bodyClassName={`bb-popover-sheet__mobile-body ${popoverClassName}`.trim()}
          >
            {resolvedContent}
          </BottomSheet>
        ) : (
          typeof document !== 'undefined' &&
          createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              aria-label={title}
              className={`bb-popover-sheet__surface ${popoverClassName}`.trim()}
              style={{
                position: 'fixed',
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                width: typeof width === 'number' ? `${width}px` : width,
                maxWidth: 'calc(100vw - 16px)',
                visibility: coords.ready ? 'visible' : 'hidden',
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {resolvedContent}
            </div>,
            document.body,
          )
        ))}
    </div>
  );
}

