import React from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { useViewport } from '@core/hooks/useViewport.js';
import './BottomNavBar.css';

/**
 * BottomNavBar — Material Design 3 Navigation Bar & Landscape Navigation Rail Organism.
 *
 * `orientation`:
 * - `'auto'` (default): Bottom Navigation Bar (`64px + safe-area-bottom`) in portrait,
 *   automatically switching to a left-docked M3 Navigation Rail (`64px + safe-area-left`)
 *   when `isShortViewport` is active (smartphone landscape).
 * - `'horizontal'`: Always renders as Bottom Navigation Bar.
 * - `'rail'`: Always renders as vertical M3 Navigation Rail.
 *
 * Each item supports:
 * `{ id, label, icon, badge, dot, dotTone ('primary' | 'warning' | 'live'), disabled }`
 */
export function BottomNavBar({
  items = [],
  activeId = '',
  onChange,
  orientation = 'auto',
  hidden = false,
  ariaLabel = 'Primary navigation',
  className = '',
}) {
  const { isShortViewport } = useViewport();

  if (hidden || !Array.isArray(items) || items.length === 0) {
    return null;
  }

  const resolvedMode =
    orientation === 'rail' || (orientation === 'auto' && isShortViewport)
      ? 'rail'
      : 'bar';

  return (
    <nav
      aria-label={ariaLabel}
      className={[
        'bb-bottom-nav',
        resolvedMode === 'rail' ? 'bb-bottom-nav--rail' : 'bb-bottom-nav--bar',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        const isDisabled = Boolean(item.disabled);
        const badgeText =
          item.badge !== undefined && item.badge !== null && item.badge !== '' && item.badge !== 0
            ? String(item.badge)
            : '';
        const showDot = Boolean(item.dot) && !badgeText;
        const dotTone = item.dotTone || 'primary';

        return (
          <button
            key={item.id}
            type="button"
            disabled={isDisabled}
            aria-current={isActive ? 'page' : undefined}
            title={item.title || item.label}
            className={[
              'bb-bottom-nav__item',
              isActive ? 'is-active' : '',
              isDisabled ? 'is-disabled' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              if (!isDisabled) {
                onChange?.(item.id);
              }
            }}
          >
            <span className="bb-bottom-nav__pill">
              <Icon name={item.icon || 'sparkles'} size={20} className="bb-bottom-nav__icon" />
              {badgeText && (
                <span className="bb-bottom-nav__badge" aria-label={`${badgeText} notifications`}>
                  {badgeText}
                </span>
              )}
              {showDot && (
                <span
                  className={`bb-bottom-nav__dot bb-bottom-nav__dot--${dotTone}`}
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="bb-bottom-nav__label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
