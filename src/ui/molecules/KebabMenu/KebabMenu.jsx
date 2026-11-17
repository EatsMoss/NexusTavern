import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useViewport } from '@core/hooks/useViewport.js';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Button } from '../../atoms/Button/Button.jsx';
import { BottomSheet } from '../../organisms/BottomSheet/BottomSheet.jsx';
import './KebabMenu.css';

/**
 * Reusable M3 Kebab / Action Popover Menu Molecule.
 * Renders an anchored Solid Sheet popover on desktop/tablet and automatically
 * upgrades to a thumb-friendly M3 BottomSheet (`48px` rows) on `compact` viewports.
 */
export function KebabMenu({
  items = [],
  getItems = null,
  icon = 'moreVert',
  size = 'sm',
  align = 'right',
  title = 'Actions',
  subtitle = '',
  disabled = false,
  mobileSheet = true,
  onOpenChange = null,
  className = '',
}) {
  const { isMobile } = useViewport();
  const [open, setOpen] = useState(false);
  const useMobileBottomSheet = Boolean(mobileSheet && isMobile);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);
  const [coords, setCoords] = useState({ top: 0, left: 0, ready: false });
  const rootRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    const parentEl = rootRef.current?.parentElement;
    if (open && parentEl) {
      parentEl.setAttribute('data-kebab-open', 'true');
    } else if (parentEl) {
      parentEl.removeAttribute('data-kebab-open');
    }
    onOpenChange?.(open);
    return () => {
      parentEl?.removeAttribute('data-kebab-open');
    };
  }, [open, onOpenChange]);

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
    if (!open || useMobileBottomSheet) {
      setCoords((prev) => (prev.ready ? { top: 0, left: 0, ready: false } : prev));
      return;
    }
    updatePosition();
  }, [open, useMobileBottomSheet, visibleItems.length, updatePosition]);

  useEffect(() => {
    if (!open || useMobileBottomSheet) return undefined;

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
  }, [open, useMobileBottomSheet]);

  if (!getItems && visibleItems.length === 0) return null;
  if (open && visibleItems.length === 0) return null;

  const renderMenuItems = (inSheet = false) =>
    visibleItems.map((item, idx) =>
      item.divider ? (
        <div
          key={item.id || `div-${idx}`}
          role="separator"
          className="bb-kebab-menu__divider"
        />
      ) : (
        <button
          key={item.id || item.label || idx}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          title={item.title || item.label}
          className={[
            'bb-kebab-menu__item',
            inSheet ? 'bb-kebab-menu__item--sheet' : '',
            item.active ? 'bb-kebab-menu__item--active' : '',
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
              <Icon name={item.icon} size={inSheet ? 18 : 16} />
            </span>
          )}
          <span className="bb-kebab-menu__item-label">{item.label}</span>
          {item.active && (
            <span className="bb-kebab-menu__item-check">
              <Icon name="check" size={inSheet ? 16 : 14} />
            </span>
          )}
        </button>
      ),
    );

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
        aria-haspopup={useMobileBottomSheet ? 'dialog' : 'menu'}
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
        (useMobileBottomSheet ? (
          <BottomSheet
            open={open}
            onClose={() => setOpen(false)}
            title={title}
            subtitle={subtitle}
            zIndex={9992}
            bodyClassName="bb-kebab-menu__sheet-body"
          >
            <div role="menu" className="bb-kebab-menu__sheet-list">
              {renderMenuItems(true)}
            </div>
          </BottomSheet>
        ) : (
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
              {renderMenuItems(false)}
            </div>,
            document.body,
          )
        ))}
    </div>
  );
}

