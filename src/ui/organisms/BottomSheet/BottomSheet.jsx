import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { OverlayScrollArea } from '@ui/atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import { useBottomSheetDrag } from './useBottomSheetDrag.js';
import './BottomSheet.css';

const openSheetStack = [];

/**
 * BottomSheet — Native Material Design 3 Modal Bottom Sheet Organism.
 * Supports top grabber drag-to-dismiss, Escape stack, scrim dismiss, safe-area & visualViewport,
 * plus `inline` preview mode for `TokenSandbox`.
 */
export function BottomSheet({
  open = false,
  onClose,
  title = '',
  subtitle = '',
  icon = '',
  headerActions = null,
  footer = null,
  showCloseButton = true,
  showGrabber = true,
  bodyScrollable = true,
  maxWidth = 560,
  maxHeight,
  zIndex,
  inline = false,
  className = '',
  bodyClassName = '',
  ariaLabel,
  children,
}) {
  const sheetId = useId();
  const sheetRef = useRef(null);
  const scrimPressRef = useRef(false);
  const { dragOffsetY, isDragging, dragZoneHandlers } = useBottomSheetDrag({
    open,
    onClose,
    sheetRef,
  });

  useEffect(() => {
    if (!open || inline) return undefined;
    openSheetStack.push(sheetId);
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && openSheetStack[openSheetStack.length - 1] === sheetId) {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      const idx = openSheetStack.lastIndexOf(sheetId);
      if (idx !== -1) openSheetStack.splice(idx, 1);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open, inline, onClose, sheetId]);

  if (!open) return null;

  const existingIdx = openSheetStack.indexOf(sheetId);
  const stackOrder = existingIdx !== -1 ? existingIdx : openSheetStack.length;
  const computedZIndex = zIndex ?? 9980 + stackOrder * 10;
  const hasHeader = Boolean(title || subtitle || icon || headerActions);

  const surfaceStyle = {
    '--bb-bs-max-width': typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth,
    ...(maxHeight
      ? { '--bb-bs-max-height': typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }
      : null),
    ...(dragOffsetY !== 0
      ? { transform: `translate3d(0, ${Math.round(dragOffsetY)}px, 0)` }
      : null),
  };

  const sheetNode = (
    <div
      ref={sheetRef}
      role={inline ? 'region' : 'dialog'}
      aria-modal={inline ? undefined : 'true'}
      aria-label={ariaLabel || title || 'Bottom sheet'}
      className={[
        'bb-bottom-sheet',
        inline ? 'bb-bottom-sheet--inline' : '',
        isDragging ? 'is-dragging' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={surfaceStyle}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {(showGrabber || hasHeader) && (
        <div className="bb-bottom-sheet__drag-zone" {...dragZoneHandlers}>
          {showGrabber && (
            <div className="bb-bottom-sheet__grabber-wrap" aria-hidden="true">
              <span className="bb-bottom-sheet__grabber" />
            </div>
          )}
          {hasHeader && (
            <header className="bb-bottom-sheet__header">
              <div className="bb-bottom-sheet__title-group">
                {icon && (
                  <span className="bb-bottom-sheet__icon">
                    <Icon name={icon} size={18} />
                  </span>
                )}
                <div className="bb-bottom-sheet__titles">
                  {title && <h3 className="bb-bottom-sheet__title">{title}</h3>}
                  {subtitle && <span className="bb-bottom-sheet__subtitle">{subtitle}</span>}
                </div>
              </div>
              <div className="bb-bottom-sheet__header-actions">
                {headerActions}
                {showCloseButton && onClose && (
                  <button
                    type="button"
                    aria-label="Close sheet"
                    title="Close"
                    className="bb-bottom-sheet__close-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                    }}
                  >
                    <Icon name="close" size={16} />
                  </button>
                )}
              </div>
            </header>
          )}
        </div>
      )}

      <OverlayScrollArea
        className="bb-bottom-sheet__body-wrap"
        viewportClassName={`bb-bottom-sheet__body ${bodyClassName}`.trim()}
        disabled={!bodyScrollable}
      >
        {children}
      </OverlayScrollArea>

      {footer && <footer className="bb-bottom-sheet__footer">{footer}</footer>}
    </div>
  );

  if (inline) return sheetNode;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="bb-bottom-sheet__scrim"
      style={{ zIndex: computedZIndex }}
      onPointerDown={(e) => {
        scrimPressRef.current =
          e.target === e.currentTarget && (e.button === 0 || e.button === undefined);
      }}
      onClick={(e) => {
        const shouldClose = e.target === e.currentTarget && scrimPressRef.current;
        scrimPressRef.current = false;
        if (shouldClose) onClose?.();
      }}
    >
      {sheetNode}
    </div>,
    document.body,
  );
}
