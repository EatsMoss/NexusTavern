import React, { forwardRef, useRef, useCallback } from 'react';
import { ScrollIndicator } from '../ScrollIndicator/ScrollIndicator.jsx';
import './OverlayScrollArea.css';

/**
 * Reusable M3 Overlay Scroll Area (Atomic UI-Kit Primitive).
 *
 * Hides the layout-shifting native scrollbar via `.bb-scrollbar--hidden` on an
 * inner viewport and paints `ScrollIndicator` above the right edge so content
 * keeps 100% identical width regardless of overflow state.
 */
export const OverlayScrollArea = forwardRef(function OverlayScrollArea(
  {
    as: WrapperTag = 'div',
    viewportAs: ViewportTag = 'div',
    className = '',
    viewportClassName = '',
    indicatorClassName = '',
    variant = 'panel',
    disabled = false,
    watchValue,
    style,
    viewportStyle,
    children,
    ...viewportProps
  },
  forwardedRef,
) {
  const innerRef = useRef(null);

  const assignViewportRef = useCallback(
    (node) => {
      innerRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef],
  );

  return (
    <WrapperTag
      className={`bb-overlay-scroll-area ${className}`.trim()}
      style={style}
    >
      <ViewportTag
        ref={assignViewportRef}
        className={[
          'bb-overlay-scroll-area__viewport',
          disabled ? 'is-scroll-disabled' : 'bb-scrollbar--hidden',
          viewportClassName,
        ]
          .filter(Boolean)
          .join(' ')}
        style={viewportStyle}
        {...viewportProps}
      >
        {children}
      </ViewportTag>
      {!disabled && (
        <ScrollIndicator
          scrollRef={innerRef}
          variant={variant}
          watchValue={watchValue}
          className={indicatorClassName}
        />
      )}
    </WrapperTag>
  );
});
