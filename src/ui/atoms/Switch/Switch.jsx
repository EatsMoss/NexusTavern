import React from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import './Switch.css';

export function Switch({
  checked = false,
  onChange,
  label,
  inlineLabel,
  description,
  disabled = false,
  bare = false,
  size = 'md',
  title,
  className = '',
}) {
  const handleToggle = () => {
    if (disabled) return;
    onChange?.(!checked);
  };

  const hasRowCopy = Boolean(label || description);
  const resolvedInlineLabel = inlineLabel || (bare ? label : '');

  const switchBtn = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={title || resolvedInlineLabel || label || undefined}
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        handleToggle();
      }}
      className={[
        'bb-m3-switch',
        size === 'sm' ? 'bb-m3-switch--sm' : '',
        checked ? 'bb-m3-switch--checked' : '',
        (!hasRowCopy && !resolvedInlineLabel) ? className : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="bb-m3-switch__thumb">
        {checked && <Icon name="check" size={size === 'sm' ? 10 : 13} />}
      </span>
    </button>
  );

  // Never wrap a standalone switch in a box/button container
  if (!hasRowCopy && !resolvedInlineLabel) {
    return switchBtn;
  }

  if (bare || (!description && inlineLabel)) {
    return (
      <span
        className={[
          'bb-m3-switch-inline',
          disabled ? 'bb-m3-switch-inline--disabled' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          handleToggle();
        }}
      >
        <span className="bb-m3-switch-inline__label">{resolvedInlineLabel}</span>
        {switchBtn}
      </span>
    );
  }

  return (
    <div
      className={`bb-m3-switch-row ${disabled ? 'bb-m3-switch-row--disabled' : ''} ${className}`.trim()}
      onClick={handleToggle}
    >
      <div className="bb-m3-switch-copy">
        {label && <span className="bb-m3-switch-title">{label}</span>}
        {description && <span className="bb-m3-switch-desc">{description}</span>}
      </div>
      {switchBtn}
    </div>
  );
}

