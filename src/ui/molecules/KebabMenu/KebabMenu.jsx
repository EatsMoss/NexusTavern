import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import './KebabMenu.css';

/**
 * Reusable M3 Kebab / Action Popover Menu Molecule.
 * Renders its floating menu via a body portal so card/grid overflow never clips it.
 */
export function KebabMenu({
  items = [],
  getItems = null,
  icon = 'moreVert',
  size = 'sm',
  align = 'right',
  title = 'Card actions',
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);
  const [coords, setCoords] = useState({ top: 0, left: 0, ready: false });
  const rootRef = useRef(null);
  const menuRef = useRef(null);

  const updatePosition = useCallback(() => {
    const anchor = rootRef.current;
    const menuEl = menuRef.current;
    if (!anchor || !menuEl) return;

    const rect = anchor.getBoundingClientRect();
    const mRect = menuEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = align === 'left' ? rect.left : rect.right - mRect.width;
    let top = rect.bottom + 4;

    if (left < 8) left = rect.left;
    if (left + mRect.width > vw - 8) {
      left = Math.max(8, vw - mRect.width - 8);
    }
    if (top + mRect.height > vh - 8) {
      top = Math.max(8, rect.top - mRect.height - 4);
    }

    setCoords({
      top: Math.round(top),
      left: Math.round(left),
      ready: true,
    });
  }, [align]);

  const resolvedItems =
    typeof getItems === 'function' ? (open ? getItems() || [] : null) : items;
  const visibleItems = resolvedItems
    ? resolvedItems.filter((item) => item && !item.hidden)
    : [];

  useLayoutEffect(() => {
    if (!open) {
      setCoords((prev) => (prev.ready ? { top: 0, left: 0, ready: false } : prev));
      return;
    }
    updatePosition();
  }, [open, visibleItems.length, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (e) => {
      if (
        rootRef.current &&
        !rootRef.current.contains(e.target) &&
        (!menuRef.current || !menuRef.current.contains(e.target))
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [open]);

  if (!getItems && visibleItems.length === 0) return null;
  if (open && visibleItems.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className={`bb-kebab-menu ${open ? 'is-open' : ''} ${className}`.trim()}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
      }}
    >
      <Button
        variant="b2"
        size={size}
        icon={icon}
        active={open}
        disabled={disabled}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        className="bb-kebab-menu__trigger"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
      />

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className={`bb-kebab-menu__popover bb-kebab-menu__popover--${align}`}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              visibility: coords.ready ? 'visible' : 'hidden',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {visibleItems.map((item, idx) => (
              <button
                key={item.id || item.label || idx}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                title={item.title || item.label}
                className={[
                  'bb-kebab-menu__item',
                  item.danger ? 'bb-kebab-menu__item--danger' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                {item.icon && (
                  <span className="bb-kebab-menu__item-icon">
                    <Icon name={item.icon} size={16} />
                  </span>
                )}
                <span className="bb-kebab-menu__item-label">{item.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

