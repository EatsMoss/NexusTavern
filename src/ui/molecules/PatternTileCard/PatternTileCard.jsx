import React from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import './PatternTileCard.css';

/**
 * M3 Geometric Pattern Tile Card Molecule.
 * Displays a live-tinted seamless SVG pattern thumbnail alongside its title,
 * 2-line grimoire subtitle, and M3 active checkmark indicator.
 */
export function PatternTileCard({
  name,
  subtitle,
  patternDataUri,
  patternSize = '30px 30px',
  surfaceBg,
  active = false,
  disabled = false,
  onSelect,
  className = '',
}) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={active}
      aria-disabled={disabled || undefined}
      title={subtitle ? `${name} — ${subtitle}` : name}
      onClick={() => {
        if (!disabled) onSelect?.();
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.();
        }
      }}
      className={[
        'bb-pattern-tile-card',
        active ? 'is-active' : '',
        disabled ? 'is-disabled' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className="bb-pattern-tile-card__swatch"
        aria-hidden="true"
        style={{
          backgroundColor: surfaceBg || undefined,
          backgroundImage: patternDataUri || 'none',
          backgroundSize: patternSize,
        }}
      />

      <div className="bb-pattern-tile-card__meta">
        <span className="bb-pattern-tile-card__name">{name}</span>
        {subtitle && <span className="bb-pattern-tile-card__sub">{subtitle}</span>}
      </div>

      {active && (
        <span className="bb-pattern-tile-card__check" title="Selected pattern" aria-hidden="true">
          <Icon name="check" size={12} />
        </span>
      )}
    </div>
  );
}
