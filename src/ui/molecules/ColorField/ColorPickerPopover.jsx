import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { Button } from '@ui/atoms/Button/Button.jsx';
import {
  normalizeHex,
  isValidHexDraft,
  hexToRgb,
  rgbToHex,
  hsvToHex,
} from './colorMath.js';
import './ColorPickerPopover.css';

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function createPointerDragHandler(elementRef, disabled, onMoveFraction) {
  return (e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const el = elementRef.current;
    if (!el) return;
    const pointerId = e.pointerId;
    try {
      el.setPointerCapture(pointerId);
    } catch {
      // Ignore synthetic events
    }

    const applyAt = (clientX, clientY) => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const rx = clamp((clientX - rect.left) / rect.width, 0, 1);
      const ry = clamp((clientY - rect.top) / rect.height, 0, 1);
      onMoveFraction(rx, ry);
    };

    applyAt(e.clientX, e.clientY);

    const onMove = (moveEvt) => {
      if (moveEvt.pointerId !== pointerId) return;
      applyAt(moveEvt.clientX, moveEvt.clientY);
    };
    const onEnd = (endEvt) => {
      if (endEvt.pointerId !== pointerId) return;
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);
  };
}

export function ColorPickerPopover({
  sheetRef,
  coords,
  label,
  effectiveHex,
  swatchCssColor,
  initialHexOnOpen,
  hsv,
  hsvRef,
  hasAlpha,
  safeAlpha,
  swatches,
  isAuto,
  onToggleAuto,
  canResetDefault,
  normalizedDefault,
  disabled,
  onEmitColor,
  onEmitHsv,
  onAlphaChange,
  onClose,
}) {
  const [hexDraft, setHexDraft] = useState(effectiveHex);
  const [editingHex, setEditingHex] = useState(false);
  const [copied, setCopied] = useState(false);

  const svAreaRef = useRef(null);
  const hueTrackRef = useRef(null);
  const alphaTrackRef = useRef(null);

  const supportsEyeDropper =
    typeof window !== 'undefined' && typeof window.EyeDropper === 'function';

  const rgb = hexToRgb(effectiveHex);
  const pureHueHex = hsvToHex(hsv.h, 100, 100);

  const handleSvPointerDown = createPointerDragHandler(svAreaRef, disabled, (rx, ry) => {
    onEmitHsv({ h: hsvRef.current.h, s: rx * 100, v: (1 - ry) * 100 });
  });

  const handleHuePointerDown = createPointerDragHandler(hueTrackRef, disabled, (rx) => {
    onEmitHsv({ h: rx * 360, s: hsvRef.current.s, v: hsvRef.current.v });
  });

  const handleAlphaPointerDown = createPointerDragHandler(alphaTrackRef, disabled, (rx) => {
    onAlphaChange?.(Number(rx.toFixed(2)));
  });

  const handleEyeDropper = async () => {
    if (!supportsEyeDropper) return;
    try {
      const dropper = new window.EyeDropper();
      const res = await dropper.open();
      if (res?.sRGBHex) onEmitColor(res.sRGBHex);
    } catch {
      // Cancelled
    }
  };

  const handleCopyHex = async () => {
    try {
      await navigator.clipboard?.writeText(effectiveHex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard blocked
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="bb-color-picker__overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-label={label ? `${label} color picker` : 'Color picker'}
        className="bb-color-picker__sheet"
        style={
          coords.top || coords.left
            ? {
                '--bb-cp-top': `${coords.top}px`,
                '--bb-cp-left': `${coords.left}px`,
                visibility: coords.ready ? 'visible' : 'hidden',
              }
            : { visibility: coords.ready ? 'visible' : 'hidden' }
        }
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bb-color-picker__grabber" aria-hidden="true" />

        <header className="bb-color-picker__header">
          <div className="bb-color-picker__header-title">
            <span className="bb-color-picker__compare" aria-hidden="true">
              <span
                className="bb-color-picker__compare-half"
                style={{ backgroundColor: initialHexOnOpen }}
                title={`Previous: ${initialHexOnOpen}`}
              />
              <span
                className="bb-color-picker__compare-half"
                style={{ backgroundColor: swatchCssColor }}
                title={`Current: ${effectiveHex}`}
              />
            </span>
            <span className="bb-color-picker__title-text">{label || 'Select Color'}</span>
          </div>

          <div className="bb-color-picker__header-actions">
            {supportsEyeDropper && (
              <button
                type="button"
                className="bb-color-picker__icon-btn"
                title="Sample color from screen"
                aria-label="Sample color from screen"
                onClick={handleEyeDropper}
              >
                <Icon name="eyedropper" size={16} />
              </button>
            )}
            <button
              type="button"
              className="bb-color-picker__icon-btn"
              title={copied ? 'Copied!' : 'Copy HEX'}
              aria-label="Copy HEX code"
              onClick={handleCopyHex}
            >
              <Icon name={copied ? 'check' : 'copy'} size={15} />
            </button>
            <button
              type="button"
              className="bb-color-picker__icon-btn"
              title="Close color picker"
              aria-label="Close color picker"
              onClick={onClose}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </header>

        <div className="bb-color-picker__body">
          <div
            ref={svAreaRef}
            className="bb-color-picker__sv"
            style={{ backgroundColor: pureHueHex }}
            onPointerDown={handleSvPointerDown}
          >
            <div className="bb-color-picker__sv-white" />
            <div className="bb-color-picker__sv-black" />
            <span
              className="bb-color-picker__sv-thumb"
              style={{
                left: `${hsv.s}%`,
                top: `${100 - hsv.v}%`,
                backgroundColor: effectiveHex,
              }}
            />
          </div>

          <div className="bb-color-picker__sliders">
            <div
              ref={hueTrackRef}
              className="bb-color-picker__track bb-color-picker__track--hue"
              onPointerDown={handleHuePointerDown}
            >
              <span
                className="bb-color-picker__track-thumb"
                style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: pureHueHex }}
              />
            </div>

            {hasAlpha && (
              <div
                ref={alphaTrackRef}
                className="bb-color-picker__track bb-color-picker__track--alpha"
                onPointerDown={handleAlphaPointerDown}
              >
                <span
                  className="bb-color-picker__alpha-gradient"
                  style={{
                    background: `linear-gradient(90deg, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0) 0%, ${effectiveHex} 100%)`,
                  }}
                />
                <span
                  className="bb-color-picker__track-thumb"
                  style={{ left: `${safeAlpha * 100}%`, backgroundColor: swatchCssColor }}
                />
              </div>
            )}
          </div>
          <div className="bb-color-picker__inputs">
            <label className="bb-color-picker__channel bb-color-picker__channel--hex">
              <span className="bb-color-picker__channel-lbl">HEX</span>
              <input
                type="text"
                maxLength={7}
                spellCheck={false}
                value={editingHex ? hexDraft : effectiveHex}
                onFocus={(e) => {
                  setEditingHex(true);
                  setHexDraft(effectiveHex);
                  e.target.select();
                }}
                onBlur={() => {
                  setEditingHex(false);
                  if (isValidHexDraft(hexDraft)) {
                    onEmitColor(normalizeHex(hexDraft, effectiveHex));
                  } else {
                    setHexDraft(effectiveHex);
                  }
                }}
                onChange={(e) => {
                  const raw = e.target.value;
                  setHexDraft(raw);
                  if (/^#?[0-9a-fA-F]{6}$/.test(raw.trim())) onEmitColor(raw);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                className="bb-color-picker__channel-input"
              />
            </label>

            {(['r', 'g', 'b']).map((ch) => (
              <label key={ch} className="bb-color-picker__channel">
                <span className="bb-color-picker__channel-lbl">{ch.toUpperCase()}</span>
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={rgb[ch]}
                  onChange={(e) => {
                    const num = clamp(Math.round(Number(e.target.value) || 0), 0, 255);
                    const next = { ...rgb, [ch]: num };
                    onEmitColor(rgbToHex(next.r, next.g, next.b));
                  }}
                  className="bb-color-picker__channel-input"
                />
              </label>
            ))}

            {hasAlpha && (
              <label className="bb-color-picker__channel">
                <span className="bb-color-picker__channel-lbl">A%</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(safeAlpha * 100)}
                  onChange={(e) => {
                    const pct = clamp(Math.round(Number(e.target.value) || 0), 0, 100);
                    onAlphaChange?.(Number((pct / 100).toFixed(2)));
                  }}
                  className="bb-color-picker__channel-input"
                />
              </label>
            )}
          </div>

          {Array.isArray(swatches) && swatches.length > 0 && (
            <div className="bb-color-picker__swatches">
              {swatches.map((sw) => {
                const norm = normalizeHex(sw);
                const isSelected = norm === effectiveHex;
                return (
                  <button
                    key={norm}
                    type="button"
                    title={norm}
                    aria-label={`Select swatch ${norm}`}
                    className={`bb-color-picker__swatch-dot ${isSelected ? 'is-selected' : ''}`}
                    style={{ backgroundColor: norm }}
                    onClick={() => onEmitColor(norm)}
                  />
                );
              })}
            </div>
          )}

          {(typeof onToggleAuto === 'function' || canResetDefault) && (
            <div className="bb-color-picker__footer">
              {typeof onToggleAuto === 'function' && (
                <Button
                  variant="b2"
                  size="sm"
                  icon="sparkles"
                  active={isAuto}
                  onClick={() => {
                    onToggleAuto(!isAuto);
                    if (!isAuto) onClose();
                  }}
                >
                  {isAuto ? 'Auto Theme Color Active' : 'Reset to Auto Theme Color'}
                </Button>
              )}
              {canResetDefault && (
                <Button
                  variant="b2"
                  size="sm"
                  icon="refresh"
                  onClick={() => onEmitColor(normalizedDefault)}
                >
                  Default ({normalizedDefault})
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}


