/**
 * NexusTavern Palette Engine — Exact port of buildDerivedTavernPalette
 * Generates canonical --bb-* variables and maps them to M3 aliases.
 */

export const M3_PRESET_SEEDS = [
  {
    id: 'indigo-slate',
    name: 'Indigo Slate (#6D6D83 / #6575B3)',
    primaryHex: '#6D6D83',
    secondaryHex: '#6575B3',
    scheme: 'two-color',
  },
  {
    id: 'bronze-tome',
    name: 'Bronze Tome (#7D7162 / #C9975B)',
    primaryHex: '#7D7162',
    secondaryHex: '#C9975B',
    scheme: 'monochrome',
  },
  {
    id: 'ivory-grimoire',
    name: 'Ivory Grimoire (Light #EDE3D2 / #B08248)',
    primaryHex: '#EDE3D2',
    secondaryHex: '#B08248',
    scheme: 'two-color',
  },
  {
    id: 'rose-quartz',
    name: 'Rose Quartz (Light #F2DCE4 / #E06C96)',
    primaryHex: '#F2DCE4',
    secondaryHex: '#E06C96',
    scheme: 'two-color',
  },
  {
    id: 'astral-azure',
    name: 'Astral Azure (#4A5B78 / #4BA3E3)',
    primaryHex: '#4A5B78',
    secondaryHex: '#4BA3E3',
    scheme: 'two-color',
  },
];

export const M3_SURFACE_ROLES = [
  { token: '--bb-page-input-bg', label: '--bb-page-input-bg', usage: 'Inputs, search fields, subcards & recessed wells' },
  { token: '--bb-page-bg', label: '--bb-page-bg', usage: 'Tome page base surface' },
  { token: '--bb-page-card-bg', label: '--bb-page-card-bg', usage: 'NexusTavern cards (.bb-cust-card) & sections' },
  { token: '--bb-page-card-hover', label: '--bb-page-card-hover', usage: 'Hovered cards & folder bodies' },
  { token: '--bb-accent-surface-top', label: '--bb-accent-surface-top', usage: 'Soft muted active surface highlight' },
];

export const M3_SEMANTIC_ROLES = [
  { bg: '--bb-accent-surface-top', fg: '--bb-ink-heading', label: 'Active Accent Surface' },
  { bg: '--bb-page-card-bg', fg: '--bb-ink-main', label: 'Card Surface & Main Ink' },
  { bg: '--bb-page-input-bg', fg: '--bb-ink-muted', label: 'Input Surface & Muted Ink' },
  { bg: '--bb-danger-surface', fg: '--bb-danger-ink', label: 'Muted Danger Surface (B4)' },
];

export const M3_ELEVATION_LEVELS = [
  { level: 0, token: '--md-sys-elevation-0', surface: '--bb-page-input-bg', label: 'Flat', desc: 'No shadow — recessed wells and seated surfaces' },
  { level: 1, token: '--md-sys-elevation-1', surface: '--bb-page-card-bg', label: 'Card', desc: 'Resting cards and message bubbles' },
  { level: 2, token: '--md-sys-elevation-2', surface: '--bb-page-card-bg', label: 'Raised Card', desc: 'Hovered cards and floating badges' },
  { level: 3, token: '--md-sys-elevation-3', surface: '--bb-page-card-hover', label: 'Popover', desc: 'Dropdowns, kebab menus and tooltips' },
  { level: 4, token: '--md-sys-elevation-4', surface: '--bb-page-card-hover', label: 'Dragging', desc: 'Dragged tiles and sliding nodes' },
  { level: 5, token: '--md-sys-elevation-5', surface: '--bb-page-card-hover', label: 'Modal', desc: 'Modals and full-screen overlays' },
];

export const M3_SHAPES = [
  { id: 'xs', token: '--md-sys-shape-corner-xs', radius: '6px', usage: 'Badges and small chips' },
  { id: 'control', token: '--bb-control-radius', radius: '8px', usage: 'Buttons, inputs, cards and tiles' },
  { id: 'search', token: '--bb-search-radius', radius: '9999px', usage: 'Search fields, pills and circles' },
  { id: 'sm', token: '--md-sys-shape-corner-sm', radius: '11px', usage: 'Compact containers' },
  { id: 'md', token: '--md-sys-shape-corner-md', radius: '16px', usage: 'Shelves and grouped panels' },
  { id: 'lg', token: '--md-sys-shape-corner-lg', radius: '20px', usage: 'Tomes, drawers and modals' },
];

