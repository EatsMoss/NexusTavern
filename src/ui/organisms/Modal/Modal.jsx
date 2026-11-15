import React, { useEffect, useId, useRef } from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { OverlayScrollArea } from '@ui/atoms/OverlayScrollArea/OverlayScrollArea.jsx';
import './Modal.css';

const openModalStack = [];

export function Modal({
  open = false,
  onClose,
  title,
  subtitle,
  icon = 'window',
  width,
  zIndex,
  className = '',
  bodyClassName = '',
  bodyScrollable = true,
  footer,
  children,
}) {
  const modalId = useId();
  const overlayPressStartedRef = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    openModalStack.push(modalId);
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && openModalStack[openModalStack.length - 1] === modalId) {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      const idx = openModalStack.lastIndexOf(modalId);
      if (idx !== -1) openModalStack.splice(idx, 1);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, modalId]);

  if (!open) return null;

  const existingIdx = openModalStack.indexOf(modalId);
  const stackOrder = existingIdx !== -1 ? existingIdx : openModalStack.length;
  const computedZIndex = zIndex ?? 3000 + stackOrder * 20;

  return (
    <div
      className="bb-modal-overlay"
      style={{ zIndex: computedZIndex }}
      onPointerDown={(e) => {
        overlayPressStartedRef.current = e.target === e.currentTarget && e.button === 0;
      }}
      onClick={(e) => {
        const shouldClose =
          e.target === e.currentTarget && overlayPressStartedRef.current === true;
        overlayPressStartedRef.current = false;
        if (shouldClose) {
          onClose?.();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bb-modal-frame ${className}`.trim()}
        style={width ? { width: `min(${width}px, 94vw)` } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bb-modal-grabber" aria-hidden="true" />
        <header className="bb-modal-header">
          <div className="bb-modal-title-group">
            {icon && <Icon name={icon} size={18} className="bb-modal-icon" />}
            <div className="bb-modal-title-copy">
              <h3 className="bb-modal-title">{title}</h3>
              {subtitle && <div className="bb-modal-subtitle">{subtitle}</div>}
            </div>
          </div>

          <button
            type="button"
            aria-label="Close window"
            className="bb-modal-close-btn"
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <OverlayScrollArea
          className="bb-modal-body-wrap"
          viewportClassName={`bb-modal-body ${bodyClassName}`.trim()}
          disabled={!bodyScrollable}
        >
          {children}
        </OverlayScrollArea>

        {footer && <footer className="bb-modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}
