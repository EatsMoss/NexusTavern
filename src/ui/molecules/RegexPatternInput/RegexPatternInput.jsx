import React, { useState, useMemo } from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Switch } from '../../atoms/Switch/Switch.jsx';
import { Tooltip } from '../../atoms/Tooltip/Tooltip.jsx';
import {
  parseFindRegexString,
  formatFindRegexWithFlags,
  analyzeRegexSafety,
} from '@core/regex/regexEngine.js';
import './RegexPatternInput.css';

const FLAG_DEFINITIONS = [
  { flag: 'g', label: 'g', title: 'Global (g) — match all occurrences' },
  { flag: 'i', label: 'i', title: 'Ignore Case (i) — case-insensitive matching' },
  { flag: 'm', label: 'm', title: 'Multiline (m) — ^ and $ match line boundaries' },
  { flag: 's', label: 's', title: 'DotAll (s) — dot (.) matches newlines' },
  { flag: 'u', label: 'u', title: 'Unicode (u) — full Unicode code point matching' },
];

const STANDARD_CHIP_FLAGS = new Set(FLAG_DEFINITIONS.map((f) => f.flag));

function requiresExpertView(rawValue = '') {
  const str = String(rawValue ?? '');
  if (!str) return false;
  if (/[\r\n]/.test(str)) return true;
  const parsed = parseFindRegexString(str);
  if (!parsed.isSlashNotation) return true;
  for (const ch of parsed.flags) {
    if (!STANDARD_CHIP_FLAGS.has(ch)) return true;
  }
  return false;
}

/**
 * RegexPatternInput — Reusable M3 Molecule for authoring `/pattern/flags` expressions
 * with interactive flag chips, optional raw Expert Mode (`/pattern/flags` multiline editor),
 * and live syntax + ReDoS safety diagnostics.
 */
export function RegexPatternInput({
  label = 'Find Regex',
  value = '',
  onChange,
  placeholder = 'e.g. <status>([\\s\\S]*?)<\\/status>',
  expertPlaceholder = 'e.g. /<status>([\\s\\S]*?)<\\/status>/gim',
  allowExpertToggle = false,
  expertMode: controlledExpertMode,
  onExpertModeChange,
  disabled = false,
  inputRef = null,
  headerRight = null,
  className = '',
}) {
  const [uncontrolledExpert, setUncontrolledExpert] = useState(() =>
    allowExpertToggle ? requiresExpertView(value) : false,
  );

  const isExpert =
    controlledExpertMode !== undefined ? Boolean(controlledExpertMode) : uncontrolledExpert;

  const parsed = useMemo(() => parseFindRegexString(value), [value]);
  const safety = useMemo(() => analyzeRegexSafety(value), [value]);

  const handleToggleExpert = (nextChecked) => {
    if (disabled) return;
    if (!nextChecked && value && !parsed.isSlashNotation) {
      onChange?.(formatFindRegexWithFlags(parsed.pattern, parsed.flags));
    } else if (nextChecked && !String(value ?? '').trim()) {
      onChange?.('//gi');
    }
    if (controlledExpertMode === undefined) {
      setUncontrolledExpert(nextChecked);
    }
    onExpertModeChange?.(nextChecked);
  };

  const handlePatternChange = (e) => {
    const nextInput = e.target.value;
    const pastedSlash = nextInput.match(/^\/([\s\S]+)\/([gimsuvy]*)$/);
    if (pastedSlash && Math.abs(nextInput.length - parsed.pattern.length) > 2) {
      onChange?.(formatFindRegexWithFlags(pastedSlash[1], pastedSlash[2] || parsed.flags));
      return;
    }
    onChange?.(formatFindRegexWithFlags(nextInput, parsed.flags));
  };

  const handleToggleFlag = (flagChar) => {
    if (disabled) return;
    const hasFlag = parsed.flags.includes(flagChar);
    const nextFlags = hasFlag
      ? parsed.flags.replace(flagChar, '')
      : `${parsed.flags}${flagChar}`;
    onChange?.(formatFindRegexWithFlags(parsed.pattern, nextFlags));
  };

  const stateClass = !safety.valid
    ? 'is-invalid'
    : safety.risk === 'danger'
      ? 'is-danger'
      : safety.risk === 'warning'
        ? 'is-warning'
        : '';

  const showTopRow = Boolean(label || headerRight || allowExpertToggle);

  return (
    <div className={`bb-rx-pattern-field ${stateClass} ${className}`.trim()}>
      {showTopRow && (
        <div className="bb-rx-pattern-field__top">
          {label ? <label className="bb-rx-pattern-field__label">{label}</label> : <span />}
          <div className="bb-rx-pattern-field__extra">
            {headerRight}
            {allowExpertToggle && (
              <Switch
                bare
                size="sm"
                inlineLabel="Expert"
                title="Switch between guided flag builder and raw /pattern/flags expression"
                disabled={disabled}
                checked={isExpert}
                onChange={handleToggleExpert}
              />
            )}
          </div>
        </div>
      )}

      {isExpert ? (
        <textarea
          ref={inputRef}
          rows={3}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          disabled={disabled}
          className="bb-rx-pattern-expert"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={expertPlaceholder}
          aria-label={label ? `${label} (Expert raw expression)` : 'Raw regular expression'}
        />
      ) : (
        <div className="bb-rx-pattern-box">
          <span className="bb-rx-pattern-box__delim" aria-hidden="true">
            /
          </span>
          <input
            ref={inputRef}
            type="text"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            disabled={disabled}
            className="bb-rx-pattern-box__input"
            value={parsed.pattern}
            onChange={handlePatternChange}
            placeholder={placeholder}
            aria-label={label || 'Regular expression pattern'}
          />
          <span className="bb-rx-pattern-box__delim" aria-hidden="true">
            /
          </span>

          <div className="bb-rx-pattern-box__flags" role="group" aria-label="Regex flags">
            {FLAG_DEFINITIONS.map((item) => {
              const active = parsed.flags.includes(item.flag);
              return (
                <Tooltip key={item.flag} content={item.title}>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-pressed={active}
                    className={`bb-rx-flag-chip ${active ? 'is-active' : ''}`}
                    onClick={() => handleToggleFlag(item.flag)}
                  >
                    {item.label}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}

      {!safety.empty && (!safety.valid || safety.risk === 'danger' || safety.risk === 'warning') && (
        <div
          className={`bb-rx-pattern-status bb-rx-pattern-status--${
            !safety.valid ? 'invalid' : safety.risk
          }`}
        >
          <Icon name={!safety.valid ? 'errorCircle' : 'warning'} size={13} />
          <span>{!safety.valid ? safety.error : safety.warningMessage}</span>
        </div>
      )}
    </div>
  );
}
