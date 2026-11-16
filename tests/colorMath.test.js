import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHex,
  isValidHexDraft,
  hexToRgb,
  rgbToHex,
  hexToHsv,
  hsvToHex,
  hexWithAlphaCss,
} from '@ui/molecules/ColorField/colorMath.js';

test('colorMath — HEX normalization, RGB/HSV round-trip & alpha formatting', async (t) => {
  await t.test('normalizes 3-digit and 6-digit HEX strings safely', () => {
    assert.equal(normalizeHex('#abc'), '#AABBCC');
    assert.equal(normalizeHex('6575b3'), '#6575B3');
    assert.equal(normalizeHex('invalid', '#6D6D83'), '#6D6D83');
    assert.equal(isValidHexDraft('#F0A'), true);
    assert.equal(isValidHexDraft('#6575B3'), true);
    assert.equal(isValidHexDraft('#12'), false);
  });

  await t.test('round-trips RGB and HSV accurately for M3 palette seeds', () => {
    const seeds = ['#6D6D83', '#6575B3', '#C9975B', '#EDE3D2', '#000000', '#FFFFFF'];
    for (const hex of seeds) {
      const rgb = hexToRgb(hex);
      assert.equal(rgbToHex(rgb.r, rgb.g, rgb.b), hex);
      const hsv = hexToHsv(hex);
      const restored = hsvToHex(hsv.h, hsv.s, hsv.v);
      const restoredRgb = hexToRgb(restored);
      assert.ok(Math.abs(restoredRgb.r - rgb.r) <= 2);
      assert.ok(Math.abs(restoredRgb.g - rgb.g) <= 2);
      assert.ok(Math.abs(restoredRgb.b - rgb.b) <= 2);
    }
  });

  await t.test('formats opaque and translucent CSS color strings', () => {
    assert.equal(hexWithAlphaCss('#6575b3', 1), '#6575B3');
    assert.equal(hexWithAlphaCss('#6575b3', 0.5), 'rgba(101, 117, 179, 0.5)');
  });
});
