import React from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Switch } from '../../atoms/Switch/Switch.jsx';
import './ModuleNavCard.css';

/**
 * Reusable M3 Two-Line Module Navigation Card Molecule.
 * Displays an icon badge, title, live status/subtitle, optional quick Switch
 * (click-isolated from navigation), and a trailing navigation chevron.
 * Reused across the Plugins hub and mobile Workspace navigation lists.
 */
export function ModuleNavCard({
  icon = 'puzzle',
  title,
  subtitle = '',
  badge = null,
  badgeTone = 'neutral', // 'neutral' | 'active' | 'saved'
  toggleChecked,
  onToggleChange,
  toggleTitle = '',
  onClick,
  disabled = false,
  className = '',
}) {
  const hasToggle = typeof toggleChecked === 'boolean' && typeof onToggleChange === 'function';

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      className={[
        'bb-module-nav-card',
        disabled ? 'is-disabled' : '',
        hasToggle && !toggleChecked ? 'is-inactive' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => {
        if (!disabled) onClick?.();
      }}
      onKeyDown={handleKeyDown}
    >
      <span className="bb-module-nav-card__icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>

      <div className="bb-module-nav-card__body">
        <div className="bb-module-nav-card__title-row">
          <span className="bb-module-nav-card__title">{title}</span>
          {badge && (
            <span
              className={`bb-module-nav-card__badge bb-module-nav-card__badge--${badgeTone}`.trim()}
            >
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <div className="bb-module-nav-card__subtitle">{subtitle}</div>
        )}
      </div>

      <div
        className="bb-module-nav-card__trailing"
        onClick={(e) => {
          if (hasToggle && e.target.closest('.bb-module-nav-card__switch')) {
            e.stopPropagation();
          }
        }}
        onKeyDown={(e) => {
          if (hasToggle && e.target.closest('.bb-module-nav-card__switch')) {
            e.stopPropagation();
          }
        }}
      >
        {hasToggle && (
          <span className="bb-module-nav-card__switch">
            <Switch
              size="sm"
              bare
              checked={toggleChecked}
              disabled={disabled}
              title={toggleTitle || `Toggle ${title}`}
              onChange={(val) => onToggleChange(val)}
            />
          </span>
        )}
        <Icon
          name="chevronRight"
          size={18}
          className="bb-module-nav-card__chevron"
        />
      </div>
    </div>
  );
}
