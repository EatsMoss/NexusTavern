import React from 'react';
import { Icon } from '../Icon/Icon.jsx';
import './Badge.css';

/**
 * Material You (M3) capsule badge atom for version pills, status chips and compact metadata.
 */
export function Badge({
  variant = 'neutral', // 'neutral' | 'tonal' | 'outlined'
  size = 'sm', // 'sm' | 'md'
  mono = false,
  icon = null,
  title,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'bb-m3-badge',
    `bb-m3-badge--${variant}`,
    size === 'md' ? 'bb-m3-badge--md' : 'bb-m3-badge--sm',
    mono ? 'bb-m3-badge--mono' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} title={title} {...rest}>
      {icon && (
        <span className="bb-m3-badge__icon" aria-hidden="true">
          {typeof icon === 'string' ? <Icon name={icon} size={size === 'md' ? 13 : 11} /> : icon}
        </span>
      )}
      <span className="bb-m3-badge__label">{children}</span>
    </span>
  );
}
