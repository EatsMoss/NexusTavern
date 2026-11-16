import zlib from 'node:zlib';
import { isMainThread, parentPort } from 'node:worker_threads';
import {
  isPngBuffer,
  extractPngChunks,
  encodePngChunks,
  stripPngMetadataChunks,
} from '../services/pngCardCodec.js';

const DEFAULT_TARGET_WIDTH = 160;

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterPngScanlines(rawScanlines, height, stride, bpp) {
  const unfiltered = Buffer.allocUnsafe(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filterType = rawScanlines[y * (stride + 1)];
    const rowInStart = y * (stride + 1) + 1;
    const rowOutStart = y * stride;
    const prevRowOutStart = (y - 1) * stride;

    for (let x = 0; x < stride; x += 1) {
      const rawByte = rawScanlines[rowInStart + x];
      const left = x >= bpp ? unfiltered[rowOutStart + x - bpp] : 0;
      const up = y > 0 ? unfiltered[prevRowOutStart + x] : 0;
      const upLeft = y > 0 && x >= bpp ? unfiltered[prevRowOutStart + x - bpp] : 0;

      let val = rawByte;
      if (filterType === 1) val = (rawByte + left) & 0xff;
      else if (filterType === 2) val = (rawByte + up) & 0xff;
      else if (filterType === 3) val = (rawByte + ((left + up) >> 1)) & 0xff;
      else if (filterType === 4) val = (rawByte + paethPredictor(left, up, upLeft)) & 0xff;

      unfiltered[rowOutStart + x] = val;
    }
  }
  return unfiltered;
}

function expandToRgba(unfiltered, width, height, colorType, bpp, plteChunk, trnsChunk) {
  const srcRgba = Buffer.allocUnsafe(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const dstIdx = i * 4;
    const srcIdx = i * bpp;

    if (colorType === 6) {
      srcRgba[dstIdx] = unfiltered[srcIdx];
      srcRgba[dstIdx + 1] = unfiltered[srcIdx + 1];
      srcRgba[dstIdx + 2] = unfiltered[srcIdx + 2];
      srcRgba[dstIdx + 3] = unfiltered[srcIdx + 3];
    } else if (colorType === 2) {
      srcRgba[dstIdx] = unfiltered[srcIdx];
      srcRgba[dstIdx + 1] = unfiltered[srcIdx + 1];
      srcRgba[dstIdx + 2] = unfiltered[srcIdx + 2];
      srcRgba[dstIdx + 3] = 255;
    } else if (colorType === 4) {
      const g = unfiltered[srcIdx];
      srcRgba[dstIdx] = g;
      srcRgba[dstIdx + 1] = g;
      srcRgba[dstIdx + 2] = g;
      srcRgba[dstIdx + 3] = unfiltered[srcIdx + 1];
    } else if (colorType === 0) {
      const g = unfiltered[srcIdx];
      srcRgba[dstIdx] = g;
      srcRgba[dstIdx + 1] = g;
      srcRgba[dstIdx + 2] = g;
      srcRgba[dstIdx + 3] = 255;
    } else if (colorType === 3 && plteChunk) {
      const palIdx = unfiltered[srcIdx];
      const pOffset = palIdx * 3;
      srcRgba[dstIdx] = plteChunk.data[pOffset] ?? 0;
      srcRgba[dstIdx + 1] = plteChunk.data[pOffset + 1] ?? 0;
      srcRgba[dstIdx + 2] = plteChunk.data[pOffset + 2] ?? 0;
      srcRgba[dstIdx + 3] =
        trnsChunk && palIdx < trnsChunk.data.length ? trnsChunk.data[palIdx] : 255;
    } else {
      return null;
    }
  }
  return srcRgba;
}

function downscalePremultipliedArea(srcRgba, width, height, outW, outH) {
  const outBpp = 4;
  const outStride = outW * outBpp;
  const outScanlines = Buffer.allocUnsafe(outH * (1 + outStride));
  const rawRow = Buffer.allocUnsafe(outStride);
  const scaleX = width / outW;
  const scaleY = height / outH;

  for (let y = 0; y < outH; y += 1) {
    const rowOffset = y * (1 + outStride);
    outScanlines[rowOffset] = 1; // PNG Filter 1 (Sub)
    const srcY0 = y * scaleY;
    const srcY1 = Math.min(height, (y + 1) * scaleY);
    const iyStart = Math.floor(srcY0);
    const iyEnd = Math.min(height - 1, Math.max(iyStart, Math.ceil(srcY1) - 1));

    for (let x = 0; x < outW; x += 1) {
      const srcX0 = x * scaleX;
      const srcX1 = Math.min(width, (x + 1) * scaleX);
      const ixStart = Math.floor(srcX0);
      const ixEnd = Math.min(width - 1, Math.max(ixStart, Math.ceil(srcX1) - 1));

      let sumPremulR = 0;
      let sumPremulG = 0;
      let sumPremulB = 0;
      let sumAlpha = 0;
      let totalWeight = 0;

      for (let iy = iyStart; iy <= iyEnd; iy += 1) {
        const wy = Math.min(iy + 1, srcY1) - Math.max(iy, srcY0);
        if (wy <= 0) continue;
        const rowBase = iy * width;

        for (let ix = ixStart; ix <= ixEnd; ix += 1) {
          const wx = Math.min(ix + 1, srcX1) - Math.max(ix, srcX0);
          if (wx <= 0) continue;
          const w = wx * wy;
          const sIdx = (rowBase + ix) * 4;
          const aNorm = srcRgba[sIdx + 3] / 255;

          sumPremulR += srcRgba[sIdx] * aNorm * w;
          sumPremulG += srcRgba[sIdx + 1] * aNorm * w;
          sumPremulB += srcRgba[sIdx + 2] * aNorm * w;
          sumAlpha += aNorm * w;
          totalWeight += w;
        }
      }

      const rIdx = x * outBpp;
      if (totalWeight > 0 && sumAlpha > 1e-6) {
        const outAlphaNorm = Math.min(1, sumAlpha / totalWeight);
        rawRow[rIdx] = Math.min(255, Math.max(0, Math.round(sumPremulR / sumAlpha)));
        rawRow[rIdx + 1] = Math.min(255, Math.max(0, Math.round(sumPremulG / sumAlpha)));
        rawRow[rIdx + 2] = Math.min(255, Math.max(0, Math.round(sumPremulB / sumAlpha)));
        rawRow[rIdx + 3] = Math.min(255, Math.max(0, Math.round(outAlphaNorm * 255)));
      } else {
        rawRow[rIdx] = 0;
        rawRow[rIdx + 1] = 0;
        rawRow[rIdx + 2] = 0;
        rawRow[rIdx + 3] = 0;
      }
    }

    for (let i = 0; i < outStride; i += 1) {
      const left = i >= outBpp ? rawRow[i - outBpp] : 0;
      outScanlines[rowOffset + 1 + i] = (rawRow[i] - left) & 0xff;
    }
  }

  return outScanlines;
}
/**
 * Pure Node.js PNG downscaler + metadata stripper:
 * Decodes non-interlaced 8-bit PNG (RGB, RGBA, Grayscale, Grayscale+Alpha, Palette),
 * downscales to targetWidth, and encodes a compact 8-bit RGBA PNG with zero metadata chunks.
 */
