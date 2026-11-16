import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
  encodePngChunks,
  extractPngChunks,
  isPngBuffer,
} from '../server/services/pngCardCodec.js';
import { generatePngThumbnailBuffer } from '../server/services/thumbnails.js';
import { toChatPortraitUrl } from '../src/core/cards/cardsApi.js';

function createCheckerboardPng(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA

  const stride = width * 4;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + stride);
    raw[rowStart] = 0; // filter 0
    for (let x = 0; x < width; x += 1) {
      const idx = rowStart + 1 + x * 4;
      const white = (x + y) % 2 === 0;
      const val = white ? 240 : 20;
      raw[idx] = val;
      raw[idx + 1] = val;
      raw[idx + 2] = val;
      raw[idx + 3] = 255;
    }
  }

  return encodePngChunks([
    { type: 'IHDR', data: ihdr },
    { type: 'IDAT', data: zlib.deflateSync(raw) },
    { type: 'IEND', data: Buffer.alloc(0) },
  ]);
}

describe('thumbnails — smooth 2D Area-Averaging PNG downscaler & chat portrait URLs', () => {
  it('averages high-frequency checkerboard pixels smoothly instead of nearest-neighbor aliasing', () => {
    // 256x384 high-contrast 1px checkerboard downscaled to 128x192 (exact 2x2 per pixel)
    // Nearest-neighbor would pick either 240 or 20; Area-Averaging produces exact 130 mid-grey!
    const src = createCheckerboardPng(256, 384);
    const thumb = generatePngThumbnailBuffer(src, 128);
    assert.ok(isPngBuffer(thumb));

    const chunks = extractPngChunks(thumb);
    const ihdr = chunks.find((c) => c.type === 'IHDR');
    assert.equal(ihdr.data.readUInt32BE(0), 128);
    assert.equal(ihdr.data.readUInt32BE(4), 192);
    assert.equal(ihdr.data[9], 6);

    const idat = zlib.inflateSync(
      Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)),
    );
    // First pixel of row 0 (Sub filter: raw byte == actual pixel value for x=0)
    const r0 = idat[1];
    const g0 = idat[2];
    const b0 = idat[3];
    const a0 = idat[4];
    assert.equal(r0, 130);
    assert.equal(g0, 130);
    assert.equal(b0, 130);
    assert.equal(a0, 255);
  });

  it('rewrites character, persona, and custom intro portrait URLs to 128px chat thumbnails', () => {
    assert.equal(
      toChatPortraitUrl('/api/thumbnails/avatar/Elowen.png?v=123'),
      '/api/thumbnails/avatar/Elowen.png?v=123&size=chat&tv=3',
    );
    assert.equal(
      toChatPortraitUrl('/api/thumbnails/persona/User.png'),
      '/api/thumbnails/persona/User.png?size=chat&tv=3',
    );
    assert.equal(
      toChatPortraitUrl('/user-data/.nexustavern/portraits/Elowen/alt_1.png?auth=abc'),
      '/api/thumbnails/portrait/Elowen/alt_1.png?auth=abc&tv=3',
    );
  });
});
