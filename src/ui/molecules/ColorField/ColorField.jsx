import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from 'react';
import { Button } from '@ui/atoms/Button/Button.jsx';
import { Switch } from '@ui/atoms/Switch/Switch.jsx';
import {
  DEFAULT_M3_SWATCHES,
  normalizeHex,
  isValidHexDraft,
  hexToHsv,
  hsvToHex,
  hexWithAlphaCss,
} from './colorMath.js';
import { ColorPickerPopover } from './ColorPickerPopover.jsx';
import './ColorField.css';

const POPOVER_WIDTH = 316;
const VIEWPORT_MARGIN = 10;

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

export function ColorField({
  label,
  description,
  value = '#6575B3',
  autoValue,
  isAuto = false,
  onToggleAuto,
  autoLabel = 'Auto',
  defaultValue,
  alpha,
  onAlphaChange,
  swatches = DEFAULT_M3_SWATCHES,
  variant = 'row', // 'row' | 'compact'
  disabled = false,
  onChange,
  className = '',
}) {
  const effectiveHex = normalizeHex(isAuto && autoValue ? autoValue : value, '#6575B3');
  const hasAlpha = alpha !== undefined && typeof onAlphaChange === 'function';
  const safeAlpha = hasAlpha ? clamp(Number(alpha), 0, 1) : 1;

  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(effectiveHex);
  const [isEditingHex, setIsEditingHex] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, ready: false });
  const [hsv, setHsv] = useState(() => hexToHsv(effectiveHex));
  const [initialHexOnOpen, setInitialHexOnOpen] = useState(effectiveHex);

  const triggerRef = useRef(null);
  const sheetRef = useRef(null);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  useEffect(() => {
    const incoming = hexToHsv(effectiveHex);
    setHsv((prev) => {
      if (hsvToHex(prev.h, prev.s, prev.v) === effectiveHex) return prev;
      return {
        h: incoming.s === 0 ? prev.h : incoming.h,
        s: incoming.s,
        v: incoming.v,
      };
    });
    if (!isEditingHex) setHexDraft(effectiveHex);
  }, [effectiveHex, isEditingHex]);

  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  const emitColor = useCallback(
    (nextHex) => {
      const normalized = normalizeHex(nextHex, effectiveHex);
      if (isAuto && typeof onToggleAuto === 'function') onToggleAuto(false);
      onChange?.(normalized);
    },
    [effectiveHex, isAuto, onChange, onToggleAuto],
  );

  const emitHsv = useCallback(
    (nextHsv) => {
      const clamped = {
        h: clamp(nextHsv.h, 0, 360),
        s: clamp(nextHsv.s, 0, 100),
        v: clamp(nextHsv.v, 0, 100),
      };
      hsvRef.current = clamped;
      setHsv(clamped);
      const nextHex = hsvToHex(clamped.h, clamped.s, clamped.v);
      setHexDraft(nextHex);
      emitColor(nextHex);
    },
    [emitColor],
  );

  const updatePosition = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth <= 640) {
      setCoords({ top: 0, left: 0, ready: true });
      return;
    }
    const anchor = triggerRef.current;
    const sheet = sheetRef.current;
    if (!anchor || !sheet) return;

    const aRect = anchor.getBoundingClientRect();
    const sRect = sheet.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = sRect.width || POPOVER_WIDTH;
    const height = sRect.height || 370;

    let left = aRect.right - width;
    if (left < VIEWPORT_MARGIN) left = aRect.left;
    if (left + width > vw - VIEWPORT_MARGIN) {
      left = Math.max(VIEWPORT_MARGIN, vw - width - VIEWPORT_MARGIN);
    }

    let top = aRect.bottom + 8;
    if (top + height > vh - VIEWPORT_MARGIN) {
      const above = aRect.top - height - 8;
      top = above >= VIEWPORT_MARGIN ? above : Math.max(VIEWPORT_MARGIN, vh - height - VIEWPORT_MARGIN);
    }

    setCoords({ top: Math.round(top), left: Math.round(left), ready: true });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords((prev) => (prev.ready ? { top: 0, left: 0, ready: false } : prev));
      return;
    }
    updatePosition();
  }, [open, hasAlpha, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (e) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target) &&
        (!sheetRef.current || !sheetRef.current.contains(e.target))
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  const swatchCssColor = hexWithAlphaCss(effectiveHex, safeAlpha);
  const normalizedDefault = defaultValue ? normalizeHex(defaultValue, '') : '';
  const canResetDefault =
    Boolean(normalizedDefault) && !isAuto && effectiveHex !== normalizedDefault;
  const controlsCluster = (
    <div className="bb-color-field__controls">
      {typeof onToggleAuto === 'function' && (
        <Switch
          size="sm"
          bare
          inlineLabel={autoLabel}
          checked={isAuto}
          disabled={disabled}
          onChange={onToggleAuto}
          title={isAuto ? 'Using automatic theme color' : 'Switch back to automatic theme color'}
        />
      )}

      <div
        ref={triggerRef}
        className={[
          'bb-color-field__pill',
          open ? 'is-open' : '',
          isAuto ? 'is-auto' : '',
          disabled ? 'is-disabled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setOpen((prev) => {
              const next = !prev;
              if (next) setInitialHexOnOpen(effectiveHex);
              return next;
            });
          }}
          aria-label={`Pick color for ${label || 'field'} (${effectiveHex})`}
          aria-expanded={open}
          title={isAuto ? `${effectiveHex} (Auto — click to customize)` : `Pick color (${effectiveHex})`}
          className="bb-color-field__swatch-btn"
        >
          <span className="bb-color-field__swatch-checker" aria-hidden="true" />
          <span
            className="bb-color-field__swatch-fill"
            style={{ backgroundColor: swatchCssColor }}
          />
        </button>

        <input
          type="text"
          value={isEditingHex ? hexDraft : effectiveHex}
          disabled={disabled}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          aria-label={`${label || 'Color'} HEX value`}
          className="bb-color-field__hex-input"
          onFocus={(e) => {
            setIsEditingHex(true);
            setHexDraft(effectiveHex);
            e.target.select();
          }}
          onBlur={() => {
            setIsEditingHex(false);
            if (isValidHexDraft(hexDraft)) {
              const norm = normalizeHex(hexDraft, effectiveHex);
              setHexDraft(norm);
              emitColor(norm);
            } else {
              setHexDraft(effectiveHex);
            }
          }}
          onChange={(e) => {
            const raw = e.target.value;
            setHexDraft(raw);
            if (/^#?[0-9a-fA-F]{6}$/.test(raw.trim())) emitColor(raw);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            else if (e.key === 'Escape') {
              setHexDraft(effectiveHex);
              setIsEditingHex(false);
              e.currentTarget.blur();
            }
          }}
        />
      </div>

      {canResetDefault && (
        <Button
          variant="b2"
          size="sm"
          icon="refresh"
          disabled={disabled}
          title={`Reset to default (${normalizedDefault})`}
          onClick={() => emitColor(normalizedDefault)}
        />
      )}
    </div>
  );

  const popoverNode = open ? (
    <ColorPickerPopover
      sheetRef={sheetRef}
      coords={coords}
      label={label}
      effectiveHex={effectiveHex}
      swatchCssColor={swatchCssColor}
      initialHexOnOpen={initialHexOnOpen}
      hsv={hsv}
      hsvRef={hsvRef}
      hasAlpha={hasAlpha}
      safeAlpha={safeAlpha}
      swatches={swatches}
      isAuto={isAuto}
      onToggleAuto={onToggleAuto}
      canResetDefault={canResetDefault}
      normalizedDefault={normalizedDefault}
      disabled={disabled}
      onEmitColor={emitColor}
      onEmitHsv={emitHsv}
      onAlphaChange={onAlphaChange}
      onClose={() => setOpen(false)}
    />
  ) : null;

  if (variant === 'compact') {
    return (
      <div className={`bb-color-field bb-color-field--compact ${className}`.trim()}>
        {label && <span className="bb-color-field__compact-label">{label}</span>}
        {controlsCluster}
        {popoverNode}
      </div>
    );
  }

  return (
    <div className={`bb-color-field bb-color-field--row ${className}`.trim()}>
      <div className="bb-color-field__copy">
        {label && <span className="bb-color-field__label">{label}</span>}
        {description && <span className="bb-color-field__desc">{description}</span>}
      </div>
      {controlsCluster}
      {popoverNode}
    </div>
  );
}


