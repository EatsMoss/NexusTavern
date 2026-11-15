import React from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import './Checkbox.css';

/**
 * M3 Checkbox — a single reusable indicator for every selection surface
 * (bulk-select lists, card tiles, chat history rows).
 *
 * Two presentations:
 *   - `plain`  — an inline checkbox that owns its state (menus, lists)
 *   - `overlay`— a raised badge meant to sit on top of imagery (card tiles)
 *
 * The component only renders the indicator. The clickable target stays with
 * the caller, so a whole row or tile can toggle it without nested buttons.
 */
export function Checkbox({
  checked = false,
  onChange,
  disabled = false,
  variant = 'plain', // 'plain' | 'overlay'
  size = 'md', // 'sm' (16px) | 'md' (20px)
  label,
  interactive = true,
  className = '',
  ...rest
}) {
  const classes = [
    'bb-m3-checkbox',
    `bb-m3-checkbox--${variant}`,
    `bb-m3-checkbox--${size}`,
    checked ? 'is-checked' : '',
    disabled ? 'is-disabled' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = (event) => {
    if (!interactive || disabled) return;
    event.stopPropagation();
    onChange?.(!checked, event);
  };

  const indicator = (
    <span
      className={classes}
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      tabIndex={interactive ? 0 : -1}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (!interactive || disabled) return;
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          onChange?.(!checked, event);
        }
      }}
      {...rest}
    >
      {checked && <Icon name="check" size={size === 'sm' ? 11 : 13} />}
    </span>
  );

  if (!label) return indicator;

  return (
    <label className="bb-m3-checkbox-field">
      {indicator}
      <span className="bb-m3-checkbox-field__label">{label}</span>
    </label>
  );
}
