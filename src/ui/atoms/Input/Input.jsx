import React, { forwardRef, useRef, useCallback } from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import { ScrollIndicator } from '@ui/atoms/ScrollIndicator/ScrollIndicator.jsx';
import './Input.css';

export function Input({
  label,
  hint,
  size = 'md',
  className = '',
  id,
  ...rest
}) {
  const content = (
    <div className="bb-m3-input-wrap">
      <input
        id={id}
        className={`bb-m3-input ${size === 'sm' ? 'bb-m3-input--sm' : ''} ${className}`.trim()}
        {...rest}
      />
    </div>
  );

  if (!label && !hint) return content;

  return (
    <div className="bb-m3-field">
      {label && (
        <div className="bb-m3-field__label-row">
          <label htmlFor={id} className="bb-m3-field__label">
            {label}
          </label>
        </div>
      )}
      {content}
      {hint && <span className="bb-m3-field__hint">{hint}</span>}
    </div>
  );
}

export function SearchInput({
  value = '',
  onChange,
  onClear,
  placeholder = 'Search...',
  size = 'md', // 'sm' (28px, popovers) | 'md' (32px, panels)
  className = '',
  inputClassName = '',
  autoFocus = false,
  inputRef,
  ...rest
}) {
  const innerRef = React.useRef(null);

  React.useEffect(() => {
    if (autoFocus) innerRef.current?.focus();
  }, [autoFocus]);

  const assignRef = (node) => {
    innerRef.current = node;
    if (typeof inputRef === 'function') inputRef(node);
    else if (inputRef) inputRef.current = node;
  };

  return (
    <div className={`bb-m3-search bb-m3-search--${size} ${className}`.trim()}>
      <div className="bb-m3-search__field">
        <Icon name="search" size={size === 'sm' ? 14 : 17} className="bb-m3-search__icon" />
        <input
          ref={assignRef}
          type="text"
          value={value}
          onChange={(e) => onChange?.(e.target.value, e)}
          placeholder={placeholder}
          className={`bb-m3-input ${inputClassName}`.trim()}
          {...rest}
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            className="bb-m3-search__clear"
            onClick={() => {
              onChange?.('');
              onClear?.();
              innerRef.current?.focus();
            }}
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export const Textarea = forwardRef(function Textarea(
  {
    label,
    headerRight = null,
    hint,
    monospace = false,
    status = '', // '' | 'invalid' | 'warning'
    className = '',
    wrapClassName = '',
    textareaRef,
    id,
    ...rest
  },
  forwardedRef,
) {
  const innerRef = useRef(null);

  const assignRef = useCallback(
    (node) => {
      innerRef.current = node;
      if (typeof textareaRef === 'function') textareaRef(node);
      else if (textareaRef) textareaRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [textareaRef, forwardedRef],
  );

  const isNonResizable = className.includes('no-resize');
  const textareaClasses = [
    'bb-m3-textarea',
    'bb-scrollbar--hidden',
    monospace ? 'bb-m3-textarea--mono' : '',
    status === 'invalid' ? 'is-invalid' : '',
    status === 'warning' ? 'is-warning' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const control = (
    <div className={`bb-m3-textarea-wrap ${wrapClassName}`.trim()}>
      <textarea
        ref={assignRef}
        id={id}
        className={textareaClasses}
        {...rest}
      />
      <ScrollIndicator
        scrollRef={innerRef}
        variant="compact"
        watchValue={rest.value}
        className={isNonResizable ? '' : 'bb-m3-textarea__scroll'}
      />
    </div>
  );

  if (!label && !headerRight && !hint) return control;

  return (
    <div className="bb-m3-field">
      {(label || headerRight) && (
        <div className="bb-m3-field__label-row">
          {label && (
            <label htmlFor={id} className="bb-m3-field__label">
              {label}
            </label>
          )}
          {headerRight && <div className="bb-m3-field__label-extra">{headerRight}</div>}
        </div>
      )}
      {control}
      {hint && <span className="bb-m3-field__hint">{hint}</span>}
    </div>
  );
});
