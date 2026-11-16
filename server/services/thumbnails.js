import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { safeWriteFileAtomic as writeFileAtomic } from '../utils/safeWriteFile.js';
import { DEFAULT_USER_DIR, NEXUSTAVERN_PORTRAITS_DIR } from '../utils/paths.js';
import {
  isPngBuffer,
  extractPngChunks,
  encodePngChunks,
  stripPngMetadataChunks,
} from './pngCardCodec.js';

export const THUMBNAILS_ROOT_DIR = path.join(DEFAULT_USER_DIR, 'thumbnails');
export const AVATAR_THUMBNAIL_DIR = path.join(THUMBNAILS_ROOT_DIR, 'avatar');
export const PERSONA_THUMBNAIL_DIR = path.join(THUMBNAILS_ROOT_DIR, 'persona');
export const AVATAR_CHAT_THUMBNAIL_DIR = path.join(THUMBNAILS_ROOT_DIR, 'avatar-chat');
export const PERSONA_CHAT_THUMBNAIL_DIR = path.join(THUMBNAILS_ROOT_DIR, 'persona-chat');
export const PORTRAIT_CHAT_THUMBNAIL_DIR = path.join(THUMBNAILS_ROOT_DIR, 'portrait-chat');

export const TARGET_THUMB_WIDTH = 160;
export const CHAT_THUMB_WIDTH = 128;
const THUMB_ENGINE_VERSION = 'v3-area-aa';
const VERSION_MARKER_PATH = path.join(THUMBNAILS_ROOT_DIR, '.thumb-engine-version');

let engineVersionVerified = false;

export function ensureThumbnailDirs() {
  const dirs = [
    AVATAR_THUMBNAIL_DIR,
    PERSONA_THUMBNAIL_DIR,
    AVATAR_CHAT_THUMBNAIL_DIR,
    PERSONA_CHAT_THUMBNAIL_DIR,
    PORTRAIT_CHAT_THUMBNAIL_DIR,
  ];

  if (!engineVersionVerified) {
    engineVersionVerified = true;
    try {
      fs.mkdirSync(THUMBNAILS_ROOT_DIR, { recursive: true });
      const currentVer = fs.existsSync(VERSION_MARKER_PATH)
        ? fs.readFileSync(VERSION_MARKER_PATH, 'utf8').trim()
        : '';
      if (currentVer !== THUMB_ENGINE_VERSION) {
        for (const dir of dirs) {
          if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
          }
        }
        fs.writeFileSync(VERSION_MARKER_PATH, THUMB_ENGINE_VERSION, 'utf8');
      }
    } catch {
      // ignore fs permission errors during version check
    }
  }

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Pure Node.js PNG downscaler + metadata stripper:
 * Decodes non-interlaced 8-bit PNG (RGB, RGBA, Grayscale, Grayscale+Alpha, Palette),
 * downscales to targetWidth, and encodes a compact 8-bit RGBA PNG with zero metadata chunks.
 */
export function generatePngThumbnailBuffer(pngBuffer, targetWidth = TARGET_THUMB_WIDTH) {
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
      }
    }

    const outW = targetWidth;
    const outH = Math.max(1, Math.round((height * outW) / width));
    const outBpp = 4; // 32-bit RGBA so alpha edges stay clean in both Dark and Light themes
    const outStride = outW * outBpp;
    const outScanlines = Buffer.allocUnsafe(outH * (1 + outStride));
    const rawRow = Buffer.allocUnsafe(outStride);
    const scaleX = width / outW;
    const scaleY = height / outH;

    // Exact 2D Subpixel Area-Averaging (premultiplied-alpha box supersampling)
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

export function invalidateThumbnailCache(type, filename) {
  const safeName = path.basename(String(filename || ''));
  if (!safeName) return;
  const targets =
    type === 'persona'
      ? [
          path.join(PERSONA_THUMBNAIL_DIR, safeName),
          path.join(PERSONA_CHAT_THUMBNAIL_DIR, safeName),
        ]
      : [
          path.join(AVATAR_THUMBNAIL_DIR, safeName),
          path.join(AVATAR_CHAT_THUMBNAIL_DIR, safeName),
        ];
  for (const p of targets) {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { force: true });
    }
  }
}

/**
 * Ensures a cached thumbnail exists for a character avatar (`type = 'avatar'`)
 * or user persona (`type = 'persona'`) and returns its file path on disk.
 * When `chat = true`, generates a dedicated softer 128px chat portrait.
 */
export async function ensureThumbnailFile(type, filename, { chat = false } = {}) {
  ensureThumbnailDirs();
  const safeName = path.basename(filename);
  const srcDir =
    type === 'persona'
      ? path.join(DEFAULT_USER_DIR, 'User Avatars')
      : path.join(DEFAULT_USER_DIR, 'characters');
  const thumbDir =
    type === 'persona'
      ? chat
        ? PERSONA_CHAT_THUMBNAIL_DIR
        : PERSONA_THUMBNAIL_DIR
      : chat
        ? AVATAR_CHAT_THUMBNAIL_DIR
        : AVATAR_THUMBNAIL_DIR;

  const srcPath = path.join(srcDir, safeName);
  if (!fs.existsSync(srcPath)) {
    return null;
  }

  const thumbPath = path.join(thumbDir, safeName);
  const srcStat = fs.statSync(srcPath);

  if (fs.existsSync(thumbPath)) {
    const thumbStat = fs.statSync(thumbPath);
    if (thumbStat.mtimeMs >= srcStat.mtimeMs && thumbStat.size > 0) {
      return thumbPath;
    }
  }

  const ext = path.extname(safeName).toLowerCase();
  const srcBuf = fs.readFileSync(srcPath);
  const targetWidth = chat ? CHAT_THUMB_WIDTH : TARGET_THUMB_WIDTH;

  if (ext === '.png' && isPngBuffer(srcBuf)) {
    const thumbBuf = generatePngThumbnailBuffer(srcBuf, targetWidth);
    await writeFileAtomic(thumbPath, thumbBuf);
    return thumbPath;
  }

  await writeFileAtomic(thumbPath, srcBuf);
  return thumbPath;
}

/**
 * Ensures a smooth chat-sized thumbnail for a custom scenario/intro portrait
 * stored under `.nexustavern/portraits/<slug>/<filename>`.
 */
export async function ensureScenarioPortraitThumbnailFile(slug, filename) {
  ensureThumbnailDirs();
  const safeSlug = path.basename(String(slug || '')).replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeFile = path.basename(String(filename || ''));
  if (!safeSlug || !safeFile) return null;

  const srcPath = path.join(NEXUSTAVERN_PORTRAITS_DIR, safeSlug, safeFile);
  if (!fs.existsSync(srcPath)) {
    return null;
  }

  const destDir = path.join(PORTRAIT_CHAT_THUMBNAIL_DIR, safeSlug);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  const thumbPath = path.join(destDir, safeFile);
  const srcStat = fs.statSync(srcPath);

  if (fs.existsSync(thumbPath)) {
    const thumbStat = fs.statSync(thumbPath);
    if (thumbStat.mtimeMs >= srcStat.mtimeMs && thumbStat.size > 0) {
      return thumbPath;
    }
  }

  const srcBuf = fs.readFileSync(srcPath);
  if (safeFile.toLowerCase().endsWith('.png') && isPngBuffer(srcBuf)) {
    const thumbBuf = generatePngThumbnailBuffer(srcBuf, CHAT_THUMB_WIDTH);
    await writeFileAtomic(thumbPath, thumbBuf);
    return thumbPath;
  }

  await writeFileAtomic(thumbPath, srcBuf);
  return thumbPath;
}

