import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import './ScrollIndicator.css';

/**
 * Overlay scrollbar (thin M3 pill thumb painted above the content).
 * Takes zero layout space, so scrollable children keep identical width
 * whether or not they overflow.
 *
 * Variants:
 *  - 'chat'    (default): centered column track for ChatViewport
 *  - 'panel'   : right-edge overlay bar for tomes, modals, lists & editors
 *  - 'compact' : slimmer right-edge bar with corner-safe vertical inset
 */
export function ScrollIndicator({
  scrollRef,
  variant = 'chat',
  watchValue,
  className = '',
}) {
  const [thumb, setThumb] = useState({ top: 0, height: 0 });
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef(null);
  const dragOffsetRef = useRef(0);
  const hideTimerRef = useRef(0);

  const minThumbHeight = variant === 'compact' ? 20 : 28;

  const readMetrics = useCallback(() => {
    const el = scrollRef?.current;
    if (!el) return null;
    const { scrollHeight, clientHeight, scrollTop } = el;
    if (clientHeight <= 0 || scrollHeight <= clientHeight + 1) return null;
    const trackEl = trackRef.current;
    const trackHeight =
      trackEl && trackEl.clientHeight > 0 ? trackEl.clientHeight : clientHeight;
    return { scrollHeight, clientHeight, scrollTop, trackHeight };
  }, [scrollRef]);

  const sync = useCallback(() => {
    const metrics = readMetrics();
    if (!metrics) {
      setThumb((prev) =>
        prev.height === 0 && prev.top === 0 ? prev : { top: 0, height: 0 },
      );
      return false;
    }
    const { scrollHeight, clientHeight, scrollTop, trackHeight } = metrics;
    const rawHeight = trackHeight * (clientHeight / scrollHeight);
    const height = Math.min(
      trackHeight,
      Math.max(Math.min(minThumbHeight, trackHeight), rawHeight),
    );
    const maxTop = Math.max(0, trackHeight - height);
    const maxScroll = Math.max(1, scrollHeight - clientHeight);
    const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));
    const nextTop = maxTop * progress;
    setThumb((prev) => {
      if (
        Math.abs(prev.top - nextTop) < 0.25 &&
        Math.abs(prev.height - height) < 0.25
      ) {
        return prev;
      }
      return { top: nextTop, height };
    });
    return true;
  }, [readMetrics, minThumbHeight]);

  const scheduleHide = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setVisible(false), 1200);
  }, []);

  const show = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    setVisible(true);
  }, []);

  const keepVisible = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    setVisible(true);
  }, []);

  const releaseVisible = useCallback(() => {
    if (!dragging) scheduleHide();
  }, [dragging, scheduleHide]);

  // Re-measure once the track mounts so vertical insets (e.g. compact variant)
  // clamp thumb travel strictly within the rendered track height.
  useLayoutEffect(() => {
    if (thumb.height > 0 && trackRef.current) {
      sync();
    }
  }, [thumb.height > 0, sync]);

  // Re-sync when controlled input/textarea value changes externally.
  useLayoutEffect(() => {
    if (watchValue !== undefined) {
      sync();
    }
  }, [watchValue, sync]);

  useEffect(() => {
    return () => {
      window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Mirror the scroll position and react to container, child & text resizes.
  useEffect(() => {
    const el = scrollRef?.current;
    if (!el) return undefined;

    sync();

    const onScroll = () => {
      if (sync()) {
        setVisible(true);
        if (!dragging) scheduleHide();
      }
    };

    const onInput = () => {
      if (sync()) {
        setVisible(true);
        if (!dragging) scheduleHide();
      }
    };

    const onEnter = () => {
      if (sync()) keepVisible();
    };
    const onLeave = () => releaseVisible();

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('input', onInput, { passive: true });
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);

    const ro = new ResizeObserver(() => {
      sync();
    });
    const observedChildren = new Set();
    const observeDirectChildren = () => {
      const nextChildren = new Set(Array.from(el.children || []));
      observedChildren.forEach((child) => {
        if (!nextChildren.has(child)) {
          ro.unobserve(child);
          observedChildren.delete(child);
        }
      });
      nextChildren.forEach((child) => {
        if (!observedChildren.has(child)) {
          ro.observe(child);
          observedChildren.add(child);
        }
      });
    };

    ro.observe(el);
    observeDirectChildren();

    const mo = new MutationObserver(() => {
      observeDirectChildren();
      sync();
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });

    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('input', onInput);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      ro.disconnect();
      mo.disconnect();
    };
  }, [scrollRef, sync, scheduleHide, dragging, keepVisible, releaseVisible]);

  useEffect(() => () => window.clearTimeout(hideTimerRef.current), []);

  // Drag handling in viewport space, so the thumb follows the pointer exactly.
  useEffect(() => {
    if (!dragging) return undefined;

    const el = scrollRef?.current;
    if (!el) return undefined;

    const onMove = (e) => {
      const metrics = readMetrics();
      const track = trackRef.current;
      if (!metrics || !track) return;

      const { scrollHeight, clientHeight, trackHeight } = metrics;
      const maxThumbTop = trackHeight - thumb.height;
      if (maxThumbTop <= 0) return;

      const trackRect = track.getBoundingClientRect();
      const scaleY =
        trackRect.height > 0 ? trackHeight / trackRect.height : 1;
      const pointerLocalY = (e.clientY - trackRect.top) * scaleY;
      const desiredTop = Math.min(
        maxThumbTop,
        Math.max(0, pointerLocalY - dragOffsetRef.current),
      );
      el.scrollTop = (desiredTop / maxThumbTop) * (scrollHeight - clientHeight);
    };

    const onUp = () => {
      setDragging(false);
      scheduleHide();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, readMetrics, scrollRef, thumb.height, scheduleHide]);

  const handleThumbPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const trackRect = trackRef.current?.getBoundingClientRect();
    const metrics = readMetrics();
    if (!trackRect || !metrics) return;
    const scaleY =
      trackRect.height > 0 ? metrics.trackHeight / trackRect.height : 1;
    dragOffsetRef.current = (e.clientY - trackRect.top) * scaleY - thumb.top;
    setDragging(true);
    show();
  };

  const handleTrackPointerDown = (e) => {
    e.stopPropagation();
    const el = scrollRef?.current;
    const trackRect = trackRef.current?.getBoundingClientRect();
    const metrics = readMetrics();
    if (!el || !trackRect || !metrics) return;

    const { scrollHeight, clientHeight, trackHeight } = metrics;
    const maxThumbTop = trackHeight - thumb.height;
    if (maxThumbTop <= 0) return;

    const scaleY =
      trackRect.height > 0 ? trackHeight / trackRect.height : 1;
    const pointerLocalY = (e.clientY - trackRect.top) * scaleY;
    const desiredTop = Math.min(
      maxThumbTop,
      Math.max(0, pointerLocalY - thumb.height / 2),
    );
    el.scrollTop = (desiredTop / maxThumbTop) * (scrollHeight - clientHeight);
    show();
    scheduleHide();
  };

  if (thumb.height === 0) return null;

  const variantClass =
    variant === 'compact'
      ? 'bb-scroll-indicator--panel bb-scroll-indicator--compact'
      : variant === 'panel'
        ? 'bb-scroll-indicator--panel'
        : '';

  return (
    <div
      ref={trackRef}
      className={[
        'bb-scroll-indicator',
        variantClass,
        visible || dragging ? 'is-visible' : '',
        dragging ? 'is-dragging' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      <div
        className="bb-scroll-indicator__track"
        onPointerDown={handleTrackPointerDown}
        onPointerEnter={keepVisible}
        onPointerLeave={releaseVisible}
      />
      <div
        className="bb-scroll-indicator__thumb"
        style={{ top: `${thumb.top}px`, height: `${thumb.height}px` }}
        onPointerDown={handleThumbPointerDown}
        onPointerEnter={keepVisible}
        onPointerLeave={releaseVisible}
      />
    </div>
  );
}

