import React, { useMemo } from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import { Textarea } from '../../atoms/Input/Input.jsx';
import {
  parseAdditionalBodyInclude,
  parseAdditionalBodyExclude,
  parseAdditionalHeadersInclude,
} from '@core/presets/additionalParameters.js';
import './YamlCodeField.css';

function evaluateMode(mode, value) {
  if (mode === 'exclude-keys') {
    return parseAdditionalBodyExclude(value);
  }
  if (mode === 'headers') {
    return parseAdditionalHeadersInclude(value);
  }
  return parseAdditionalBodyInclude(value);
}

function formatValidBadgeText(mode, count) {
  if (mode === 'exclude-keys') {
    return `${count} ${count === 1 ? 'key' : 'keys'} excluded`;
  }
  if (mode === 'headers') {
    return `${count} ${count === 1 ? 'header' : 'headers'}`;
  }
  return `${count} ${count === 1 ? 'param' : 'params'}`;
}

/**
 * YamlCodeField — Reusable M3 Molecule for authoring structured YAML / JSON
 * configuration snippets with live syntax & schema diagnostics.
 */
export function YamlCodeField({
  id,
  label,
  hint,
  value = '',
  onChange,
  mode = 'object', // 'object' | 'exclude-keys' | 'headers'
  rows = 3,
  placeholder = '',
  disabled = false,
  className = '',
}) {
  const diag = useMemo(() => evaluateMode(mode, value), [mode, value]);

  const status = !diag.valid ? 'invalid' : diag.warning ? 'warning' : '';

  const badgeNode = !diag.empty ? (
    !diag.valid ? (
      <span className="bb-yaml-field__pill is-invalid">
        <Icon name="errorCircle" size={12} />
        <span>YAML Error</span>
      </span>
    ) : diag.warning ? (
      <span className="bb-yaml-field__pill is-warning">
        <Icon name="warning" size={12} />
        <span>{diag.count > 0 ? formatValidBadgeText(mode, diag.count) : 'Ignored'}</span>
      </span>
    ) : (
      <span className="bb-yaml-field__pill is-valid">
        <Icon name="check" size={12} />
        <span>{formatValidBadgeText(mode, diag.count)}</span>
      </span>
    )
  ) : (
    <span className="bb-yaml-field__format-tag">YAML / JSON</span>
  );

  const handleKeyDown = (e) => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const str = String(value || '');
      const next = `${str.slice(0, start)}  ${str.slice(end)}`;
      onChange?.(next, e);
      requestAnimationFrame(() => {
        try {
          el.selectionStart = start + 2;
          el.selectionEnd = start + 2;
        } catch {
          // ignore if unmounted
        }
      });
    }
  };

  return (
    <div className={`bb-yaml-field ${className}`.trim()}>
      <Textarea
        id={id}
        label={label}
        headerRight={badgeNode}
        hint={diag.valid && !diag.warning ? hint : undefined}
        monospace
        status={status}
        rows={rows}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onKeyDown={handleKeyDown}
        onChange={(e) => onChange?.(e.target.value, e)}
      />

      {!diag.empty && (!diag.valid || diag.warning) && (
        <div
          className={`bb-yaml-field__status ${
            !diag.valid ? 'bb-yaml-field__status--invalid' : 'bb-yaml-field__status--warning'
          }`}
        >
          <Icon name={!diag.valid ? 'errorCircle' : 'warning'} size={13} />
          <span>{!diag.valid ? diag.error : diag.warning}</span>
        </div>
      )}
    </div>
  );
}
