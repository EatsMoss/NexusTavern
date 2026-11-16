import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@ui/atoms/Button/Button.jsx';
import { ProgressIndicator } from '@ui/atoms/ProgressIndicator/ProgressIndicator.jsx';
import { Slider } from '@ui/molecules/Slider/Slider.jsx';
import { Modal } from '@ui/organisms/Modal/Modal.jsx';
import {
  DEFAULT_PORTRAIT_ASPECT,
  MIN_CROP_ZOOM,
  MAX_CROP_ZOOM,
  computeCoverBaseMetrics,
  clampCropOffsets,
  zoomAroundFocalPoint,
  computeSourceCropRect,
  renderCroppedImageToPngDataUrl,
  pngDataUrlToFile,
} from './cropMath.js';
import './ImageCropModal.css';

export function ImageCropModal({
  open = false,
  file = null,
  imageSrc = '',
  fileName = 'portrait.png',
  title = 'Crop Portrait',
  subtitle = '',
  aspectRatio = DEFAULT_PORTRAIT_ASPECT,
  maxOutputWidth = 1024,
  stepIndex = 0,
  totalSteps = 1,
  confirmLabel,
  onCancel,
  onConfirm,
}) {
  const stageRef = useRef(null);
  const frameRef = useRef(null);
  const imgRef = useRef(null);
  const activePointersRef = useRef(new Map());
  const pinchBaseRef = useRef(null);
  const dragStartRef = useRef(null);

  const [resolvedSrc, setResolvedSrc] = useState('');
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [frameSize, setFrameSize] = useState({ width: 200, height: 300 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setResolvedSrc('');
      setNaturalSize({ width: 0, height: 0 });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setIsDragging(false);
      setSubmitting(false);
      activePointersRef.current.clear();
      return undefined;
    }

    setNaturalSize({ width: 0, height: 0 });
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setSubmitting(false);

    if (file instanceof Blob) {
      const objectUrl = URL.createObjectURL(file);
      setResolvedSrc(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }

    setResolvedSrc(String(imageSrc || ''));
    return undefined;
  }, [open, file, imageSrc]);

  const measureFrame = useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 10 && rect.height > 10) {
      setFrameSize((prev) =>
        Math.abs(prev.width - rect.width) > 0.5 || Math.abs(prev.height - rect.height) > 0.5
          ? { width: rect.width, height: rect.height }
          : prev,
      );
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    measureFrame();
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measureFrame);
      return () => window.removeEventListener('resize', measureFrame);
    }
    const ro = new ResizeObserver(() => measureFrame());
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, measureFrame]);

  useEffect(() => {
    if (!naturalSize.width || !naturalSize.height) return;
    setOffset((prev) => {
      const clamped = clampCropOffsets({
        offsetX: prev.x,
        offsetY: prev.y,
        naturalWidth: naturalSize.width,
        naturalHeight: naturalSize.height,
        frameWidth: frameSize.width,
        frameHeight: frameSize.height,
        zoom,
      });
      if (clamped.offsetX === prev.x && clamped.offsetY === prev.y) return prev;
      return { x: clamped.offsetX, y: clamped.offsetY };
    });
  }, [naturalSize.width, naturalSize.height, frameSize.width, frameSize.height, zoom]);


  const coverMetrics = useMemo(() => {
    if (!naturalSize.width || !naturalSize.height) return null;
    return computeCoverBaseMetrics(
      naturalSize.width,
      naturalSize.height,
      frameSize.width,
      frameSize.height,
    );
  }, [naturalSize.width, naturalSize.height, frameSize.width, frameSize.height]);

  const cropRect = useMemo(() => {
    if (!naturalSize.width || !naturalSize.height) return null;
    return computeSourceCropRect({
      naturalWidth: naturalSize.width,
      naturalHeight: naturalSize.height,
      frameWidth: frameSize.width,
      frameHeight: frameSize.height,
      zoom,
      offsetX: offset.x,
      offsetY: offset.y,
    });
  }, [naturalSize.width, naturalSize.height, frameSize.width, frameSize.height, zoom, offset]);

  const applyZoomChange = useCallback(
    (nextZoomVal, focalX = 0, focalY = 0) => {
      if (!naturalSize.width || !naturalSize.height) return;
      const result = zoomAroundFocalPoint({
        currentZoom: zoom,
        nextZoom: nextZoomVal,
        offsetX: offset.x,
        offsetY: offset.y,
        focalX,
        focalY,
        naturalWidth: naturalSize.width,
        naturalHeight: naturalSize.height,
        frameWidth: frameSize.width,
        frameHeight: frameSize.height,
      });
      setZoom(Number(result.zoom.toFixed(3)));
      setOffset({ x: result.offsetX, y: result.offsetY });
    },
    [zoom, offset.x, offset.y, naturalSize.width, naturalSize.height, frameSize.width, frameSize.height],
  );

  const handleReset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const stageEl = stageRef.current;
    if (!open || !stageEl) return undefined;

    const onWheel = (e) => {
      if (!naturalSize.width || !naturalSize.height) return;
      e.preventDefault();
      const frameEl = frameRef.current;
      let focalX = 0;
      let focalY = 0;
      if (frameEl) {
        const rect = frameEl.getBoundingClientRect();
        focalX = e.clientX - (rect.left + rect.width / 2);
        focalY = e.clientY - (rect.top + rect.height / 2);
      }
      const deltaFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      applyZoomChange(zoom * deltaFactor, focalX, focalY);
    };

    stageEl.addEventListener('wheel', onWheel, { passive: false });
    return () => stageEl.removeEventListener('wheel', onWheel);
  }, [open, naturalSize.width, naturalSize.height, zoom, applyZoomChange]);

  const handlePointerDown = (e) => {
    if (!naturalSize.width || !naturalSize.height) return;
    if (e.button !== undefined && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseOffsetX: offset.x,
        baseOffsetY: offset.y,
      };
      pinchBaseRef.current = null;
    } else if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      pinchBaseRef.current = {
        startDist: dist,
        startZoom: zoom,
      };
    }
  };

  const handlePointerMove = (e) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 2 && pinchBaseRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      const scaleRatio = dist / pinchBaseRef.current.startDist;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const frameRect = frameRef.current?.getBoundingClientRect();
      const focalX = frameRect ? midX - (frameRect.left + frameRect.width / 2) : 0;
      const focalY = frameRect ? midY - (frameRect.top + frameRect.height / 2) : 0;
      applyZoomChange(pinchBaseRef.current.startZoom * scaleRatio, focalX, focalY);
      return;
    }

    if (activePointersRef.current.size === 1 && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      const clamped = clampCropOffsets({
        offsetX: dragStartRef.current.baseOffsetX + dx,
        offsetY: dragStartRef.current.baseOffsetY + dy,
        naturalWidth: naturalSize.width,
        naturalHeight: naturalSize.height,
        frameWidth: frameSize.width,
        frameHeight: frameSize.height,
        zoom,
      });
      setOffset({ x: clamped.offsetX, y: clamped.offsetY });
    }
  };

  const handlePointerEnd = (e) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size === 1) {
      const remaining = Array.from(activePointersRef.current.values())[0];
      dragStartRef.current = {
        startX: remaining.x,
        startY: remaining.y,
        baseOffsetX: offset.x,
        baseOffsetY: offset.y,
      };
      pinchBaseRef.current = null;
    } else if (activePointersRef.current.size === 0) {
      dragStartRef.current = null;
      pinchBaseRef.current = null;
      setIsDragging(false);
    }
  };

  const handleConfirmCrop = async () => {
    if (!imgRef.current || !cropRect || submitting) return;
    setSubmitting(true);
    try {
      const pngDataUrl = renderCroppedImageToPngDataUrl(imgRef.current, cropRect, {
        maxOutputWidth,
        aspectRatio,
      });
      if (!pngDataUrl) {
        setSubmitting(false);
        return;
      }
      const effectiveName = file?.name || fileName || 'portrait.png';
      const croppedFile = pngDataUrlToFile(pngDataUrl, effectiveName);
      await onConfirm?.({
        dataUrl: pngDataUrl,
        file: croppedFile,
        cropRect,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const effectiveFileName = file?.name || fileName || '';
  const resolvedSubtitle =
    subtitle ||
    (totalSteps > 1
      ? `Image ${stepIndex + 1} of ${totalSteps}${effectiveFileName ? ` · ${effectiveFileName}` : ''}`
      : effectiveFileName || 'Drag to frame · Scroll or slide to zoom');

  const resolvedConfirmLabel =
    confirmLabel ||
    (totalSteps > 1 && stepIndex < totalSteps - 1 ? 'Apply & Next' : 'Apply Crop');

  const outW = cropRect
    ? Math.max(64, Math.min(maxOutputWidth, Math.round(cropRect.sw)))
    : 0;
  const outH = outW ? Math.round(outW / aspectRatio) : 0;

  const modalNode = (
    <Modal
      open={open}
      onClose={submitting ? undefined : onCancel}
      title={title}
      subtitle={resolvedSubtitle}
      icon="crop"
      zIndex={3400}
      className="bb-crop-modal"
      bodyClassName="bb-crop-modal__body"
      bodyScrollable={false}
      footer={
        <div className="bb-crop-modal__footer">
          <span className="bb-crop-modal__dims">
            {outW > 0 ? `${outW} × ${outH} px · 2:3 PNG` : 'Loading image…'}
          </span>
          <div className="bb-crop-modal__actions">
            <Button
              variant="b1"
              size="sm"
              emphasis="outlined"
              disabled={submitting}
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              variant="b1"
              size="sm"
              emphasis="filled"
              icon="check"
              disabled={!cropRect || submitting}
              onClick={handleConfirmCrop}
            >
              {submitting ? 'Applying…' : resolvedConfirmLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div
        ref={stageRef}
        className={`bb-crop-stage ${isDragging ? 'is-dragging' : ''} ${zoom > 1.005 ? 'is-zooming' : ''}`.trim()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={handleReset}
      >
        {resolvedSrc && (
          <img
            ref={imgRef}
            src={resolvedSrc}
            alt="Crop source"
            draggable={false}
            crossOrigin={resolvedSrc.startsWith('http') ? 'anonymous' : undefined}
            className="bb-crop-stage__img"
            style={
              coverMetrics
                ? {
                    width: `${coverMetrics.baseRenderWidth}px`,
                    height: `${coverMetrics.baseRenderHeight}px`,
                    transform: `translate3d(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px), 0) scale(${zoom})`,
                  }
                : { opacity: 0 }
            }
            onLoad={(e) => {
              const nw = e.currentTarget.naturalWidth || e.currentTarget.width || 400;
              const nh = e.currentTarget.naturalHeight || e.currentTarget.height || 600;
              measureFrame();
              setNaturalSize({ width: nw, height: nh });
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
          />
        )}

        {!naturalSize.width && (
          <ProgressIndicator variant="circular" size="md" ariaLabel="Loading image" />
        )}

        <div
          ref={frameRef}
          className="bb-crop-stage__frame"
          style={{ aspectRatio: `${aspectRatio}` }}
        >
          <div className="bb-crop-stage__grid" />
          <span className="bb-crop-stage__corner bb-crop-stage__corner--tl" />
          <span className="bb-crop-stage__corner bb-crop-stage__corner--tr" />
          <span className="bb-crop-stage__corner bb-crop-stage__corner--bl" />
          <span className="bb-crop-stage__corner bb-crop-stage__corner--br" />
        </div>

        {naturalSize.width > 0 && (
          <div className="bb-crop-stage__hint-pill" aria-hidden="true">
            Drag to reposition · Scroll to zoom
          </div>
        )}
      </div>

      <div className="bb-crop-controls">
        <span className="bb-crop-controls__zoom-label">Zoom</span>
        <Slider
          variant="inline"
          ariaLabel="Crop zoom"
          value={Number(zoom.toFixed(2))}
          min={MIN_CROP_ZOOM}
          max={MAX_CROP_ZOOM}
          step={0.01}
          defaultValue={1}
          unit="×"
          disabled={!naturalSize.width || submitting}
          onChange={(val) => applyZoomChange(val, 0, 0)}
          className="bb-crop-controls__slider"
        />
        <Button
          variant="b2"
          size="sm"
          icon="refresh"
          title="Reset zoom and center frame"
          disabled={!naturalSize.width || (zoom === 1 && offset.x === 0 && offset.y === 0)}
          onClick={handleReset}
        >
          Reset
        </Button>
      </div>
    </Modal>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
}
