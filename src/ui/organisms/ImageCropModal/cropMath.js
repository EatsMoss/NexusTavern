/**
 * Pure geometry and canvas helpers for M3 2:3 portrait cropping.
 * Zero DOM dependencies in the math functions so they are 100% unit-testable in Node.js.
 */

export const DEFAULT_PORTRAIT_ASPECT = 2 / 3;
export const MIN_CROP_ZOOM = 1;
export const MAX_CROP_ZOOM = 4;

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function computeCoverBaseMetrics(
  naturalWidth,
  naturalHeight,
  frameWidth,
  frameHeight,
) {
  const nw = Math.max(1, Number(naturalWidth) || 1);
  const nh = Math.max(1, Number(naturalHeight) || 1);
  const fw = Math.max(1, Number(frameWidth) || 1);
  const fh = Math.max(1, Number(frameHeight) || 1);

  const baseScale = Math.max(fw / nw, fh / nh);
  return {
    naturalWidth: nw,
    naturalHeight: nh,
    frameWidth: fw,
    frameHeight: fh,
    baseScale,
    baseRenderWidth: nw * baseScale,
    baseRenderHeight: nh * baseScale,
  };
}

export function clampCropOffsets({
  offsetX = 0,
  offsetY = 0,
  naturalWidth,
  naturalHeight,
  frameWidth,
  frameHeight,
  zoom = 1,
}) {
  const safeZoom = clamp(Number(zoom) || 1, MIN_CROP_ZOOM, MAX_CROP_ZOOM);
  const metrics = computeCoverBaseMetrics(
    naturalWidth,
    naturalHeight,
    frameWidth,
    frameHeight,
  );
  const scaledW = metrics.baseRenderWidth * safeZoom;
  const scaledH = metrics.baseRenderHeight * safeZoom;

  const maxOffsetX = Math.max(0, (scaledW - metrics.frameWidth) / 2);
  const maxOffsetY = Math.max(0, (scaledH - metrics.frameHeight) / 2);

  return {
    zoom: safeZoom,
    offsetX: clamp(Number(offsetX) || 0, -maxOffsetX, maxOffsetX) || 0,
    offsetY: clamp(Number(offsetY) || 0, -maxOffsetY, maxOffsetY) || 0,
    maxOffsetX,
    maxOffsetY,
    scaledWidth: scaledW,
    scaledHeight: scaledH,
  };
}

export function zoomAroundFocalPoint({
  currentZoom = 1,
  nextZoom = 1,
  offsetX = 0,
  offsetY = 0,
  focalX = 0,
  focalY = 0,
  naturalWidth,
  naturalHeight,
  frameWidth,
  frameHeight,
}) {
  const prevZ = clamp(Number(currentZoom) || 1, MIN_CROP_ZOOM, MAX_CROP_ZOOM);
  const targetZ = clamp(Number(nextZoom) || 1, MIN_CROP_ZOOM, MAX_CROP_ZOOM);
  const ratio = targetZ / prevZ;

  const rawNextOffsetX = focalX - (focalX - offsetX) * ratio;
  const rawNextOffsetY = focalY - (focalY - offsetY) * ratio;

  return clampCropOffsets({
    offsetX: rawNextOffsetX,
    offsetY: rawNextOffsetY,
    naturalWidth,
    naturalHeight,
    frameWidth,
    frameHeight,
    zoom: targetZ,
  });
}

export function computeSourceCropRect({
  naturalWidth,
  naturalHeight,
  frameWidth,
  frameHeight,
  zoom = 1,
  offsetX = 0,
  offsetY = 0,
}) {
  const nw = Math.max(1, Number(naturalWidth) || 1);
  const nh = Math.max(1, Number(naturalHeight) || 1);
  const metrics = computeCoverBaseMetrics(nw, nh, frameWidth, frameHeight);
  const clamped = clampCropOffsets({
    offsetX,
    offsetY,
    naturalWidth: nw,
    naturalHeight: nh,
    frameWidth: metrics.frameWidth,
    frameHeight: metrics.frameHeight,
    zoom,
  });

  const effectiveScale = metrics.baseScale * clamped.zoom;
  const rawSw = metrics.frameWidth / effectiveScale;
  const rawSh = metrics.frameHeight / effectiveScale;

  const sw = Math.min(nw, Math.max(1, rawSw));
  const sh = Math.min(nh, Math.max(1, rawSh));

  const imgLeftInFrame = (metrics.frameWidth - clamped.scaledWidth) / 2 + clamped.offsetX;
  const imgTopInFrame = (metrics.frameHeight - clamped.scaledHeight) / 2 + clamped.offsetY;

  const rawSx = -imgLeftInFrame / effectiveScale;
  const rawSy = -imgTopInFrame / effectiveScale;

  const sx = clamp(rawSx, 0, Math.max(0, nw - sw));
  const sy = clamp(rawSy, 0, Math.max(0, nh - sh));

  return {
    sx,
    sy,
    sw,
    sh,
    outputWidth: Math.max(1, Math.round(sw)),
    outputHeight: Math.max(1, Math.round(sh)),
  };
}

export function renderCroppedImageToPngDataUrl(
  imageEl,
  cropRect,
  { maxOutputWidth = 1024, aspectRatio = DEFAULT_PORTRAIT_ASPECT } = {},
) {
  if (!imageEl || !cropRect) return null;

  const safeAspect = Number(aspectRatio) > 0 ? Number(aspectRatio) : DEFAULT_PORTRAIT_ASPECT;
  const targetWidth = Math.max(
    64,
    Math.min(maxOutputWidth, Math.round(cropRect.sw || maxOutputWidth)),
  );
  const targetHeight = Math.max(64, Math.round(targetWidth / safeAspect));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(
    imageEl,
    cropRect.sx,
    cropRect.sy,
    cropRect.sw,
    cropRect.sh,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  return canvas.toDataURL('image/png');
}

export function pngDataUrlToFile(dataUrl, originalName = 'portrait.png') {
  const cleanStr = String(dataUrl || '');
  const commaIdx = cleanStr.indexOf(',');
  const base64 = commaIdx !== -1 ? cleanStr.slice(commaIdx + 1) : cleanStr;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const stem =
    String(originalName || 'portrait')
      .replace(/\.[^.]+$/, '')
      .trim() || 'portrait';
  return new File([bytes], `${stem}.png`, { type: 'image/png' });
}
