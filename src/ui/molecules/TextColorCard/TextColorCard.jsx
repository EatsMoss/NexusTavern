import React from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { Slider } from '@ui/molecules/Slider/Slider.jsx';
import { ColorField } from '@ui/molecules/ColorField/ColorField.jsx';
import { DEFAULT_M3_SWATCHES } from '@ui/molecules/ColorField/colorMath.js';
import './TextColorCard.css';

/**
 * M3 Prose Text Color Card Molecule.
 * Ported cleanly from BookboundUI's RP typography card design onto pure M3 surfaces.
 * Supports single-color prose slots ('text') and paired text + background + opacity
 * slots ('pair' — inline code, code blocks, collapsible details).
 */
export function TextColorCard({
  title,
  subtitle,
  hint,
  type = 'text', // 'text' | 'pair'
  fullSpan = false,
  isAuto = true,
  onToggleAuto,
  value = '#DCE2FF',
  autoValue = '#DCE2FF',
  bgValue = '#222228',
  autoBgValue = '#222228',
  bgOpacity = 100, // 0..100
  swatches = DEFAULT_M3_SWATCHES,
  disabled = false,
  onChange,
  onBgChange,
  onBgOpacityChange,
  children,
  className = '',
}) {
  const isPair = type === 'pair';
  const clampedOpacity = Math.min(100, Math.max(0, Math.round(Number(bgOpacity) || 0)));

  return (
    <div
      className={[
        'bb-text-color-card',
        isAuto ? 'is-auto' : 'is-custom',
        isPair || fullSpan ? 'is-full-span' : '',
        disabled ? 'is-disabled' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="bb-text-color-card__head" title={hint || subtitle || undefined}>
        <div className="bb-text-color-card__meta">
          <span className="bb-text-color-card__title">{title}</span>
          {subtitle && <span className="bb-text-color-card__subtitle">{subtitle}</span>}
        </div>

        {typeof onToggleAuto === 'function' && (
          <button
            type="button"
            disabled={disabled}
            aria-pressed={isAuto}
            title={
              isAuto
                ? 'Synced to active color scheme (click to customize manually)'
                : 'Custom color active (click to re-link to automatic theme palette)'
            }
            className={`bb-text-color-card__auto-btn ${isAuto ? 'is-auto' : ''}`}
            onClick={() => onToggleAuto(!isAuto)}
          >
            <Icon name={isAuto ? 'link' : 'unlink'} size={13} />
            <span>{isAuto ? 'Auto' : 'Custom'}</span>
          </button>
        )}
      </div>

      <div className="bb-text-color-card__sample">{children}</div>

      <div className="bb-text-color-card__controls">
        {!isPair ? (
          <ColorField
            variant="compact"
            size="sm"
            fullWidth
            showAutoSwitch={false}
            value={value}
            autoValue={autoValue}
            isAuto={isAuto}
            onToggleAuto={onToggleAuto}
            swatches={swatches}
            disabled={disabled}
            onChange={onChange}
          />
        ) : (
          <div className="bb-text-color-card__pair-grid">
            <ColorField
              variant="compact"
              size="sm"
              fullWidth
              showAutoSwitch={false}
              label="Text"
              value={value}
              autoValue={autoValue}
              isAuto={isAuto}
              onToggleAuto={onToggleAuto}
              swatches={swatches}
              disabled={disabled}
              onChange={onChange}
            />
            <ColorField
              variant="compact"
              size="sm"
              fullWidth
              showAutoSwitch={false}
              label="Background"
              value={bgValue}
              autoValue={autoBgValue}
              isAuto={isAuto}
              onToggleAuto={onToggleAuto}
              swatches={swatches}
              disabled={disabled}
              onChange={onBgChange}
            />
            <div className="bb-text-color-card__opacity-col">
              <div className="bb-text-color-card__opacity-head">
                <span>Opacity</span>
                <span className="bb-text-color-card__opacity-val">{clampedOpacity}%</span>
              </div>
              <Slider
                variant="inline"
                showValue={false}
                min={0}
                max={100}
                value={clampedOpacity}
                disabled={disabled}
                title={`${title} background opacity (${clampedOpacity}%)`}
                ariaLabel={`${title} background opacity`}
                className="bb-text-color-card__opacity-slider"
                onChange={(pct) => {
                  if (isAuto && typeof onToggleAuto === 'function') onToggleAuto(false);
                  onBgOpacityChange?.(pct);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