export const M3_SPACING_STEPS = [
  { name: '--bb-space-1', px: 4 },
  { name: '--bb-space-2', px: 8 },
  { name: '--bb-space-3', px: 12 },
  { name: '--bb-space-4', px: 16 },
  { name: '--bb-space-5', px: 20 },
  { name: '--bb-space-6', px: 24 },
];



export function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '').trim();
  if (clean.length !== 6) return { r: 220, g: 180, b: 130 };
  const num = parseInt(clean, 16);
  if (Number.isNaN(num)) return { r: 220, g: 180, b: 130 };
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToHex(h, s, l) {
  const hn = ((h % 360) + 360) % 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;
  let r;
  let g;
  let b;

  if (hn < 60) { r = c; g = x; b = 0; }
  else if (hn < 120) { r = x; g = c; b = 0; }
  else if (hn < 180) { r = 0; g = c; b = x; }
  else if (hn < 240) { r = 0; g = x; b = c; }
  else if (hn < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function hslToRgba(h, s, l, a = 1) {
  const hex = hslToHex(h, s, l);
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function applyM3ThemeTokens({
  themeMode = 'dark',
  seedHex = '#6D6D83',
  secondaryHex = '#6575B3',
  fontScale = 1,
  lowGpu = false,
} = {}) {
  const root = document.documentElement;
  const isLight = themeMode === 'light';
  root.setAttribute('data-theme', themeMode);
  root.setAttribute('data-bb-theme-mode', themeMode);
  root.setAttribute('data-gpu-mode', lowGpu ? 'low' : 'high');
  root.style.setProperty('--bb-font-scale', String(fontScale));

  const rawPHsl = rgbToHsl(hexToRgb(seedHex));
  const rawAHsl = rgbToHsl(hexToRgb(secondaryHex));

  let effectivePrimaryHex = seedHex;
  let effectiveAccentHex = secondaryHex;

  if (isLight) {
    if (rawPHsl.l < 75) {
      const lightS = rawPHsl.s < 2 ? 0 : clamp(rawPHsl.s * 0.62 + 4, 6, 26);
      const lightL = clamp(89.5 + (rawPHsl.l / 75) * 4, 88.5, 94);
      effectivePrimaryHex = hslToHex(rawPHsl.h, lightS, lightL);
    }
    if (rawAHsl.l > 50) {
      const lightAccS = rawAHsl.s < 3 ? 0 : clamp(rawAHsl.s * 0.80, 16, 54);
      const lightAccL = clamp(42 - (rawAHsl.l - 58) * 0.20, 34, 46);
      effectiveAccentHex = hslToHex(rawAHsl.h, lightAccS, lightAccL);
    }
  } else {
    if (rawPHsl.l > 58) {
      const darkS = rawPHsl.s < 2 ? 0 : clamp(rawPHsl.s * 0.65, 6, 28);
      const darkL = clamp(42 - (rawPHsl.l - 75) * 0.25, 32, 46);
      effectivePrimaryHex = hslToHex(rawPHsl.h, darkS, darkL);
    }
    if (rawAHsl.l < 50) {
      const darkAccS = rawAHsl.s < 3 ? 0 : clamp(rawAHsl.s * 1.08, 20, 66);
      const darkAccL = clamp(60 + (45 - rawAHsl.l) * 0.25, 54, 66);
      effectiveAccentHex = hslToHex(rawAHsl.h, darkAccS, darkAccL);
    }
  }

  const pHsl = rgbToHsl(hexToRgb(effectivePrimaryHex));
  const aHsl = rgbToHsl(hexToRgb(effectiveAccentHex));
  const h = pHsl.h;

  if (isLight) {
    const surfBaseL = pHsl.l >= 72
      ? clamp(89.5 + (pHsl.l - 72) * 0.26, 89.5, 96.8)
      : clamp(90.0 + (pHsl.l / 72) * 4.0, 89.5, 94.2);

    const lightSatFactor = pHsl.s < 2 ? 0 : clamp(Math.pow(clamp(pHsl.s, 2, 70) / 26, 0.62), 0.28, 1.22);
    const sLight = (baseSat, maxSat = 26) => (pHsl.s < 2 ? 0 : clamp(baseSat * lightSatFactor, 0, maxSat));

    const accH = aHsl.h;
    const accS = aHsl.s < 3 ? 0 : clamp(aHsl.s * 0.78, 16, 54);
    const accBaseL = aHsl.l > 50 ? clamp(42 - (aHsl.l - 58) * 0.22, 34, 46) : clamp(aHsl.l, 28, 46);

    const bgDeepL = clamp(surfBaseL, 87, 97);
    const bgMidL = clamp(surfBaseL - 2.6, 84, 95);
    const bgCardL = clamp(surfBaseL + 2.0, 89, 98.8);
    const mesBgL = clamp(surfBaseL + 2.4, 89.5, 99);

    const bgDeepHex = hslToHex(h, sLight(15, 22), bgDeepL);
    const bgMidHex = hslToHex(h, sLight(16, 24), bgMidL);
    const bgCardHex = hslToHex(h, sLight(13, 20), bgCardL);

    const pageBgRgba = hslToRgba(h, sLight(15, 22), bgDeepL, 0.92);
    const cardBgRgba = hslToRgba(h, sLight(13, 20), mesBgL, 0.88);
    const cardHoverRgba = hslToRgba(h, sLight(15, 22), clamp(surfBaseL - 1.5, 85, 96), 0.94);
    const inputBgRgba = hslToRgba(h, sLight(11, 18), clamp(surfBaseL + 3.0, 90, 99.5), 0.94);
    const inputHoverRgba = hslToRgba(h, sLight(13, 20), bgDeepL, 0.96);
    const inputFocusRgba = hslToRgba(h, sLight(11, 18), clamp(surfBaseL + 4.0, 91, 99.5), 0.98);

    const borderBaseL = clamp(surfBaseL - 24, 62, 74);
    const borderSat = sLight(20, 30);
    const borderBaseHex = hslToHex(h, borderSat, borderBaseL);
    const borderSoftRgba = hslToRgba(h, borderSat, clamp(borderBaseL - 6, 54, 68), 0.28);
    const borderMidRgba = hslToRgba(h, borderSat, clamp(borderBaseL - 8, 52, 66), 0.44);

    const inkMainHex = hslToHex(h, sLight(22, 32), 20);
    const inkHeadingHex = hslToHex(h, sLight(26, 36), 13);
    const inkMutedHex = hslToHex(h, sLight(16, 26), 43);

    const accentHex = hslToHex(accH, accS, accBaseL);
    const accentBrightHex = hslToHex(accH, clamp(accS * 1.05, 0, 58), clamp(accBaseL - 8, 22, 40));
    const accentSoftHex = hslToHex(accH, clamp(accS * 0.75, 0, 46), clamp(accBaseL + 14, 44, 64));
    const accentSurfaceTop = hslToHex(accH, clamp(accS * 0.36, 0, 28), clamp(surfBaseL - 4.5, 82, 92));
    const accentSurfaceBot = hslToHex(accH, clamp(accS * 0.44, 0, 32), clamp(surfBaseL - 10.5, 76, 86));
    const accentBorderHex = hslToHex(accH, clamp(accS * 0.65, 0, 46), clamp(accBaseL + 12, 44, 66));

    const btnTopHex = hslToHex(h, sLight(13, 20), clamp(surfBaseL + 1.2, 88, 98.5));
    const btnHoverTopHex = hslToHex(accH, clamp(accS * 0.30, 0, 24), clamp(surfBaseL - 1.5, 86, 96));

    const vars = {
      '--bb-page-bg': pageBgRgba,
      '--bb-page-card-bg': cardBgRgba,
      '--bb-page-card-hover': cardHoverRgba,
      '--bb-page-input-bg': inputBgRgba,
      '--bb-page-input-hover': inputHoverRgba,
      '--bb-page-input-focus': inputFocusRgba,
      '--bb-page-border': borderSoftRgba,
      '--bb-page-border-mid': borderMidRgba,
      '--bb-page-border-strong': borderBaseHex,
      '--bb-ink-main': inkMainHex,
      '--bb-ink-muted': inkMutedHex,
      '--bb-ink-heading': inkHeadingHex,
      '--bb-ink-hover': inkHeadingHex,
      '--bb-ink-accent': accentHex,
      '--bb-accent-color': accentHex,
      '--bb-accent-bright': accentBrightHex,
      '--bb-accent-soft': accentSoftHex,
      '--bb-accent-border': accentBorderHex,
      '--bb-accent-surface-top': accentSurfaceTop,
      '--bb-accent-surface-bot': accentSurfaceBot,
      '--bb-accent-surface-grad': `linear-gradient(180deg, ${accentSurfaceTop} 0%, ${accentSurfaceBot} 100%)`,
      '--bb-btn-flat-bg': btnTopHex,
      '--bb-btn-flat-hover-bg': btnHoverTopHex,
      '--bb-btn-soft-bg': accentSurfaceTop,
      '--bb-btn-soft-hover-bg': accentSurfaceBot,
      '--bb-btn-border': borderMidRgba,
      '--bb-btn-hover-border': accentBorderHex,
      '--bb-danger-bg': 'linear-gradient(180deg, #f7e4e2 0%, #edd1ce 100%)',
      '--bb-danger-hover-bg': 'linear-gradient(180deg, #f2d5d1 0%, #e5bcb7 100%)',
      '--bb-danger-border': 'rgba(185, 86, 76, 0.42)',
      '--bb-danger-hover-border': '#b84a3e',
      '--bb-danger-ink': '#6e221a',
      '--bb-danger-surface': '#f3dcd9',
      '--md-sys-color-background': bgDeepHex,
      '--md-sys-color-on-background': inkHeadingHex,
      '--md-sys-color-surface': bgMidHex,
      '--bb-sheet-bg': bgCardHex,
      '--bb-sheet-header-bg': bgDeepHex,
      '--bb-sheet-well-bg': hslToHex(h, sLight(11, 18), clamp(surfBaseL - 1.2, 86, 95)),
      '--bb-sheet-item-hover': btnHoverTopHex,
      '--bb-sheet-item-selected': accentSurfaceTop,
      '--md-sys-color-surface-container-lowest': inputBgRgba,
      '--md-sys-color-surface-container-low': pageBgRgba,
      '--md-sys-color-surface-container': cardBgRgba,
      '--md-sys-color-surface-container-high': cardHoverRgba,
      '--md-sys-color-surface-container-highest': accentSurfaceTop,
      '--md-sys-color-on-surface': inkHeadingHex,
      '--md-sys-color-on-surface-variant': inkMainHex,
      '--md-sys-color-on-surface-muted': inkMutedHex,
      '--md-sys-color-primary': accentHex,
      '--md-sys-color-on-primary': '#ffffff',
      '--md-sys-color-primary-container': accentSurfaceTop,
      '--md-sys-color-on-primary-container': inkHeadingHex,
      '--md-sys-color-surface-container-low-user': hslToRgba(h, sLight(13, 20), clamp(surfBaseL + 3.4, 90, 99.5), 0.92),
      '--md-sys-color-outline': borderBaseHex,
      '--md-sys-color-outline-variant': borderSoftRgba,
      '--bb-shader-base': bgCardHex,
      '--bb-shader-pearl-a': accentSoftHex,
      '--bb-shader-pearl-b': accentSurfaceTop,
      '--bb-shader-pearl-c': hslToHex(accH, clamp(accS * 0.45, 10, 32), 82),
      '--bb-shader-vignette': bgCardHex,
      '--bb-scrollbar-thumb': hslToRgba(h, sLight(8, 14), clamp(surfBaseL - 44, 38, 52), 0.28),
      '--bb-scrollbar-thumb-hover': hslToRgba(h, sLight(10, 16), clamp(surfBaseL - 56, 28, 42), 0.48),
    };

    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    return;
  }

  // Dark Mode Formula — Ashen Slate base.
  // The base lightness is lifted off pure ink so dark surfaces read as muted
  // graphite rather than black, and saturation grows more gently so the tint
  // stays restrained. Secondary surfaces keep a fixed +4..+12 offset instead of
  // a multiplicative ramp, so dark wells can never collapse back to black.
  const sRatio = pHsl.s < 1.5 ? 0 : Math.pow(clamp(pHsl.s, 1.5, 75) / 24, 0.62);
  const sScaled = (baseSat, maxSat = 18) => (pHsl.s < 1.5 ? 0 : clamp(baseSat * sRatio, 0, maxSat));
  const effectiveDarkPrimaryL = pHsl.l > 58 ? clamp(38 - (pHsl.l - 82) * 0.25, 28, 44) : pHsl.l;
  const lShift = effectiveDarkPrimaryL - 43.7;
  const darkBaseL = effectiveDarkPrimaryL <= 44
    ? clamp(6 + (effectiveDarkPrimaryL / 43.7) * 0.9, 6, 7)
    : clamp(7 + (effectiveDarkPrimaryL - 43.7) * 0.55, 7, 16);

  const accH = aHsl.h;
  const accS = clamp(aHsl.s, 0, 84);
  const accBaseL = aHsl.l < 48 ? clamp(58 + (48 - aHsl.l) * 0.25, 54, 68) : clamp(aHsl.l, 48, 82);

  const bgDeepL = clamp(darkBaseL, 0, 56);
  const bgMidL = clamp(darkBaseL + 2, 2, 60);
  const bgCardL = clamp(darkBaseL + 4, 3.5, 63);

  const bgDeepHex = hslToHex(h, sScaled(13, 16), bgDeepL);
  const bgMidHex = hslToHex(h, sScaled(13, 17), bgMidL);
  const bgCardHex = hslToHex(h, sScaled(13, 17), bgCardL);

  const pageBgRgba = hslToRgba(h, sScaled(13, 16), bgDeepL, 0.90);
  const cardBgRgba = hslToRgba(h, sScaled(13, 17), bgCardL, 0.84);
  const cardHoverRgba = hslToRgba(h, sScaled(14, 19), clamp(darkBaseL + 8, 10, 66), 0.90);
  const inputBgRgba = hslToRgba(h, sScaled(12, 15), clamp(darkBaseL + 1.5, 6, 52), 0.86);
  const inputHoverRgba = hslToRgba(h, sScaled(14, 17), clamp(darkBaseL + 8.5, 10, 62), 0.90);
  const inputFocusRgba = hslToRgba(h, sScaled(15, 19), clamp(darkBaseL + 10.5, 12, 65), 0.94);

  const borderBaseL = clamp(Math.max(44 + lShift * 0.65, darkBaseL + 18), 30, 78);
  const borderSat = clamp(pHsl.s, 0, 40);
  const borderBaseHex = hslToHex(h, borderSat, borderBaseL);
  const borderSoftRgba = hslToRgba(h, borderSat, borderBaseL, 0.25);
  const borderMidRgba = hslToRgba(h, borderSat, borderBaseL, 0.35);

  const inkMainHex = hslToHex(h, sScaled(19, 42), clamp(82 + lShift * 0.15, 74, 97));
  const inkHeadingHex = hslToHex(h, sScaled(26, 48), clamp(91 + lShift * 0.12, 85, 99.5));
  const inkMutedHex = borderBaseHex;

  const accentHex = hslToHex(accH, accS, accBaseL);
  const accentBrightHex = hslToHex(accH, clamp(accS * 1.05, 0, 96), clamp(accBaseL + 16, 58, 96));
  const accentSoftHex = hslToHex(accH, clamp(accS * 0.85, 0, 82), clamp(accBaseL - 10, 22, 74));

  const accentSurfaceTop = hslToHex(accH, clamp(accS * 0.58, 0, 68), clamp(Math.max(accBaseL * 0.46, darkBaseL + 10), 10, 66));
  const accentSurfaceBot = hslToHex(accH, clamp(accS * 0.50, 0, 60), clamp(Math.max(accBaseL * 0.31, darkBaseL + 4), 5, 58));
  const accentBorderHex = hslToHex(accH, clamp(accS * 0.85, 0, 88), clamp(accBaseL + 4, 34, 84));

  // User bubbles: one step above the recessed wells, one below regular cards
  const userSurfaceRgba = hslToRgba(h, sScaled(13, 16), clamp(darkBaseL + 3, 9, 52), 0.88);
  // Flat tonal button surfaces (M3: solid container, no gradient)
  const btnFlatHex = hslToHex(h, sScaled(13, 16), clamp(darkBaseL + 13, 12, 65));
  const btnFlatHoverHex = hslToHex(accH, clamp(accS * 0.30, 0, 32), clamp(darkBaseL + 19, 17, 70));

  const vars = {
    '--bb-page-bg': pageBgRgba,
    '--bb-page-card-bg': cardBgRgba,
    '--bb-page-card-hover': cardHoverRgba,
    '--bb-page-input-bg': inputBgRgba,
    '--bb-page-input-hover': inputHoverRgba,
    '--bb-page-input-focus': inputFocusRgba,
    '--bb-page-border': borderSoftRgba,
    '--bb-page-border-mid': borderMidRgba,
    '--bb-page-border-strong': borderBaseHex,
    '--bb-ink-main': inkMainHex,
    '--bb-ink-muted': inkMutedHex,
    '--bb-ink-heading': inkHeadingHex,
    '--bb-ink-hover': inkHeadingHex,
    '--bb-ink-accent': accentHex,
    '--bb-accent-color': accentHex,
    '--bb-accent-bright': accentBrightHex,
    '--bb-accent-soft': accentSoftHex,
    '--bb-accent-border': accentBorderHex,
    '--bb-accent-surface-top': accentSurfaceTop,
    '--bb-accent-surface-bot': accentSurfaceBot,
    '--bb-accent-surface-grad': `linear-gradient(180deg, ${accentSurfaceTop} 0%, ${accentSurfaceBot} 100%)`,
    '--bb-btn-flat-bg': btnFlatHex,
    '--bb-btn-flat-hover-bg': btnFlatHoverHex,
    '--bb-btn-soft-bg': accentSurfaceTop,
    '--bb-btn-soft-hover-bg': accentSurfaceBot,
    '--bb-btn-border': borderMidRgba,
    '--bb-btn-hover-border': accentBorderHex,
    '--bb-danger-bg': 'linear-gradient(180deg, #3d2f2c 0%, #342825 100%)',
    '--bb-danger-hover-bg': 'linear-gradient(180deg, #4a3935 0%, #3f2f2b 100%)',
    '--bb-danger-border': 'rgba(176, 122, 112, 0.45)',
    '--bb-danger-hover-border': '#ab7a70',
    '--bb-danger-ink': '#ebd9d4',
    '--bb-danger-surface': '#3a2b28',
    '--md-sys-color-background': bgDeepHex,
    '--md-sys-color-on-background': inkHeadingHex,
    '--md-sys-color-surface': bgMidHex,
    '--bb-sheet-bg': hslToHex(h, sScaled(14, 18), clamp(darkBaseL + 6, 11, 64)),
    '--bb-sheet-header-bg': hslToHex(h, sScaled(13, 17), clamp(darkBaseL + 3.5, 8.5, 60)),
    '--bb-sheet-well-bg': hslToHex(h, sScaled(12, 16), clamp(darkBaseL + 1.5, 6.5, 56)),
    '--bb-sheet-item-hover': hslToHex(h, sScaled(15, 20), clamp(darkBaseL + 11, 16, 68)),
    '--bb-sheet-item-selected': accentSurfaceTop,
    '--md-sys-color-surface-container-lowest': inputBgRgba,
    '--md-sys-color-surface-container-low': pageBgRgba,
    '--md-sys-color-surface-container': cardBgRgba,
    '--md-sys-color-surface-container-high': cardHoverRgba,
    '--md-sys-color-surface-container-highest': accentSurfaceTop,
    '--md-sys-color-on-surface': inkHeadingHex,
    '--md-sys-color-on-surface-variant': inkMainHex,
    '--md-sys-color-on-surface-muted': inkMutedHex,
    '--md-sys-color-primary': accentHex,
    '--md-sys-color-on-primary': inkHeadingHex,
    '--md-sys-color-primary-container': accentSurfaceTop,
    '--md-sys-color-on-primary-container': inkHeadingHex,
    '--md-sys-color-surface-container-low-user': userSurfaceRgba,
    '--md-sys-color-outline': borderBaseHex,
    '--md-sys-color-outline-variant': borderSoftRgba,
    '--bb-shader-base': bgMidHex,
    '--bb-shader-pearl-a': accentSoftHex,
    '--bb-shader-pearl-b': borderBaseHex,
    '--bb-shader-pearl-c': accentSurfaceTop,
    '--bb-shader-vignette': bgCardHex,
    '--bb-scrollbar-thumb': hslToRgba(h, sScaled(8, 11), clamp(darkBaseL + 15, 19, 34), 0.72),
    '--bb-scrollbar-thumb-hover': hslToRgba(h, sScaled(9, 12), clamp(darkBaseL + 23, 27, 44), 0.86),
  };

  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
}

