import React, { useState } from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import './FolderCard.css';

export function FolderCard({
  title,
  subtitle,
  icon,
  actions,
  collapsible = true,
  defaultOpen = true,
  forceOpen = false,
  className = '',
  children,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const effectiveOpen = forceOpen || isOpen;

  const handleHeaderClick = () => {
    if (!collapsible || forceOpen) return;
    setIsOpen((prev) => !prev);
  };

  return (
    <section
      className={[
        'bb-m3-folder',
        collapsible ? 'bb-m3-folder--collapsible' : '',
        effectiveOpen ? 'bb-m3-folder--open' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="bb-m3-folder__header" onClick={handleHeaderClick}>
        <div className="bb-m3-folder__title-group">
          {icon && <Icon name={icon} size={18} className="bb-m3-folder__icon" />}
          <div>
            <h3 className="bb-m3-folder__title">{title}</h3>
            {subtitle && <div className="bb-m3-folder__subtitle">{subtitle}</div>}
          </div>
        </div>

        <div className="bb-m3-folder__actions" onClick={(e) => e.stopPropagation()}>
          {actions}
          {collapsible && !forceOpen && (
            <span
              className="bb-m3-folder__chevron"
              onClick={handleHeaderClick}
              role="button"
              tabIndex={0}
              aria-label={effectiveOpen ? 'Collapse section' : 'Expand section'}
            >
              <Icon name="chevronDown" size={18} />
            </span>
          )}
        </div>
      </header>

      {effectiveOpen && <div className="bb-m3-folder__body">{children}</div>}
    </section>
  );
}
