import React from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { KebabMenu } from '@ui/molecules/KebabMenu/KebabMenu.jsx';
import './ThemePresetCard.css';

/**
 * M3 Tonal Theme Preset Card Molecule.
 * Displays a 4-dot tonal preview fan (Surface, Card, Primary, Accent), preset name,
 * mode/scheme metadata subtitle, active selection badge, and optional KebabMenu actions.
 */
export function ThemePresetCard({
  name,
  subtitle,
  themeMode = 'dark', // 'dark' | 'light'
  previewColors = [], // [surfaceHex, cardHex, primaryHex, accentHex]
  active = false,
  isDefault = false,
  menuItems = [],
  disabled = false,
  onSelect,
  className = '',
}) {
  const dots = previewColors.slice(0, 4);
  const hasMenu = Array.isArray(menuItems) && menuItems.length > 0;

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={active}
      aria-disabled={disabled || undefined}
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
        'bb-theme-preset-card',
        active ? 'is-active' : '',
        disabled ? 'is-disabled' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="bb-theme-preset-card__swatches" aria-hidden="true">
        {dots.map((hex, idx) => (
          <span
            key={`${hex}-${idx}`}
            className="bb-theme-preset-card__dot"
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>

      <div className="bb-theme-preset-card__meta">
        <div className="bb-theme-preset-card__title-row">
          <span className="bb-theme-preset-card__name">{name}</span>
          {isDefault && <span className="bb-theme-preset-card__tag">Default</span>}
        </div>
        <div className="bb-theme-preset-card__sub-row">
          <Icon
            name={themeMode === 'light' ? 'sun' : 'moon'}
            size={12}
            className="bb-theme-preset-card__mode-icon"
          />
          <span className="bb-theme-preset-card__sub">
            {subtitle || (themeMode === 'light' ? 'Light Theme' : 'Dark Theme')}
          </span>
        </div>
      </div>

      <div className="bb-theme-preset-card__trailing">
        {active && (
          <span className="bb-theme-preset-card__check" title="Active theme" aria-hidden="true">
            <Icon name="check" size={14} />
          </span>
        )}
        {hasMenu && (
          <KebabMenu
            size="sm"
            title={`Actions for ${name}`}
            items={menuItems}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
