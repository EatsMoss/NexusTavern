/**
 * Perceptual k-means Portrait Palette Extractor.
 * Samples colors from a character/scenario portrait image and derives a
 * harmonious Primary + Accent seed pair plus quick palette swatches.
 */

import { hslToHex, rgbToHsl } from './paletteEngine.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

let lastSampledUrl = '';
let lastVariantIdx = 0;

function hueDistance(h1, h2) {
  const diff = Math.abs(h1 - h2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function colorDistanceSq(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11 + (dr - dg) * (dr - dg) * 0.12;
}

function loadImageSamples(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 88;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const samples = [];
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 140) continue;
          samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
        }
        resolve(samples);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Failed to load portrait image for color sampling.'));
    img.src = url;
  });
}

export function extractColorClustersFromRgbSamples(samples = [], k = 7) {
  if (!samples.length) return [];
  const step = Math.max(1, Math.floor(samples.length / k));
  let centroids = [];
  for (let i = 0; i < k && i * step < samples.length; i += 1) {
    centroids.push({ ...samples[i * step] });
  }

  for (let iter = 0; iter < 9; iter += 1) {
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (let sIdx = 0; sIdx < samples.length; sIdx += 1) {
      const px = samples[sIdx];
      let best = 0;
      let bestDist = Infinity;
      for (let cIdx = 0; cIdx < centroids.length; cIdx += 1) {
        const d = colorDistanceSq(px, centroids[cIdx]);
        if (d < bestDist) {
          bestDist = d;
          best = cIdx;
        }
      }
      sums[best].r += px.r;
      sums[best].g += px.g;
      sums[best].b += px.b;
      sums[best].count += 1;
    }

    for (let cIdx = 0; cIdx < centroids.length; cIdx += 1) {
      if (sums[cIdx].count > 0) {
        centroids[cIdx] = {
          r: Math.round(sums[cIdx].r / sums[cIdx].count),
          g: Math.round(sums[cIdx].g / sums[cIdx].count),
          b: Math.round(sums[cIdx].b / sums[cIdx].count),
          weight: sums[cIdx].count / samples.length,
        };
      }
    }
  }

  return centroids
    .filter((c) => (c.weight || 0) > 0.015)
    .map((c) => {
      const hsl = rgbToHsl(c);
      return {
        ...c,
        ...hsl,
        hex: hslToHex(hsl.h, hsl.s, hsl.l),
      };
    })
    .sort((a, b) => (b.weight || 0) - (a.weight || 0));
}

export async function extractPaletteFromImageUrl(url, themeMode = 'dark') {
  if (!url) throw new Error('Select a scenario or character with a portrait first.');
  const samples = await loadImageSamples(url);
  const clusters = extractColorClustersFromRgbSamples(samples, 7);
  if (!clusters.length) throw new Error('Could not extract colors from the portrait.');

  if (lastSampledUrl === url) {
    lastVariantIdx = (lastVariantIdx + 1) % Math.max(1, Math.min(4, clusters.length));
  } else {
    lastSampledUrl = url;
    lastVariantIdx = 0;
  }

  const chromatic = [...clusters].sort(
    (a, b) => b.s * 0.8 + (b.weight || 0) * 45 - (a.s * 0.8 + (a.weight || 0) * 45),
  );
  const cAccent = chromatic[lastVariantIdx % chromatic.length] || clusters[0];
  const cSurface =
    clusters.find((c) => c !== cAccent && hueDistance(c.h, cAccent.h) >= 18) || clusters[0];

  const isLight = themeMode === 'light';
  const primarySat = cSurface.s < 4 ? 0 : clamp(cSurface.s * 0.42 + 6, 8, 28);
  const primaryLight = isLight
    ? clamp(76 + (cSurface.l - 50) * 0.24, 68, 88)
    : clamp(36 + (cSurface.l - 42) * 0.22, 26, 46);
  const primaryColor = hslToHex(cSurface.h, primarySat, primaryLight);

  const accentSat =
    cAccent.s < 5 ? clamp(cSurface.s * 0.5, 0, 24) : clamp(cAccent.s * 0.78 + 12, 26, 74);
  const accentLight = isLight
    ? clamp(cAccent.l, 34, 52)
    : clamp(Math.max(cAccent.l, 52), 48, 68);
  const accentColor = hslToHex(cAccent.h, accentSat, accentLight);

  return {
    colorScheme: 'two-color',
    primaryColor,
    accentColor,
    paletteOverrides: null,
    portraitPalette: {
      enabled: true,
      sourceUrl: url,
      variant: lastVariantIdx,
      swatches: clusters.slice(0, 6).map((c) => c.hex),
    },
  };
}
