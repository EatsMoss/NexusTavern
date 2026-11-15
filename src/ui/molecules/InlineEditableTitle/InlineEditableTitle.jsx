import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../../atoms/Icon/Icon.jsx';
import './InlineEditableTitle.css';

/**
 * InlineEditableTitle — M3 click-to-edit heading / title molecule.
 * Used across CharacterSheet headers, Intro cards, Group sheets, and Persona sheets.
 */
export function InlineEditableTitle({
  value = '',
  onChange,
  placeholder = 'Untitled',
  size = 'lg', // 'lg' | 'md' | 'sm'
  variant = 'plain', // 'plain' | 'badge'
  maxLength = 120,
  disabled = false,
  allowEmpty = false,
  clearable = false,
  editTooltip = 'Click to rename',
  trailing = null,
  className = '',
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) {
      setDraft(value ?? '');
    }
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEditing = (e) => {
    if (disabled) return;
    e?.stopPropagation?.();
    setDraft(value ?? '');
    setEditing(true);
  };

  const commit = () => {
    const trimmed = String(draft ?? '').trim();
    setEditing(false);
    if (!allowEmpty && !trimmed) {
      setDraft(value ?? '');
      return;
    }
    if (trimmed !== String(value ?? '')) {
      onChange?.(trimmed);
    }
  };

  const cancel = () => {
    setDraft(value ?? '');
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  const displayText = String(value ?? '').trim() || placeholder;
  const isEmpty = !String(value ?? '').trim();

  const handleClear = (e) => {
    e.stopPropagation();
    setDraft('');
    setEditing(false);
    if (!isEmpty) {
      onChange?.('');
    }
  };

  return (
    <div
      className={[
        'bb-inline-title',
        `bb-inline-title--${size}`,
        variant === 'badge' ? 'bb-inline-title--badge' : '',
        editing ? 'is-editing' : '',
        disabled ? 'is-disabled' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          className="bb-inline-title__input"
          value={draft}
          maxLength={maxLength}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="bb-inline-title__pill-wrap">
          <button
            type="button"
            className={`bb-inline-title__trigger ${isEmpty ? 'is-placeholder' : ''}`}
            title={disabled ? displayText : editTooltip}
            disabled={disabled}
            onClick={startEditing}
          >
            <span className="bb-inline-title__text">{displayText}</span>
            {!disabled && (
              <span className="bb-inline-title__icon" aria-hidden="true">
                <Icon name="edit" size={size === 'lg' ? 14 : 11} />
              </span>
            )}
          </button>
          {clearable && allowEmpty && !isEmpty && !disabled && (
            <button
              type="button"
              className="bb-inline-title__clear"
              title="Clear subtitle"
              aria-label="Clear subtitle"
              onClick={handleClear}
            >
              <Icon name="close" size={11} />
            </button>
          )}
        </div>
      )}
      {trailing && <div className="bb-inline-title__trailing">{trailing}</div>}
    </div>
  );
}
