import React from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import './BookmarkRibbons.css';

/**
 * BookmarkRibbons — Modern M3 Primary & Secondary Tabs with Bottom Active Underline
 *
 * `variant`:
 *  - `'primary'` (default): Tome top navigation tabs (icon + title).
 *  - `'secondary'`: Sheet / panel sub-tabs (compact label-focused tabs, matching Selected Scenario).
 *
 * Tabs may carry `disabled` and `disabledReason`; a disabled tab stays visible
 * but cannot be activated, and `title` explains why it is unavailable.
 */
export function BookmarkRibbons({
  tabs = [],
  activeId,
  onChange,
  variant = 'primary',
  className = '',
}) {
  const variantClass = variant === 'secondary' ? 'bb-m3-tabs--secondary' : '';
  return (
    <nav className={`bb-m3-tabs ${variantClass} ${className}`.trim()} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const isDisabled = Boolean(tab.disabled);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled || undefined}
            disabled={isDisabled}
            title={isDisabled ? tab.disabledReason : tab.title}
            onClick={() => onChange?.(tab.id)}
            className={`bb-m3-tab ${isActive ? 'bb-m3-tab--active' : ''} ${
              isDisabled ? 'bb-m3-tab--disabled' : ''
            }`.trim()}
          >
            {tab.icon && (
              <span className="bb-m3-tab__icon">
                <Icon name={tab.icon} size={18} />
              </span>
            )}
            <span className="bb-m3-tab__title">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}


