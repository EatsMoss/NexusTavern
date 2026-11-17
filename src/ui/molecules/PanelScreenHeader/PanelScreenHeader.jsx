import React from 'react';
import { Button } from '../../atoms/Button/Button.jsx';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import './PanelScreenHeader.css';

/**
 * Reusable M3 Panel Sub-Screen Header Molecule (`← Plugins`, `← Selected`, etc.).
 * Provides a consistent back button, screen title, optional status badge/subtitle,
 * and trailing contextual actions slot for focused sub-screens inside side tomes
 * or mobile sheets.
 */
export function PanelScreenHeader({
  title,
  subtitle = '',
  icon = '',
  badge = null,
  backLabel = 'Back',
  onBack,
  actions = null,
  className = '',
}) {
  return (
    <header className={`bb-panel-screen-header ${className}`.trim()}>
      <div className="bb-panel-screen-header__left">
        {onBack && (
          <Button
            variant="b2"
            size="sm"
            icon="arrowLeft"
            title={backLabel}
            aria-label={backLabel}
            className="bb-panel-screen-header__back"
            onClick={onBack}
          />
        )}
        <div className="bb-panel-screen-header__titles">
          <div className="bb-panel-screen-header__title-row">
            {icon && (
              <Icon
                name={icon}
                size={16}
                className="bb-panel-screen-header__icon"
              />
            )}
            <h3 className="bb-panel-screen-header__title">{title}</h3>
            {badge && <span className="bb-panel-screen-header__badge">{badge}</span>}
          </div>
          {subtitle && (
            <div className="bb-panel-screen-header__subtitle">{subtitle}</div>
          )}
        </div>
      </div>

      {actions && (
        <div className="bb-panel-screen-header__actions">{actions}</div>
      )}
    </header>
  );
}
