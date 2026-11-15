import React from 'react';
import { Button } from '@ui/atoms/Button/Button.jsx';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import './Slider.css';

export function Slider({
  label,
  hint,
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  defaultValue,
  unit = '',
  variant = 'card', // 'card' | 'inline'
  icon,
  showValue = true,
  ariaLabel,
  title,
  onChange,
  disabled = false,
  className = '',
}) {
  const numVal = Number(value) || 0;
  const pct = Math.max(0, Math.min(100, ((numVal - min) / Math.max(max - min, 0.0001)) * 100));

  const clampAndEmit = (raw) => {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(min, Math.min(max, parsed));
    onChange?.(clamped);
  };

  if (variant === 'inline') {
    return (
      <div
        className={`bb-m3-slider bb-m3-slider--inline ${disabled ? 'is-disabled' : ''} ${className}`.trim()}
        title={title}
        onDoubleClick={
          !disabled && defaultValue !== undefined ? () => onChange?.(defaultValue) : undefined
        }
      >
        {icon && <Icon name={icon} size={13} className="bb-m3-slider__inline-icon" />}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={numVal}
          disabled={disabled}
          aria-label={ariaLabel || label || 'Slider value'}
          onChange={(e) => clampAndEmit(e.target.value)}
          className="bb-m3-slider__range"
          style={{ '--bb-slider-pct': `${pct}%` }}
        />
        {showValue && (
          <span className="bb-m3-slider__inline-readout">
            {numVal}
            {unit}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`bb-m3-slider ${className}`.trim()}>
      <div className="bb-m3-slider__head">
        <div className="bb-m3-slider__title-wrap">
          {label && <span className="bb-m3-slider__label">{label}</span>}
          {hint && <span className="bb-m3-slider__hint">{hint}</span>}
        </div>
        <div className="bb-m3-slider__controls">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            aria-label={label || 'Slider value'}
            onChange={(e) => clampAndEmit(e.target.value)}
            className="bb-m3-slider__num"
          />
          {unit && <span className="bb-m3-slider__hint">{unit}</span>}
          {defaultValue !== undefined && numVal !== defaultValue && (
            <Button
              variant="b2"
              size="sm"
              icon="refresh"
              title={`Reset to default (${defaultValue}${unit})`}
              onClick={() => onChange?.(defaultValue)}
            />
          )}
        </div>
      </div>

      <div className="bb-m3-slider__track-wrap">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={numVal}
          disabled={disabled}
          onChange={(e) => clampAndEmit(e.target.value)}
          className="bb-m3-slider__range"
          style={{ '--bb-slider-pct': `${pct}%` }}
        />
      </div>
    </div>
  );
}
