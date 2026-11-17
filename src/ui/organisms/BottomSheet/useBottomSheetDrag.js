import { useEffect, useRef, useState, useCallback } from 'react';

const DISMISS_DISTANCE_PX = 88;
const DISMISS_VELOCITY_PX_PER_MS = 0.55;

/**
 * Pointer drag-to-dismiss physics for M3 BottomSheet.
 * Rubber-bands upward pull and dismisses on downward distance or flick velocity.
 */
export function useBottomSheetDrag({ open, onClose, sheetRef }) {
  const dragStateRef = useRef(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!open) {
      setDragOffsetY(0);
      setIsDragging(false);
      dragStateRef.current = null;
    }
  }, [open]);

  const onPointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('button, a, input, textarea, select, [role="button"]')) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragStateRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      lastY: e.clientY,
      lastTime: performance.now(),
      velocityY: 0,
    };
    setIsDragging(true);
  }, []);

  const onPointerMove = useCallback((e) => {
    const st = dragStateRef.current;
    if (!st || st.pointerId !== e.pointerId) return;
    const now = performance.now();
    const dt = Math.max(1, now - st.lastTime);
    const dy = e.clientY - st.startY;
    st.velocityY = (e.clientY - st.lastY) / dt;
    st.lastY = e.clientY;
    st.lastTime = now;
    setDragOffsetY(dy < 0 ? Math.max(-18, dy * 0.18) : dy);
  }, []);

  const finishGesture = useCallback(
    (e) => {
      const st = dragStateRef.current;
      if (!st || st.pointerId !== e.pointerId) return;
      dragStateRef.current = null;
      setIsDragging(false);
      const totalDy = Math.max(0, e.clientY - st.startY);
      const sheetHeight = sheetRef.current?.offsetHeight || 320;
      const threshold = Math.min(DISMISS_DISTANCE_PX, sheetHeight * 0.32);
      setDragOffsetY(0);
      if (totalDy >= threshold || (totalDy > 24 && st.velocityY >= DISMISS_VELOCITY_PX_PER_MS)) {
        onClose?.();
      }
    },
    [onClose, sheetRef],
  );

  return {
    dragOffsetY,
    isDragging,
    dragZoneHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishGesture,
      onPointerCancel: finishGesture,
    },
  };
}
