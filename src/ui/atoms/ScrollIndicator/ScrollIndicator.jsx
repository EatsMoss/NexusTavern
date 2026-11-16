import React, {
  useEffect,
  useRef,
  useCallback,
} from 'react';
import './ScrollIndicator.css';

/**
 * Overlay scrollbar (thin M3 pill thumb painted above the content).
 * Takes zero layout space, so scrollable children keep identical width
 * whether or not they overflow.
 *
 * Performance architecture:
 *  - Zero React state / zero component re-renders on scroll, hover, or drag.
 *  - All DOM geometry reads (`scrollHeight`, `clientHeight`, `scrollTop`,
 *    `getBoundingClientRect`) and thumb style writes are coalesced into at most
 *    one `requestAnimationFrame` callback per frame.
 *  - Observes only the scroll container (and indicator root) via `ResizeObserver`
 *    with no per-child observers or `MutationObserver`.
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
  const rootRef = useRef(null);
  const thumbRef = useRef(null);

  const rafIdRef = useRef(0);
  const hideTimerRef = useRef(0);

  const stateRef = useRef({
    top: 0,
    height: 0,
    overflowing: false,
    visible: false,
    dragging: false,
    hovered: false,
    pendingReveal: false,
    pendingAutoHide: false,
    pendingDragClientY: null,
    pendingJumpClientY: null,
    pendingInitDragClientY: null,
    dragOffset: 0,
  });

  const minThumbHeight = variant === 'compact' ? 20 : 28;
  const minThumbHeightRef = useRef(minThumbHeight);
  minThumbHeightRef.current = minThumbHeight;

  const setClassFlag = useCallback((flagClass, enabled) => {
    const rootEl = rootRef.current;
    if (!rootEl) return;
    rootEl.classList.toggle(flagClass, Boolean(enabled));
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = 0;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = 0;
      const st = stateRef.current;
      if (st.dragging || st.hovered) return;
      if (st.visible) {
        st.visible = false;
        setClassFlag('is-visible', false);
      }
    }, 1200);
  }, [clearHideTimer, setClassFlag]);

  const flushFrame = useCallback(() => {
    rafIdRef.current = 0;
    const el = scrollRef?.current;
    const rootEl = rootRef.current;
    const thumbEl = thumbRef.current;
    const st = stateRef.current;

    if (!el || !rootEl || !thumbEl) return;

    let { scrollHeight, clientHeight, scrollTop } = el;
    const overflowing = clientHeight > 0 && scrollHeight > clientHeight + 1;

    if (!overflowing) {
      st.pendingInitDragClientY = null;
      st.pendingDragClientY = null;
      st.pendingJumpClientY = null;
      st.pendingReveal = false;
      st.pendingAutoHide = false;

      if (st.overflowing) {
        st.overflowing = false;
        setClassFlag('is-overflowing', false);
      }
      if (st.visible) {
        st.visible = false;
        setClassFlag('is-visible', false);
      }
      if (st.height !== 0 || st.top !== 0) {
        st.height = 0;
        st.top = 0;
        thumbEl.style.height = '0px';
        thumbEl.style.transform = 'translate3d(0, 0px, 0)';
      }
      return;
    }

    const rawTrackHeight = rootEl.clientHeight;
    const trackHeight = rawTrackHeight > 0 ? rawTrackHeight : clientHeight;
    const minH = minThumbHeightRef.current;
    const rawHeight = trackHeight * (clientHeight / scrollHeight);
    const nextHeight = Math.min(
      trackHeight,
      Math.max(Math.min(minH, trackHeight), rawHeight),
    );
    const maxTop = Math.max(0, trackHeight - nextHeight);
    const maxScroll = Math.max(1, scrollHeight - clientHeight);

    const needsTrackRect =
      st.pendingInitDragClientY !== null ||
      st.pendingDragClientY !== null ||
      st.pendingJumpClientY !== null;

    if (needsTrackRect && maxTop > 0) {
      const trackRect = rootEl.getBoundingClientRect();
      const scaleY =
        trackRect.height > 0 ? trackHeight / trackRect.height : 1;

      if (st.pendingInitDragClientY !== null) {
        const currentProgress = Math.min(1, Math.max(0, scrollTop / maxScroll));
        const currentTop = maxTop * currentProgress;
        st.dragOffset =
          (st.pendingInitDragClientY - trackRect.top) * scaleY - currentTop;
        st.pendingInitDragClientY = null;
      }

      if (st.pendingJumpClientY !== null) {
        const pointerLocalY = (st.pendingJumpClientY - trackRect.top) * scaleY;
        const desiredTop = Math.min(
          maxTop,
          Math.max(0, pointerLocalY - nextHeight / 2),
        );
        const targetScrollTop = (desiredTop / maxTop) * maxScroll;
        el.scrollTop = targetScrollTop;
        scrollTop = targetScrollTop;
        st.pendingJumpClientY = null;
      }

      if (st.pendingDragClientY !== null) {
        const pointerLocalY = (st.pendingDragClientY - trackRect.top) * scaleY;
        const desiredTop = Math.min(
          maxTop,
          Math.max(0, pointerLocalY - st.dragOffset),
        );
        const targetScrollTop = (desiredTop / maxTop) * maxScroll;
        el.scrollTop = targetScrollTop;
        scrollTop = targetScrollTop;
        st.pendingDragClientY = null;
      }
    } else {
      st.pendingInitDragClientY = null;
      st.pendingDragClientY = null;
      st.pendingJumpClientY = null;
    }

    const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));
    const nextTop = maxTop * progress;

    if (!st.overflowing) {
      st.overflowing = true;
      setClassFlag('is-overflowing', true);
    }

    if (Math.abs(st.height - nextHeight) >= 0.1) {
      st.height = nextHeight;
      thumbEl.style.height = `${nextHeight}px`;
    }

    if (Math.abs(st.top - nextTop) >= 0.1) {
      st.top = nextTop;
      thumbEl.style.transform = `translate3d(0, ${nextTop}px, 0)`;
    }

    if (st.pendingReveal) {
      st.pendingReveal = false;
      clearHideTimer();
      if (!st.visible) {
        st.visible = true;
        setClassFlag('is-visible', true);
      }
      if (st.pendingAutoHide && !st.dragging && !st.hovered) {
        scheduleHide();
      }
      st.pendingAutoHide = false;
    }
  }, [scrollRef, setClassFlag, clearHideTimer, scheduleHide]);

  const scheduleSync = useCallback(
    ({ reveal = false, autoHide = false } = {}) => {
      const st = stateRef.current;
      if (reveal) st.pendingReveal = true;
      if (autoHide) st.pendingAutoHide = true;
      if (!rafIdRef.current) {
        rafIdRef.current = window.requestAnimationFrame(flushFrame);
      }
    },
    [flushFrame],
  );

  // Re-sync when controlled input/textarea value changes externally.
  useEffect(() => {
    if (watchValue !== undefined) {
      scheduleSync();
    }
  }, [watchValue, scheduleSync]);

  // Attach passive scroll/input listeners and lightweight container ResizeObserver.
  useEffect(() => {
    const el = scrollRef?.current;
    const rootEl = rootRef.current;
    if (!el) return undefined;

    scheduleSync();

    const onScroll = () => {
      scheduleSync({ reveal: true, autoHide: true });
    };

    const onInput = () => {
      scheduleSync({ reveal: true, autoHide: true });
    };

    const onEnter = () => {
      scheduleSync({ reveal: true, autoHide: true });
    };

    const onLeave = () => {
      if (!stateRef.current.dragging && !stateRef.current.hovered) {
        scheduleHide();
      }
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('input', onInput, { passive: true });
    el.addEventListener('pointerenter', onEnter, { passive: true });
    el.addEventListener('pointerleave', onLeave, { passive: true });

    const ro = new ResizeObserver(() => {
      scheduleSync();
    });
    ro.observe(el);
    if (rootEl) {
      ro.observe(rootEl);
    }

    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('input', onInput);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      ro.disconnect();
    };
  }, [scrollRef, scheduleSync, scheduleHide]);

  // Cleanup active timers, rAF, and global drag listeners on unmount.
  const cleanupDragRef = useRef(null);
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
      clearHideTimer();
      cleanupDragRef.current?.();
    };
  }, [clearHideTimer]);

  const handleIndicatorEnter = useCallback(() => {
    stateRef.current.hovered = true;
    clearHideTimer();
    scheduleSync({ reveal: true, autoHide: false });
  }, [clearHideTimer, scheduleSync]);

  const handleIndicatorLeave = useCallback(() => {
    stateRef.current.hovered = false;
    if (!stateRef.current.dragging) {
      scheduleHide();
    }
  }, [scheduleHide]);

  const handleThumbPointerDown = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();

      const st = stateRef.current;
      if (!st.overflowing) return;

      cleanupDragRef.current?.();

      st.dragging = true;
      st.pendingInitDragClientY = e.clientY;
      setClassFlag('is-dragging', true);
      clearHideTimer();
      scheduleSync({ reveal: true, autoHide: false });

      const onMove = (moveEvent) => {
        stateRef.current.pendingDragClientY = moveEvent.clientY;
        scheduleSync({ reveal: true, autoHide: false });
      };

      const onUp = () => {
        cleanupDragRef.current?.();
        const cur = stateRef.current;
        cur.dragging = false;
        cur.pendingInitDragClientY = null;
        cur.pendingDragClientY = null;
        setClassFlag('is-dragging', false);
        if (!cur.hovered) {
          scheduleHide();
        }
      };

      cleanupDragRef.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        cleanupDragRef.current = null;
      };

      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [clearHideTimer, scheduleHide, scheduleSync, setClassFlag],
  );

  const handleTrackPointerDown = useCallback(
    (e) => {
      e.stopPropagation();
      if (!stateRef.current.overflowing) return;
      stateRef.current.pendingJumpClientY = e.clientY;
      scheduleSync({ reveal: true, autoHide: true });
    },
    [scheduleSync],
  );

  const variantClass =
    variant === 'compact'
      ? 'bb-scroll-indicator--panel bb-scroll-indicator--compact'
      : variant === 'panel'
        ? 'bb-scroll-indicator--panel'
        : '';

  return (
    <div
      ref={rootRef}
      className={['bb-scroll-indicator', variantClass, className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      <div
        className="bb-scroll-indicator__track"
        onPointerDown={handleTrackPointerDown}
        onPointerEnter={handleIndicatorEnter}
        onPointerLeave={handleIndicatorLeave}
      />
      <div
        ref={thumbRef}
        className="bb-scroll-indicator__thumb"
        onPointerDown={handleThumbPointerDown}
        onPointerEnter={handleIndicatorEnter}
        onPointerLeave={handleIndicatorLeave}
      />
    </div>
  );
}

