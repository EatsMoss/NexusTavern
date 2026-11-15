import React from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import './Button.css';

/**
 * M3 Unified Button System (B1: Primary/Tonal/Outlined, B2: Ghost Icon, B3: Segmented Tab, B4: Danger)
 */
export function Button({
  variant = 'b1',
  emphasis = 'tonal', // 'tonal' | 'filled' | 'outlined' (for b1)
  size = 'md', // 'sm' | 'md' | 'lg'
  pill = false,
  borderless = false,
  fullWidth = false,
  active = false,
  icon,
  iconRight,
  disabled = false,
  title,
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
    'bb-m3-btn',
    hasLabel ? 'bb-m3-btn--has-label' : 'bb-m3-btn--icon-only',
  ];

  if (variant === 'b1') {
    classes.push(`bb-m3-btn--b1-${emphasis}`);
  } else if (variant === 'b2') {
    classes.push('bb-m3-btn--b2');
    if (active) classes.push('bb-m3-btn--b2-active');
  } else if (variant === 'b3') {
    classes.push('bb-m3-btn--b3');
    if (active) classes.push('bb-m3-btn--b3-active');
  } else if (variant === 'b4') {
    classes.push('bb-m3-btn--b4');
  }

  if (size === 'sm') classes.push('bb-m3-btn--sm');
  if (size === 'lg') classes.push('bb-m3-btn--lg');
  if (pill) classes.push('bb-m3-btn--pill');
  if (borderless) classes.push('bb-m3-btn--borderless');
  if (fullWidth) classes.push('bb-m3-btn--full');
  if (className) classes.push(className);

  const iconSize = size === 'sm' ? 15 : size === 'lg' ? 21 : 17;

  return (
    <button
      type={type}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={classes.join(' ')}
      {...rest}
    >
      {icon && (
        <span className="bb-m3-btn__icon">
          {typeof icon === 'string' ? <Icon name={icon} size={iconSize} /> : icon}
        </span>
      )}
      {children && <span className="bb-m3-btn__label">{children}</span>}
      {iconRight && (
        <span className="bb-m3-btn__icon">
          {typeof iconRight === 'string' ? <Icon name={iconRight} size={iconSize} /> : iconRight}
        </span>
      )}
    </button>
  );
}

/**
 * B3 Segmented Button Group (Sub-tab switcher)
 *
 * Options may carry `disabled` and `disabledReason`; a disabled tab stays
 * visible but is skipped by pointer/keyboard activation, and `title` explains
 * why it is unavailable.
 */
export function SegmentedGroup({ options = [], value, onChange, fullWidth = false, className = '' }) {
  return (
    <div
      role="tablist"
      className={`bb-m3-segmented ${fullWidth ? 'bb-m3-segmented--full' : ''} ${className}`.trim()}
    >
      {options.map((opt) => {
        const optVal = opt.value ?? opt.id;
        const isSelected = optVal === value;
        const isDisabled = Boolean(opt.disabled);
        return (
          <Button
            key={optVal}
            variant="b3"
            role="tab"
            aria-selected={isSelected}
            aria-disabled={isDisabled || undefined}
            active={isSelected}
            disabled={isDisabled}
            title={isDisabled ? opt.disabledReason : opt.title}
            icon={opt.icon}
            onClick={() => onChange?.(optVal)}
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
