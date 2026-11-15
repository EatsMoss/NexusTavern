import React from 'react';
import './ProgressIndicator.css';

const CIRCULAR_SIZES = {
  xs: { px: 14, stroke: 3.4 },
  sm: { px: 18, stroke: 3.2 },
  md: { px: 24, stroke: 3.4 },
  lg: { px: 36, stroke: 3.6 },
  xl: { px: 48, stroke: 3.8 },
};

/**
 * Pure M3 Progress Indicator (`circular` | `linear`).
 * Supports both indeterminate (`value == null`) and determinate (`0..100`) states.
 */
export function ProgressIndicator({
  variant = 'circular', // 'circular' | 'linear'
  size = 'md', // 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  value = null, // number (0..100) for determinate, null/undefined for indeterminate
  tone = 'primary', // 'primary' | 'muted' | 'on-surface'
  overlay = false, // false | true | 'top' | 'bottom' (zero-layout-shift absolute bar)
  showTrack = true,
  label = '',
  showValue = false,
  className = '',
  style,
  ariaLabel = 'Loading',
}) {
  const isDeterminate = typeof value === 'number' && Number.isFinite(value);
  const clamped = isDeterminate ? Math.max(0, Math.min(100, value)) : null;

  if (variant === 'linear') {
    const overlayPos = overlay ? (overlay === 'bottom' ? 'bottom' : 'top') : null;
    return (
      <div
        className={[
          'bb-progress',
          'bb-progress--linear-wrap',
          `bb-progress--size-${size}`,
          `bb-progress--tone-${tone}`,
          overlayPos ? 'bb-progress--overlay' : '',
          overlayPos ? `bb-progress--overlay-${overlayPos}` : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={style}
        role="progressbar"
        aria-label={label || ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isDeterminate ? Math.round(clamped) : undefined}
      >
        {(label || (showValue && isDeterminate)) && (
          <div className="bb-progress__label-row">
            {label && <span>{label}</span>}
            {showValue && isDeterminate && (
              <span className="bb-progress__value">{Math.round(clamped)}%</span>
            )}
          </div>
        )}
        <div
          className={[
            'bb-progress__linear-track',
            !isDeterminate ? 'bb-progress__linear-track--indeterminate' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {isDeterminate ? (
            <div className="bb-progress__linear-bar" style={{ width: `${clamped}%` }} />
          ) : (
            <>
              <div className="bb-progress__linear-bar bb-progress__linear-bar--primary" />
              <div className="bb-progress__linear-bar bb-progress__linear-bar--secondary" />
            </>
          )}
        </div>
      </div>
    );
  }

  const spec =
    typeof size === 'number'
      ? { px: size, stroke: 3.4 }
      : CIRCULAR_SIZES[size] || CIRCULAR_SIZES.md;
  const radius = 20;
  const circumference = 2 * Math.PI * radius; // ~125.66
  const dashOffset = isDeterminate
    ? circumference - (clamped / 100) * circumference
    : undefined;

  return (
    <span
      className={[
        'bb-progress',
        `bb-progress--size-${typeof size === 'string' ? size : 'md'}`,
        `bb-progress--tone-${tone}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      role="progressbar"
      aria-label={label || ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isDeterminate ? Math.round(clamped) : undefined}
    >
      <svg
        width={spec.px}
        height={spec.px}
        viewBox="0 0 48 48"
        className={[
          'bb-progress__circular',
          !isDeterminate ? 'bb-progress__circular--indeterminate' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden="true"
      >
        {showTrack && (
          <circle
            cx="24"
            cy="24"
            r={radius}
            strokeWidth={spec.stroke}
            className="bb-progress__circular-track"
          />
        )}
        <circle
          cx="24"
          cy="24"
          r={radius}
          strokeWidth={spec.stroke}
          strokeDasharray={isDeterminate ? `${circumference} ${circumference}` : undefined}
          strokeDashoffset={dashOffset}
          transform={isDeterminate ? 'rotate(-90 24 24)' : undefined}
          className="bb-progress__circular-active"
        />
      </svg>
      {label && <span className="bb-progress__label-row">{label}</span>}
    </span>
  );
}
