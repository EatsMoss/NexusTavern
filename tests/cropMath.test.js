import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCoverBaseMetrics,
  clampCropOffsets,
  zoomAroundFocalPoint,
  computeSourceCropRect,
} from '../src/ui/organisms/ImageCropModal/cropMath.js';

describe('cropMath — 2:3 M3 portrait cropper geometry & focal-point zoom', () => {
  it('computes cover scale without letterboxing for wide and tall sources', () => {
    // 1000x1000 square source into a 200x300 (2:3) frame -> height governs scale (0.3)
    const square = computeCoverBaseMetrics(1000, 1000, 200, 300);
    assert.equal(square.baseScale, 0.3);
    assert.equal(square.baseRenderWidth, 300);
    assert.equal(square.baseRenderHeight, 300);

    // 600x1200 tall source into a 200x300 frame -> width governs scale (1/3)
    const tall = computeCoverBaseMetrics(600, 1200, 200, 300);
    assert.ok(Math.abs(tall.baseScale - 1 / 3) < 1e-6);
    assert.ok(Math.abs(tall.baseRenderWidth - 200) < 1e-6);
    assert.ok(Math.abs(tall.baseRenderHeight - 400) < 1e-6);
  });

  it('clamps pan offsets strictly within scaled image boundaries', () => {
    // 1000x1000 in 200x300 at zoom=1 renders 300x300 -> maxOffsetX = 50, maxOffsetY = 0
    const res = clampCropOffsets({
      offsetX: 999,
      offsetY: -999,
      naturalWidth: 1000,
      naturalHeight: 1000,
      frameWidth: 200,
      frameHeight: 300,
      zoom: 1,
    });
    assert.equal(res.offsetX, 50);
    assert.equal(res.offsetY, 0);
  });

  it('maps centered and panned 2:3 crop rectangles back to source pixels accurately', () => {
    const centered = computeSourceCropRect({
      naturalWidth: 900,
      naturalHeight: 900,
      frameWidth: 200,
      frameHeight: 300,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    });
    assert.ok(Math.abs(centered.sw - 600) < 1e-6);
    assert.ok(Math.abs(centered.sh - 900) < 1e-6);
    assert.ok(Math.abs(centered.sx - 150) < 1e-6);
    assert.ok(Math.abs(centered.sy - 0) < 1e-6);

    const zoomed = zoomAroundFocalPoint({
      currentZoom: 1,
      nextZoom: 2,
      offsetX: 0,
      offsetY: 0,
      focalX: 25,
      focalY: -30,
      naturalWidth: 900,
      naturalHeight: 900,
      frameWidth: 200,
      frameHeight: 300,
    });
    assert.equal(zoomed.zoom, 2);
    const rect2 = computeSourceCropRect({
      naturalWidth: 900,
      naturalHeight: 900,
      frameWidth: 200,
      frameHeight: 300,
      zoom: zoomed.zoom,
      offsetX: zoomed.offsetX,
      offsetY: zoomed.offsetY,
    });
    assert.ok(Math.abs(rect2.sw - 300) < 1e-6);
    assert.ok(Math.abs(rect2.sh - 450) < 1e-6);
    assert.ok(rect2.sx >= 0 && rect2.sx + rect2.sw <= 900);
    assert.ok(rect2.sy >= 0 && rect2.sy + rect2.sh <= 900);
  });
});
