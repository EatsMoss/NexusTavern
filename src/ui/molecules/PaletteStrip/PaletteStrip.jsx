import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { Button } from '@ui/atoms/Button/Button.jsx';
import {
  DEFAULT_M3_SWATCHES,
  normalizeHex,
  hexToHsv,
  hsvToHex,
} from '@ui/molecules/ColorField/colorMath.js';
import { ColorPickerPopover } from '@ui/molecules/ColorField/ColorPickerPopover.jsx';
import './PaletteStrip.css';

const POPOVER_WIDTH = 316;
const VIEWPORT_MARGIN = 10;
const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

export function PaletteStrip({
  label = 'Derived Palette',
  hint = 'Click any swatch to customize',
  slots = [],
  swatches = DEFAULT_M3_SWATCHES,
  disabled = false,
  onSlotChange,
  onSlotReset,
  onResetAll,
  className = '',
}) {
  const [openKey, setOpenKey] = useState(null);
  const [hoveredKey, setHoveredKey] = useState(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, ready: false });
  const [hsv, setHsv] = useState({ h: 230, s: 40, v: 70 });
  const [initialHexOnOpen, setInitialHexOnOpen] = useState('#6575B3');

  const segmentRefs = useRef(new Map());
  const sheetRef = useRef(null);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  const activeSlot = slots.find((s) => s.key === openKey) || null;
  const inspectedSlot = activeSlot || slots.find((s) => s.key === hoveredKey) || null;
  const overrideCount = slots.filter((s) => Boolean(s.isOverridden)).length;
  const hasAnyOverride = overrideCount > 0;

  const resolveSlotHex = (slot) =>
    normalizeHex(
      slot.isOverridden ? slot.value : slot.autoValue || slot.value,
      '#6575B3',
    );

  const activeEffectiveHex = activeSlot ? resolveSlotHex(activeSlot) : '#6575B3';

  useEffect(() => {
    if (!activeSlot) return;
    const incoming = hexToHsv(activeEffectiveHex);
    setHsv((prev) => {
      if (hsvToHex(prev.h, prev.s, prev.v) === activeEffectiveHex) return prev;
      return {
        h: incoming.s === 0 ? prev.h : incoming.h,
        s: incoming.s,
        v: incoming.v,
      };
    });
  }, [activeSlot, activeEffectiveHex]);

  useEffect(() => {
    if (disabled && openKey) setOpenKey(null);
  }, [disabled, openKey]);

  const updatePosition = useCallback(() => {
    if (typeof window === 'undefined' || !openKey) return;
    if (window.innerWidth <= 640) {
      setCoords({ top: 0, left: 0, ready: true });
      return;
    }
    const anchor = segmentRefs.current.get(openKey);
    const sheet = sheetRef.current;
    if (!anchor || !sheet) return;

    const aRect = anchor.getBoundingClientRect();
    const sRect = sheet.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = sRect.width || POPOVER_WIDTH;
    const height = sRect.height || 340;

    let left = aRect.left + aRect.width / 2 - width / 2;
    if (left + width > vw - VIEWPORT_MARGIN) left = vw - width - VIEWPORT_MARGIN;
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

    let top = aRect.bottom + 8;
    if (top + height > vh - VIEWPORT_MARGIN && aRect.top - height - 8 >= VIEWPORT_MARGIN) {
      top = aRect.top - height - 8;
    } else if (top + height > vh - VIEWPORT_MARGIN) {
      top = Math.max(VIEWPORT_MARGIN, vh - height - VIEWPORT_MARGIN);
    }

    setCoords({ top, left, ready: true });
  }, [openKey]);

  useLayoutEffect(() => {
    if (openKey) updatePosition();
  }, [openKey, updatePosition]);

  useEffect(() => {
    if (!openKey) return undefined;
    const onPointerDown = (e) => {
      const anchor = segmentRefs.current.get(openKey);
      if (anchor?.contains(e.target)) return;
      if (sheetRef.current?.contains(e.target)) return;
      setOpenKey(null);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpenKey(null);
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [openKey, updatePosition]);

  const handleOpenSlot = (slot) => {
    if (disabled) return;
    if (openKey === slot.key) {
      setOpenKey(null);
      return;
    }
    const hex = resolveSlotHex(slot);
    const nextHsv = hexToHsv(hex);
    hsvRef.current = nextHsv;
    setHsv(nextHsv);
    setInitialHexOnOpen(hex);
    setCoords((c) => ({ ...c, ready: false }));
    setOpenKey(slot.key);
  };

  const emitSlotColor = useCallback(
    (nextHex) => {
      if (!activeSlot) return;
      onSlotChange?.(activeSlot.key, normalizeHex(nextHex, activeEffectiveHex));
    },
    [activeSlot, activeEffectiveHex, onSlotChange],
  );

  const emitSlotHsv = useCallback(
    (nextHsv) => {
      if (!activeSlot) return;
      const clamped = {
        h: clamp(nextHsv.h, 0, 360),
        s: clamp(nextHsv.s, 0, 100),
        v: clamp(nextHsv.v, 0, 100),
      };
      hsvRef.current = clamped;
      setHsv(clamped);
      emitSlotColor(hsvToHex(clamped.h, clamped.s, clamped.v));
    },
    [activeSlot, emitSlotColor],
  );

  const inspectedHex = inspectedSlot ? resolveSlotHex(inspectedSlot) : '';
  return (
    <div className={['bb-palette-strip', disabled ? 'is-disabled' : '', className].filter(Boolean).join(' ')}>
      <div className="bb-palette-strip__header">
        <div className="bb-palette-strip__heading">
          {label && <span className="bb-palette-strip__label">{label}</span>}
          {hint && <span className="bb-palette-strip__hint">{hint}</span>}
        </div>
        {hasAnyOverride && typeof onResetAll === 'function' && (
          <Button
            variant="b2"
            size="sm"
            icon="refresh"
            disabled={disabled}
            title="Reset all palette slots back to automatic derivation"
            onClick={() => {
              setOpenKey(null);
              onResetAll();
            }}
          >
            Reset All
          </Button>
        )}
      </div>

      <div className="bb-palette-strip__bar" role="group" aria-label={label || 'Theme palette strip'}>
        {slots.map((slot) => {
          const hex = resolveSlotHex(slot);
          const isOpen = openKey === slot.key;
          const isCustom = Boolean(slot.isOverridden);

          return (
            <div
              key={slot.key}
              ref={(node) => {
                if (node) segmentRefs.current.set(slot.key, node);
                else segmentRefs.current.delete(slot.key);
              }}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label={`${slot.label || slot.shortLabel}: ${hex}${isCustom ? ' (Custom override)' : ' (Auto)'}`}
              aria-expanded={isOpen}
              title={`${slot.label || slot.shortLabel} (${hex}) — ${isCustom ? 'Custom · Click to edit or right-click to reset' : 'Auto · Click to override'}`}
              style={{ backgroundColor: hex }}
              className={['bb-palette-strip__swatch', isOpen ? 'is-open' : '', isCustom ? 'is-custom' : ''].filter(Boolean).join(' ')}
              onMouseEnter={() => setHoveredKey(slot.key)}
              onMouseLeave={() => setHoveredKey((prev) => (prev === slot.key ? null : prev))}
              onClick={() => handleOpenSlot(slot)}
              onContextMenu={(e) => {
                if (!isCustom || typeof onSlotReset !== 'function') return;
                e.preventDefault();
                if (openKey === slot.key) setOpenKey(null);
                onSlotReset(slot.key);
              }}
              onKeyDown={(e) => {
                if (disabled) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOpenSlot(slot);
                } else if ((e.key === 'Backspace' || e.key === 'Delete') && isCustom) {
                  e.preventDefault();
                  onSlotReset?.(slot.key);
                }
              }}
            >
              {isCustom && <span className="bb-palette-strip__dot" aria-hidden="true" />}
              {isCustom && typeof onSlotReset === 'function' && (
                <button
                  type="button"
                  className="bb-palette-strip__reset"
                  title={`Reset ${slot.label || slot.shortLabel} to automatic`}
                  aria-label={`Reset ${slot.label || slot.shortLabel} to automatic`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (openKey === slot.key) setOpenKey(null);
                    onSlotReset(slot.key);
                  }}
                >
                  <Icon name="close" size={11} />
                </button>
              )}
              <span className="bb-palette-strip__swatch-name">{slot.shortLabel || slot.label}</span>
            </div>
          );
        })}
      </div>
      <div className="bb-palette-strip__readout">
        {inspectedSlot ? (
          <>
            <span className="bb-palette-strip__readout-title">
              <strong>{inspectedSlot.label || inspectedSlot.shortLabel}</strong>
              {inspectedSlot.hint ? ` — ${inspectedSlot.hint}` : ''}
            </span>
            <span className="bb-palette-strip__readout-meta">
              <span>{inspectedHex}</span>
              <span className={`bb-palette-strip__state-pill ${inspectedSlot.isOverridden ? 'is-custom' : ''}`}>
                {inspectedSlot.isOverridden ? 'Custom' : 'Auto'}
              </span>
            </span>
          </>
        ) : (
          <>
            <span className="bb-palette-strip__readout-title">
              {hasAnyOverride
                ? `${overrideCount} of ${slots.length} surface slots customized`
                : `All ${slots.length} surface slots synced to seed colors`}
            </span>
            <span className="bb-palette-strip__readout-meta">
              <span className={`bb-palette-strip__state-pill ${hasAnyOverride ? 'is-custom' : ''}`}>
                {hasAnyOverride ? 'Custom' : 'All Auto'}
              </span>
            </span>
          </>
        )}
      </div>

      {activeSlot && (
        <ColorPickerPopover
          sheetRef={sheetRef}
          coords={coords}
          label={`${activeSlot.shortLabel} · ${activeSlot.label}`}
          effectiveHex={activeEffectiveHex}
          swatchCssColor={activeEffectiveHex}
          initialHexOnOpen={initialHexOnOpen}
          hsv={hsv}
          hsvRef={hsvRef}
          hasAlpha={false}
          safeAlpha={1}
          swatches={swatches}
          isAuto={!activeSlot.isOverridden}
          onToggleAuto={
            typeof onSlotReset === 'function'
              ? (nextAuto) => {
                  if (nextAuto) onSlotReset(activeSlot.key);
                  else onSlotChange?.(activeSlot.key, normalizeHex(activeSlot.autoValue || activeSlot.value, '#6575B3'));
                }
              : undefined
          }
          canResetDefault={false}
          normalizedDefault={activeSlot.autoValue || '#6575B3'}
          disabled={disabled}
          onEmitColor={emitSlotColor}
          onEmitHsv={emitSlotHsv}
          onClose={() => setOpenKey(null)}
        />
      )}
    </div>
  );
}
