import React, { useMemo } from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
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

/**
 * RegexPatternInput — Reusable M3 Molecule for authoring `/pattern/flags` expressions
 * with interactive flag chips and live syntax + ReDoS safety diagnostics.
 */
export function RegexPatternInput({
  label = 'Find Regex',
  value = '',
  onChange,
  placeholder = 'e.g. <status>([\\s\\S]*?)<\\/status>',
  disabled = false,
  inputRef = null,
  headerRight = null,
  className = '',
}) {
  const parsed = useMemo(() => parseFindRegexString(value), [value]);
  const safety = useMemo(() => analyzeRegexSafety(value), [value]);

  const handlePatternChange = (e) => {
    const nextPattern = e.target.value;
    onChange?.(formatFindRegexWithFlags(nextPattern, parsed.flags));
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

  return (
    <div className={`bb-rx-pattern-field ${stateClass} ${className}`.trim()}>
      {(label || headerRight) && (
        <div className="bb-rx-pattern-field__top">
          {label && <label className="bb-rx-pattern-field__label">{label}</label>}
          {headerRight && <div className="bb-rx-pattern-field__extra">{headerRight}</div>}
        </div>
      )}

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
