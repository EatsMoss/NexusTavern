/**
 * Pure color conversion helpers for the M3 ColorField molecule.
 * Zero DOM or feature dependencies.
 */

export const DEFAULT_M3_SWATCHES = [
  '#6575B3',
  '#6D6D83',
  '#4BA3E3',
  '#56B69E',
  '#8FD4A0',
  '#C9975B',
  '#D97B66',
  '#E06C96',
  '#A579D2',
  '#EDE3D2',
  '#C6C6D4',
  '#1A1A1F',
];

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

export function normalizeHex(input, fallback = '#6575B3') {
  if (typeof input !== 'string') return fallback;
  const cleaned = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const expanded = cleaned
      .split('')
      .map((ch) => ch + ch)
      .join('')
      .toUpperCase();
    return `#${expanded}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toUpperCase()}`;
  }
  return fallback;
}

export function isValidHexDraft(input) {
  if (typeof input !== 'string') return false;
  const cleaned = input.trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{3}$/.test(cleaned) || /^[0-9a-fA-F]{6}$/.test(cleaned);
}

export function hexToRgb(hex) {
  const safe = normalizeHex(hex, '#000000').slice(1);
  return {
    r: parseInt(safe.slice(0, 2), 16),
    g: parseInt(safe.slice(2, 4), 16),
    b: parseInt(safe.slice(4, 6), 16),
  };
}

export function rgbToHex(r, g, b) {
  const toHex = (n) => clamp(Math.round(Number(n) || 0), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function rgbToHsv(r, g, b) {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) {
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    } else if (max === gn) {
      h = ((bn - rn) / d + 2) * 60;
    } else {
      h = ((rn - gn) / d + 4) * 60;
    }
  }

  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return { h: clamp(h, 0, 360), s: clamp(s, 0, 100), v: clamp(v, 0, 100) };
}

export function hsvToRgb(h, s, v) {
  const hn = ((Number(h) % 360) + 360) % 360;
  const sn = clamp(Number(s), 0, 100) / 100;
  const vn = clamp(Number(v), 0, 100) / 100;

  const c = vn * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = vn - c;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hn < 60) {
    r1 = c;
    g1 = x;
  } else if (hn < 120) {
    r1 = x;
    g1 = c;
  } else if (hn < 180) {
    g1 = c;
    b1 = x;
  } else if (hn < 240) {
    g1 = x;
    b1 = c;
  } else if (hn < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

export function hexToHsv(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsv(r, g, b);
}

export function hsvToHex(h, s, v) {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

export function hexWithAlphaCss(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  const a = clamp(Number(alpha), 0, 1);
  if (a >= 0.999) return normalizeHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}
