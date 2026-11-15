import React from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import './FloatingPalette.css';

/**
 * FloatingPalette — Reusable Pure M3 Capsule Toolbar / Stepper Molecule.
 *
 * Houses circular 1:1 icon buttons (`FloatingPaletteButton` without label)
 * and capsule action/readout pills (`FloatingPaletteButton` with label) inside
 * an opaque elevated M3 capsule surface.
 */
export function FloatingPalette({
  role = 'toolbar',
  ariaLabel,
  className = '',
  children,
  ...rest
}) {
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={`bb-floating-palette ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}

export function FloatingPaletteButton({
  icon,
  iconRight,
  iconSize = 14,
  active = false,
  disabled = false,
  mono = false,
  title,
  ariaLabel,
  type = 'button',
  className = '',
  onClick,
  children,
  ...rest
}) {
  const hasLabel =
    children !== undefined &&
    children !== null &&
    children !== false &&
    children !== '';

  const classes = [
    'bb-floating-palette__btn',
    hasLabel ? 'bb-floating-palette__btn--pill' : 'bb-floating-palette__btn--circle',
    active ? 'is-active' : '',
    mono ? 'is-mono' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active || undefined}
      className={classes}
      onClick={onClick}
      {...rest}
    >
      {icon && (
        <span className="bb-floating-palette__icon">
          {typeof icon === 'string' ? <Icon name={icon} size={iconSize} /> : icon}
        </span>
      )}
      {hasLabel && <span className="bb-floating-palette__label">{children}</span>}
      {iconRight && (
        <span className="bb-floating-palette__icon">
          {typeof iconRight === 'string' ? (
            <Icon name={iconRight} size={iconSize} />
          ) : (
            iconRight
          )}
        </span>
      )}
    </button>
  );
}

export function FloatingPaletteDivider({ className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`bb-floating-palette__divider ${className}`.trim()}
    />
  );
}

export function FloatingPaletteReadout({ title, className = '', children }) {
  return (
    <span
      title={title}
      className={`bb-floating-palette__readout ${className}`.trim()}
    >
      {children}
    </span>
  );
}
