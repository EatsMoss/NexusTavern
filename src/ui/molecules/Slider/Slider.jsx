import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { Button } from '@ui/atoms/Button/Button.jsx';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import './Slider.css';

function getStepPrecision(step) {
  const str = String(step ?? 1);
  const dot = str.indexOf('.');
  return dot === -1 ? 0 : str.length - dot - 1;
}

function roundToPrecision(num, precision) {
  if (!Number.isFinite(num)) return 0;
  if (precision <= 0) return Math.round(num);
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
}

function addThousandsCommas(intDigits) {
  return String(intDigits || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatSliderNumber(value, precision = null) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  const normalized =
    typeof precision === 'number' ? roundToPrecision(num, precision) : num;
  const sign = normalized < 0 ? '-' : '';
  const absStr = String(Math.abs(normalized));
  const [intPart, decPart] = absStr.split('.');
  const groupedInt = addThousandsCommas(intPart);
  return decPart !== undefined ? `${sign}${groupedInt}.${decPart}` : `${sign}${groupedInt}`;
}

function sanitizeAndFormatDraft(rawText, { allowDecimals, allowNegative }) {
  const src = String(rawText ?? '');
  let sign = '';
  let digitsAndDot = '';
  let hasDot = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '-' && allowNegative && !sign && digitsAndDot.length === 0) {
      sign = '-';
    } else if (ch === '.' && allowDecimals && !hasDot) {
      hasDot = true;
      digitsAndDot += '.';
    } else if (ch >= '0' && ch <= '9') {
      digitsAndDot += ch;
    }
  }

  if (!digitsAndDot) return sign;

  const [rawInt, rawDec] = digitsAndDot.split('.');
  const normalizedInt =
    rawInt.length > 1 ? rawInt.replace(/^0+(?=\d)/, '') : rawInt;
  const groupedInt = normalizedInt ? addThousandsCommas(normalizedInt) : hasDot ? '0' : '';

  return hasDot ? `${sign}${groupedInt}.${rawDec ?? ''}` : `${sign}${groupedInt}`;
}

function countSignificantChars(str, upToIndex) {
  let count = 0;
  const limit = Math.min(str.length, Math.max(0, upToIndex));
  for (let i = 0; i < limit; i += 1) {
    if (str[i] !== ',') count += 1;
  }
  return count;
}

function resolveCaretIndexForSignificantCount(formattedStr, sigCount) {
  if (sigCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formattedStr.length; i += 1) {
    if (formattedStr[i] !== ',') {
      seen += 1;
      if (seen >= sigCount) return i + 1;
    }
  }
  return formattedStr.length;
}

