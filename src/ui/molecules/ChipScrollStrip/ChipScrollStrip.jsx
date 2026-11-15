import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '@ui/atoms/Icon/Icon.jsx';
import './ChipScrollStrip.css';

/**
 * ChipScrollStrip — Reusable M3 horizontal chip/filter strip molecule.
 * Automatically reveals floating circular left/right arrow controls with a soft
 * surface fade only when the strip overflows in that direction.
 */
export function ChipScrollStrip({
  children,
  className = '',
  trackClassName = '',
  fadeBg = '',
  scrollStep = 0,
  role,
  ariaLabel,
}) {
  const trackRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const nextLeft = el.scrollLeft > 2;
    const nextRight = maxScroll - el.scrollLeft > 2;
    setCanScrollLeft((prev) => (prev === nextLeft ? prev : nextLeft));
    setCanScrollRight((prev) => (prev === nextRight ? prev : nextRight));
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;

    updateScrollState();
    const rafId = window.requestAnimationFrame(updateScrollState);

    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateScrollState);
      ro.observe(el);
    }

    let mo = null;
    if (typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver(updateScrollState);
      mo.observe(el, { childList: true, subtree: true, characterData: true });
    }

    const handleWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth + 1) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
        updateScrollState();
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('resize', updateScrollState);

    return () => {
      window.cancelAnimationFrame(rafId);
      ro?.disconnect();
      mo?.disconnect();
      el.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState]);

  useEffect(() => {
    updateScrollState();
  });

  const handleStep = useCallback(
    (direction) => {
      const el = trackRef.current;
      if (!el) return;
      const delta =
        scrollStep > 0 ? scrollStep : Math.max(140, Math.round(el.clientWidth * 0.68));
      el.scrollBy({ left: direction * delta, behavior: 'smooth' });
    },
    [scrollStep],
  );

  const rootStyle = fadeBg ? { '--bb-chip-strip-fade-bg': fadeBg } : undefined;

  return (
    <div className={`bb-chip-scroll-strip ${className}`.trim()} style={rootStyle}>
      {canScrollLeft && (
        <div className="bb-chip-scroll-strip__edge bb-chip-scroll-strip__edge--left">
          <button
            type="button"
            className="bb-chip-scroll-strip__arrow"
            aria-label="Scroll chips left"
            title="Scroll left"
            onClick={(e) => {
              e.stopPropagation();
              handleStep(-1);
            }}
          >
            <Icon name="chevronLeft" size={16} />
          </button>
        </div>
      )}

      <div
        ref={trackRef}
        role={role}
        aria-label={ariaLabel}
        onScroll={updateScrollState}
        className={`bb-chip-scroll-strip__track bb-scrollbar--hidden ${trackClassName}`.trim()}
      >
        {children}
      </div>

      {canScrollRight && (
        <div className="bb-chip-scroll-strip__edge bb-chip-scroll-strip__edge--right">
          <button
            type="button"
            className="bb-chip-scroll-strip__arrow"
            aria-label="Scroll chips right"
            title="Scroll right"
            onClick={(e) => {
              e.stopPropagation();
              handleStep(1);
            }}
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
