import React from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import './ConsoleToggleButton.css';

/**
 * Clean borderless/backgroundless M3 Console Trigger Icon Button (matches 30px chip row height).
 */
export function ConsoleToggleButton({
  open = false,
  onClick,
  label = '',
  title = 'Toggle SillyTavern-parity live output console',
  className = '',
}) {
  const iconOnly = !label;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label || 'Toggle output console'}
      aria-expanded={open}
      className={[
        'bb-console-toggle-btn',
        iconOnly ? 'bb-console-toggle-btn--icon-only' : '',
        open ? 'is-active' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon name="terminal" size={17} />
      {label && <span>{label}</span>}
    </button>
  );
}