export function Slider({
  label,
  hint,
  value = 0,
  min = 0,
  max = 100,
  inputMax,
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
  const precision = getStepPrecision(step);
  const allowDecimals = precision > 0;
  const allowNegative = min < 0;
  const effectiveInputMax =
    inputMax !== undefined ? Math.max(max, Number(inputMax) || max) : max;

  const numVal = Number.isFinite(Number(value)) ? Number(value) : 0;
  const sliderClampedVal = Math.max(min, Math.min(max, numVal));
  const pct = Math.max(
    0,
    Math.min(100, ((sliderClampedVal - min) / Math.max(max - min, 0.0001)) * 100),
  );

  const numInputRef = useRef(null);
  const pendingCaretRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const [draftText, setDraftText] = useState(() => formatSliderNumber(numVal, precision));

  useEffect(() => {
    if (!isFocused) {
      setDraftText(formatSliderNumber(numVal, precision));
    }
  }, [numVal, precision, isFocused]);

  useLayoutEffect(() => {
    if (pendingCaretRef.current === null || !numInputRef.current) return;
    const pos = pendingCaretRef.current;
    pendingCaretRef.current = null;
    try {
      numInputRef.current.setSelectionRange(pos, pos);
    } catch {
      // Ignore selection errors on unfocused inputs
    }
  }, [draftText]);

  const clampSliderAndEmit = (raw) => {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return;
    const clamped = roundToPrecision(Math.max(min, Math.min(max, parsed)), precision);
    onChange?.(clamped);
  };

  const commitDraftValue = (rawStr) => {
    const stripped = String(rawStr ?? '').replace(/,/g, '').trim();
    if (!stripped || stripped === '-' || stripped === '.' || stripped === '-.') {
      setDraftText(formatSliderNumber(numVal, precision));
      return;
    }
    const parsed = Number(stripped);
    if (!Number.isFinite(parsed)) {
      setDraftText(formatSliderNumber(numVal, precision));
      return;
    }
    const clamped = roundToPrecision(
      Math.max(min, Math.min(effectiveInputMax, parsed)),
      precision,
    );
    setDraftText(formatSliderNumber(clamped, precision));
    if (clamped !== numVal) {
      onChange?.(clamped);
    }
  };

  const handleTextInputChange = (e) => {
    const rawVal = e.target.value;
    const rawCaret = e.target.selectionStart ?? rawVal.length;
    const sigBeforeCaret = countSignificantChars(rawVal, rawCaret);

    let nextFormatted = sanitizeAndFormatDraft(rawVal, {
      allowDecimals,
      allowNegative,
    });

    const stripped = nextFormatted.replace(/,/g, '');
    if (stripped && stripped !== '-' && stripped !== '.' && stripped !== '-.') {
      const parsed = Number(stripped);
      if (Number.isFinite(parsed)) {
        if (parsed > effectiveInputMax) {
          const capped = roundToPrecision(effectiveInputMax, precision);
          nextFormatted = formatSliderNumber(capped, precision);
          onChange?.(capped);
        } else if (parsed >= min) {
          onChange?.(roundToPrecision(parsed, precision));
        }
      }
    }

    pendingCaretRef.current = resolveCaretIndexForSignificantCount(
      nextFormatted,
      sigBeforeCaret,
    );
    setDraftText(nextFormatted);
  };

  const handleTextInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitDraftValue(draftText);
      e.currentTarget.blur();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setDraftText(formatSliderNumber(numVal, precision));
      e.currentTarget.blur();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const delta = e.key === 'ArrowUp' ? Number(step) || 1 : -(Number(step) || 1);
      const base = Number(String(draftText).replace(/,/g, ''));
      const start = Number.isFinite(base) ? base : numVal;
      const next = roundToPrecision(
        Math.max(min, Math.min(effectiveInputMax, start + delta)),
        precision,
      );
      const formatted = formatSliderNumber(next, precision);
      setDraftText(formatted);
      pendingCaretRef.current = formatted.length;
      onChange?.(next);
    }
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
          value={sliderClampedVal}
          disabled={disabled}
          aria-label={ariaLabel || label || 'Slider value'}
          onChange={(e) => clampSliderAndEmit(e.target.value)}
          className="bb-m3-slider__range"
          style={{ '--bb-slider-pct': `${pct}%` }}
        />
        {showValue && (
          <span className="bb-m3-slider__inline-readout">
            {formatSliderNumber(numVal, precision)}
            {unit}
          </span>
        )}
      </div>
    );
  }

  const formattedDefault =
    defaultValue !== undefined ? formatSliderNumber(defaultValue, precision) : '';

  return (
    <div className={`bb-m3-slider ${className}`.trim()}>
      <div className="bb-m3-slider__head">
        <div className="bb-m3-slider__title-wrap">
          {label && <span className="bb-m3-slider__label">{label}</span>}
          {hint && <span className="bb-m3-slider__hint">{hint}</span>}
        </div>
        <div className="bb-m3-slider__controls">
          <input
            ref={numInputRef}
            type="text"
            inputMode={allowDecimals ? 'decimal' : 'numeric'}
            value={isFocused ? draftText : formatSliderNumber(numVal, precision)}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            aria-label={label || 'Slider value'}
            onFocus={() => {
              setIsFocused(true);
              setDraftText(formatSliderNumber(numVal, precision));
            }}
            onBlur={() => {
              setIsFocused(false);
              commitDraftValue(draftText);
            }}
            onChange={handleTextInputChange}
            onKeyDown={handleTextInputKeyDown}
            className="bb-m3-slider__num"
          />
          {unit && <span className="bb-m3-slider__unit">{unit}</span>}
          {defaultValue !== undefined && numVal !== defaultValue && (
            <Button
              variant="b2"
              size="sm"
              icon="refresh"
              title={`Reset to default (${formattedDefault}${unit ? ` ${unit}` : ''})`}
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
          value={sliderClampedVal}
          disabled={disabled}
          onChange={(e) => clampSliderAndEmit(e.target.value)}
          className="bb-m3-slider__range"
          style={{ '--bb-slider-pct': `${pct}%` }}
        />
      </div>
    </div>
  );
}
