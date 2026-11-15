import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * Lightweight responsive viewport hook optimized with passive resize listener.
 */
export function useViewport() {
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
    isMobile:
      typeof window !== 'undefined' ? window.innerWidth <= MOBILE_BREAKPOINT : false,
  }));

  useEffect(() => {
    let rafId = null;
    const handleResize = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const width = window.innerWidth;
        const height = window.innerHeight;
        setViewport({
          width,
          height,
          isMobile: width <= MOBILE_BREAKPOINT,
        });
      });
    };

    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return viewport;
}
