import React from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import './ToggleGroup.css';

/**
 * M3 Segmented Button in its compact size, for the dense switchers inside the
 * right tome (4/5/6 columns, 1:1 vs 2:3, entity type, sort order).
 *
 * Kept separate from `SegmentedGroup`, which renders full-size buttons with
 * labels and is too tall for a narrow tome column.
 */
export function ToggleGroup({
  options = [],
  value,
  onChange,
  size = 'md', // 'sm' | 'md'
  title,
  className = '',
}) {
  return (
    <div
      role="radiogroup"
      title={title}
      className={`bb-toggle-group bb-toggle-group--${size} ${className}`.trim()}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={opt.title || opt.label}
            title={opt.title || opt.label}
            disabled={opt.disabled}
            className={`bb-toggle-group__item ${isActive ? 'is-active' : ''}`}
            onClick={() => onChange?.(opt.value)}
          >
            {opt.icon && <Icon name={opt.icon} size={size === 'sm' ? 13 : 15} />}
            {opt.label && <span className="bb-toggle-group__label">{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
