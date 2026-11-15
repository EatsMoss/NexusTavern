import React from 'react';
import './TypingDots.css';

/**
 * Pure M3 3-dot wave indicator (`TypingDots`).
 * Used both as the initial LLM waiting status row and inline at the exact spot
 * where an active response stream temporarily stalls.
 */
export function TypingDots({
  inline = false,
  size = 'md', // 'sm' | 'md'
  tone = 'primary', // 'primary' | 'muted' | 'on-surface'
  label = '',
  ariaLabel = 'Waiting for response',
  className = '',
  style,
}) {
  const RootTag = inline ? 'span' : 'div';

  return (
    <RootTag
      className={[
        'bb-typing-dots',
        inline ? 'bb-typing-dots--inline' : '',
        `bb-typing-dots--size-${size}`,
        `bb-typing-dots--tone-${tone}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      role="status"
      aria-live="polite"
      aria-label={label ? undefined : ariaLabel}
    >
      <span className="bb-typing-dots__track" aria-hidden="true">
        <span className="bb-typing-dots__dot" />
        <span className="bb-typing-dots__dot" />
        <span className="bb-typing-dots__dot" />
      </span>
      {label ? <span className="bb-typing-dots__label">{label}</span> : null}
    </RootTag>
  );
}
