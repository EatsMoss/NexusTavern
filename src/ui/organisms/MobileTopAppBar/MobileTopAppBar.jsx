import React from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { SafeImage } from '@ui/atoms/SafeImage/SafeImage.jsx';
import './MobileTopAppBar.css';

function computeInitials(name = '') {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'NT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

/**
 * MobileTopAppBar — Compact Material Design 3 Top App Bar (`52px` portrait / `40px` short viewport).
 *
 * Slots:
 * - `leading`: optional back / leading button.
 * - Clickable identity pill (`avatarUrl` / `avatarInitials` + `title` + `subtitle` + chevron)
 *   when `onTitleClick` is provided (e.g. opens Chat & Branch switcher `BottomSheet`).
 * - `actions`: right-aligned circular icon-only action buttons.
 */
export function MobileTopAppBar({
  leading = null,
  avatarUrl = '',
  avatarInitials = '',
  icon = '',
  title = '',
  subtitle = '',
  onTitleClick = null,
  titleButtonLabel = '',
  titleExpanded = false,
  actions = null,
  className = '',
}) {
  const isInteractiveTitle = typeof onTitleClick === 'function';
  const resolvedInitials = avatarInitials || computeInitials(title);
  const showAvatar = Boolean(avatarUrl || avatarInitials);

  const identityInner = (
    <>
      {showAvatar ? (
        <span className="bb-mobile-topbar__avatar">
          {avatarUrl ? (
            <SafeImage
              src={avatarUrl}
              alt={title || 'Avatar'}
              className="bb-mobile-topbar__avatar-img"
              fallback={<span className="bb-mobile-topbar__avatar-initials">{resolvedInitials}</span>}
            />
          ) : (
            <span className="bb-mobile-topbar__avatar-initials">{resolvedInitials}</span>
          )}
        </span>
      ) : icon ? (
        <span className="bb-mobile-topbar__icon">
          <Icon name={icon} size={18} />
        </span>
      ) : null}

      <span className="bb-mobile-topbar__titles">
        <span className="bb-mobile-topbar__title-row">
          <span className="bb-mobile-topbar__title">{title || 'NexusTavern'}</span>
          {isInteractiveTitle && (
            <Icon
              name="chevronDown"
              size={15}
              className={`bb-mobile-topbar__chevron ${titleExpanded ? 'is-open' : ''}`.trim()}
            />
          )}
        </span>
        {subtitle && <span className="bb-mobile-topbar__subtitle">{subtitle}</span>}
      </span>
    </>
  );

  return (
    <header className={`bb-mobile-topbar ${className}`.trim()} role="banner">
      {leading && <div className="bb-mobile-topbar__leading">{leading}</div>}

      {isInteractiveTitle ? (
        <button
          type="button"
          className="bb-mobile-topbar__identity bb-mobile-topbar__identity--button"
          title={titleButtonLabel || `${title}${subtitle ? ` — ${subtitle}` : ''}`}
          aria-label={titleButtonLabel || `Switch chat or branch for ${title}`}
          aria-haspopup="dialog"
          aria-expanded={titleExpanded}
          onClick={onTitleClick}
        >
          {identityInner}
        </button>
      ) : (
        <div className="bb-mobile-topbar__identity">{identityInner}</div>
      )}

      {actions && <div className="bb-mobile-topbar__actions">{actions}</div>}
    </header>
  );
}