export function generatePngThumbnailBuffer(
  pngBuffer,
  targetWidth = DEFAULT_TARGET_WIDTH,
) {
  if (!isPngBuffer(pngBuffer)) {
    return pngBuffer;
  }

  try {
    const chunks = extractPngChunks(pngBuffer);
    const ihdr = chunks.find((c) => c.type === 'IHDR');
    if (!ihdr || ihdr.data.length < 13) {
      return stripPngMetadataChunks(pngBuffer);
    }

    const width = ihdr.data.readUInt32BE(0);
    const height = ihdr.data.readUInt32BE(4);
    const bitDepth = ihdr.data[8];
    const colorType = ihdr.data[9];
    const compression = ihdr.data[10];
    const filter = ihdr.data[11];
    const interlace = ihdr.data[12];

    if (
      width <= targetWidth ||
      bitDepth !== 8 ||
      compression !== 0 ||
      filter !== 0 ||
      interlace !== 0
    ) {
      return stripPngMetadataChunks(pngBuffer);
    }

    const bytesPerPixelMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
    const bpp = bytesPerPixelMap[colorType];
    if (!bpp) {
      return stripPngMetadataChunks(pngBuffer);
    }

    const plteChunk = chunks.find((c) => c.type === 'PLTE');
    const trnsChunk = chunks.find((c) => c.type === 'tRNS');
    const idatBuffers = chunks.filter((c) => c.type === 'IDAT').map((c) => c.data);
    if (idatBuffers.length === 0) {
      return stripPngMetadataChunks(pngBuffer);
    }

    const rawScanlines = zlib.inflateSync(Buffer.concat(idatBuffers));
    const stride = width * bpp;
    if (rawScanlines.length < height * (1 + stride)) {
      return stripPngMetadataChunks(pngBuffer);
    }

    const unfiltered = unfilterPngScanlines(rawScanlines, height, stride, bpp);
    const srcRgba = expandToRgba(
      unfiltered,
      width,
      height,
      colorType,
      bpp,
      plteChunk,
      trnsChunk,
    );
    if (!srcRgba) {
      return stripPngMetadataChunks(pngBuffer);
    }

    const outW = targetWidth;
    const outH = Math.max(1, Math.round((height * outW) / width));
    const outScanlines = downscalePremultipliedArea(srcRgba, width, height, outW, outH);

    const newIhdr = Buffer.alloc(13);
    newIhdr.writeUInt32BE(outW, 0);
    newIhdr.writeUInt32BE(outH, 4);
    newIhdr[8] = 8;
    newIhdr[9] = 6; // RGBA colorType

    const compressedIdat = zlib.deflateSync(outScanlines, { level: 9 });
    return encodePngChunks([
      { type: 'IHDR', data: newIhdr },
      { type: 'IDAT', data: compressedIdat },
      { type: 'IEND', data: Buffer.alloc(0) },
    ]);
  } catch {
    return stripPngMetadataChunks(pngBuffer);
  }
}

function toDetachedUint8Array(buf) {
  if (buf.byteOffset === 0 && buf.byteLength === buf.buffer.byteLength) {
    return new Uint8Array(buf.buffer);
  }
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return copy;
}

if (!isMainThread && parentPort) {
  parentPort.on('message', (task) => {
    const id = task?.id;
    try {
      const raw = task?.pngData;
      const inputBuf = Buffer.isBuffer(raw)
        ? raw
        : raw instanceof Uint8Array
          ? Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
          : Buffer.from(raw || []);
      const outBuf = generatePngThumbnailBuffer(
        inputBuf,
        Number(task?.targetWidth) || DEFAULT_TARGET_WIDTH,
      );
      const transferable = toDetachedUint8Array(outBuf);
      parentPort.postMessage(
        { id, ok: true, data: transferable },
        [transferable.buffer],
      );
    } catch (err) {
      parentPort.postMessage({
        id,
        ok: false,
        error: err?.message || 'Thumbnail worker failed',
      });
    }
  });
}


