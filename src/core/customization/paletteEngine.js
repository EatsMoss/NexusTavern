/**
 * NexusTavern Automatic Palette Engine.
 *
 * Preserves the exact default NexusTavern `Indigo Slate` M3 token hierarchy while
 * supporting BookboundUI's Monochrome / Two-Color automatic harmonic derivation,
 * smart Dark <-> Light contrast adaptation, 7-slot manual overrides, and automatic
 * 8-slot RP chat typography derivation (`chatTextPalette`).
 */

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function normalizeHexColor(input, fallback = '#6575B3') {
  if (typeof input !== 'string') return fallback;
  const clean = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return `#${clean
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `#${clean.toUpperCase()}`;
  }
  return fallback;
}

export function hexToRgb(hex) {
  const clean = normalizeHexColor(hex, '#6575B3').slice(1);
  const num = parseInt(clean, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function hexToRgba(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Number(clamp(Number(alpha), 0, 1).toFixed(3))})`;
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
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hn < 60) { r = c; g = x; }
  else if (hn < 120) { r = x; g = c; }
  else if (hn < 180) { g = c; b = x; }
  else if (hn < 240) { g = x; b = c; }
  else if (hn < 300) { r = x; b = c; }
  else { r = c; b = x; }

  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function hslToRgba(h, s, l, a = 1) {
  return hexToRgba(hslToHex(h, s, l), a);
}

export function buildDerivedTavernPalette({
  themeMode = 'dark',
  colorScheme = 'two-color',
  primaryColor = '#6D6D83',
  accentColor = '#6575B3',
  paletteOverrides = null,
} = {}) {
  const isLight = themeMode === 'light';
  const isTwoColor = colorScheme === 'two-color';
  const seedHex = normalizeHexColor(primaryColor, '#6D6D83');
  const secondaryHex = normalizeHexColor(accentColor, '#6575B3');

  const rawPHsl = rgbToHsl(hexToRgb(seedHex));
  const rawAHsl = rgbToHsl(hexToRgb(secondaryHex));

  let effectivePrimaryHex = seedHex;
  let effectiveAccentHex = isTwoColor ? secondaryHex : seedHex;

  if (isLight) {
    if (rawPHsl.l < 75) {
      const lightS = rawPHsl.s < 2 ? 0 : clamp(rawPHsl.s * 0.62 + 4, 6, 26);
      const lightL = clamp(89.5 + (rawPHsl.l / 75) * 4, 88.5, 94);
      effectivePrimaryHex = hslToHex(rawPHsl.h, lightS, lightL);
    }
    if (isTwoColor) {
      if (rawAHsl.l > 50) {
        const lightAccS = rawAHsl.s < 3 ? 0 : clamp(rawAHsl.s * 0.8, 16, 54);
        const lightAccL = clamp(42 - (rawAHsl.l - 58) * 0.2, 34, 46);
        effectiveAccentHex = hslToHex(rawAHsl.h, lightAccS, lightAccL);
      }
    } else {
      const monoS = rawPHsl.s < 2 ? 0 : clamp(rawPHsl.s * 0.85 + 8, 14, 42);
      effectiveAccentHex = hslToHex(rawPHsl.h, monoS, 38);
    }
  } else {
    if (rawPHsl.l > 58) {
      const darkS = rawPHsl.s < 2 ? 0 : clamp(rawPHsl.s * 0.72 + 4, 8, 38);
      const darkL = clamp(38 - (rawPHsl.l - 82) * 0.25, 28, 44);
      effectivePrimaryHex = hslToHex(rawPHsl.h, darkS, darkL);
    }
    if (isTwoColor) {
      if (rawAHsl.l < 48) {
        const darkAccS = rawAHsl.s < 3 ? 0 : clamp(rawAHsl.s * 0.9, 22, 82);
        const darkAccL = clamp(58 + (48 - rawAHsl.l) * 0.25, 54, 68);
        effectiveAccentHex = hslToHex(rawAHsl.h, darkAccS, darkAccL);
      }
    } else {
      const monoS = rawPHsl.s < 2 ? 0 : clamp(rawPHsl.s * 0.85 + 6, 12, 46);
      effectiveAccentHex = hslToHex(rawPHsl.h, monoS, 64);
    }
  }

  const pHsl = rgbToHsl(hexToRgb(effectivePrimaryHex));
  const aHsl = rgbToHsl(hexToRgb(effectiveAccentHex));
  const h = pHsl.h;
  const ov = paletteOverrides && typeof paletteOverrides === 'object' ? paletteOverrides : {};

  if (isLight) {
    const sLight = (baseSat, maxSat = 32) =>
      pHsl.s < 2 ? 0 : clamp((pHsl.s / 28) * baseSat, 2, maxSat);
    const surfBaseL = pHsl.l < 75 ? 91.5 : clamp(pHsl.l, 78, 96);

    const accH = isTwoColor ? aHsl.h : h;
    const accS = isTwoColor ? clamp(aHsl.s, 0, 56) : sLight(24, 38);
    const accBaseL = isTwoColor
      ? aHsl.l > 52
        ? clamp(42 - (aHsl.l - 58) * 0.2, 34, 46)
        : clamp(aHsl.l, 28, 52)
      : 38;

    const bgDeepHex = normalizeHexColor(ov.bgDeepHex, hslToHex(h, sLight(16, 24), clamp(surfBaseL + 4, 92, 98.5)));
    const bgMidHex = normalizeHexColor(ov.bgMidHex, hslToHex(h, sLight(15, 22), surfBaseL));
    const bgCardHex = normalizeHexColor(ov.bgCardHex, hslToHex(h, sLight(14, 20), clamp(surfBaseL + 2.5, 89, 97.5)));
    const borderBaseHex = normalizeHexColor(ov.borderBaseHex, hslToHex(h, sLight(20, 30), clamp(surfBaseL - 28, 52, 68)));
    const inkMainHex = normalizeHexColor(ov.inkMainHex, hslToHex(h, sLight(22, 32), 20));
    const inkHeadingHex = hslToHex(h, sLight(26, 36), 13);
    const inkMutedHex = hslToHex(h, sLight(16, 26), 43);

    const accentHex = normalizeHexColor(ov.accentHex, hslToHex(accH, accS, accBaseL));
    const accentBrightHex = hslToHex(accH, clamp(accS * 1.05, 0, 58), clamp(accBaseL - 8, 22, 40));
    const accentSoftHex = hslToHex(accH, clamp(accS * 0.75, 0, 46), clamp(accBaseL + 14, 44, 64));
    const accentBorderHex = normalizeHexColor(
      ov.accentBorderHex,
      isTwoColor ? hslToHex(accH, clamp(accS * 0.65, 0, 46), clamp(accBaseL + 12, 44, 66)) : borderBaseHex,
    );

    const accentSurfaceTop = hslToHex(
      accH,
      isTwoColor ? clamp(accS * 0.36, 0, 28) : sLight(16, 24),
      clamp(surfBaseL - 4.5, 82, 92),
    );
    const accentSurfaceBot = hslToHex(
      accH,
      isTwoColor ? clamp(accS * 0.44, 0, 32) : sLight(18, 28),
      clamp(surfBaseL - 10.5, 76, 86),
    );

    const pageBgRgba = hexToRgba(bgMidHex, 0.94);
    const cardBgRgba = hexToRgba(bgCardHex, 0.92);
    const cardHoverRgba = hslToRgba(h, sLight(16, 24), clamp(surfBaseL - 2.5, 84, 93), 0.96);
    const inputBgRgba = hslToRgba(h, sLight(12, 18), clamp(surfBaseL + 5.5, 94, 99.2), 0.94);
    const inputHoverRgba = hslToRgba(h, sLight(13, 20), clamp(surfBaseL + 3.5, 92, 98.5), 0.97);
    const inputFocusRgba = hslToRgba(h, sLight(10, 16), clamp(surfBaseL + 6.5, 96, 99.8), 0.99);
    const borderSoftRgba = hexToRgba(borderBaseHex, 0.34);
    const borderMidRgba = hexToRgba(borderBaseHex, 0.48);
    const codeBgHex = hslToHex(h, sLight(14, 22), clamp(surfBaseL - 3.5, 83, 94));

    const chatTextPalette = {
      text: inkMainHex,
      quote: isTwoColor
        ? hslToHex(accH, clamp(accS * 0.8, 0, 54), clamp(accBaseL - 2, 26, 42))
        : hslToHex(h, sLight(24, 36), 28),
      apostrophe: hslToHex(h, sLight(16, 28), 42),
      italic: isTwoColor
        ? hslToHex(accH, clamp(accS * 0.72, 0, 48), clamp(accBaseL - 4, 24, 38))
        : hslToHex(h, sLight(20, 30), 30),
      bold: hslToHex(h, sLight(26, 36), 12),
      code: { text: accentBrightHex, bg: codeBgHex, bgAlpha: 0.75 },
      codeBlock: { text: inkMainHex, bg: codeBgHex, bgAlpha: 1 },
      details: { text: inkMainHex, bg: bgMidHex, bgAlpha: 0.92 },
    };

    return {
      themeMode: 'light',
      slots: { bgDeepHex, bgMidHex, bgCardHex, borderBaseHex, accentHex, accentBorderHex, inkMainHex },
      chatTextPalette,
      vars: {
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
        '--bb-btn-flat-bg': hslToHex(h, sLight(14, 20), clamp(surfBaseL - 3, 85, 94)),
        '--bb-btn-flat-hover-bg': hslToHex(accH, clamp(accS * 0.3, 0, 24), clamp(surfBaseL - 6.5, 81, 91)),
        '--bb-btn-soft-bg': accentSurfaceTop,
        '--bb-btn-soft-hover-bg': accentSurfaceBot,
        '--bb-btn-border': borderMidRgba,
        '--bb-btn-hover-border': accentBorderHex,
        '--bb-danger-bg': 'linear-gradient(180deg, #f3dcda 0%, #e9c9c6 100%)',
        '--bb-danger-hover-bg': 'linear-gradient(180deg, #eecbc8 0%, #e1b8b4 100%)',
        '--bb-danger-border': 'rgba(176, 86, 78, 0.45)',
        '--bb-danger-hover-border': '#b5564e',
        '--bb-danger-ink': '#6b201a',
        '--bb-danger-surface': '#f6e1df',
        '--md-sys-color-background': bgDeepHex,
        '--md-sys-color-on-background': inkHeadingHex,
        '--md-sys-color-surface': bgMidHex,
        '--bb-sheet-bg': hslToHex(h, sLight(12, 18), clamp(surfBaseL + 4, 93, 98.5)),
        '--bb-sheet-header-bg': hslToHex(h, sLight(13, 19), clamp(surfBaseL + 1.5, 90, 96.5)),
        '--bb-sheet-well-bg': hslToHex(h, sLight(11, 16), clamp(surfBaseL + 6, 95, 99.5)),
        '--bb-sheet-item-hover': hslToHex(h, sLight(15, 22), clamp(surfBaseL - 2, 86, 93.5)),
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
        '--md-sys-color-surface-container-low-user': hslToRgba(h, sLight(13, 18), clamp(surfBaseL + 1, 89, 96), 0.93),
        '--md-sys-color-outline': borderBaseHex,
        '--md-sys-color-outline-variant': borderSoftRgba,
        '--bb-shader-base': bgMidHex,
        '--bb-shader-pearl-a': accentSoftHex,
        '--bb-shader-pearl-b': borderBaseHex,
        '--bb-shader-pearl-c': accentSurfaceTop,
        '--bb-shader-vignette': bgCardHex,
        '--bb-scrollbar-thumb': hslToRgba(h, sLight(8, 14), clamp(surfBaseL - 44, 38, 52), 0.28),
        '--bb-scrollbar-thumb-hover': hslToRgba(h, sLight(10, 16), clamp(surfBaseL - 56, 28, 42), 0.48),
      },
    };
  }

  // Dark Mode Formula — Ashen Slate base (matches exact NexusTavern Indigo Slate defaults)
  const sRatio = pHsl.s < 1.5 ? 0 : Math.pow(clamp(pHsl.s, 1.5, 75) / 24, 0.62);
  const sScaled = (baseSat, maxSat = 18) =>
    pHsl.s < 1.5 ? 0 : clamp(baseSat * sRatio, 0, maxSat);
  const effectiveDarkPrimaryL = pHsl.l > 58 ? clamp(38 - (pHsl.l - 82) * 0.25, 28, 44) : pHsl.l;
  const lShift = effectiveDarkPrimaryL - 43.7;
  const darkBaseL =
    effectiveDarkPrimaryL <= 44
      ? clamp(6 + (effectiveDarkPrimaryL / 43.7) * 0.9, 6, 7)
      : clamp(7 + (effectiveDarkPrimaryL - 43.7) * 0.55, 7, 16);

  const accH = isTwoColor ? aHsl.h : h;
  const accS = isTwoColor ? clamp(aHsl.s, 0, 84) : sScaled(18, 48);
  const accBaseL = isTwoColor
    ? aHsl.l < 48
      ? clamp(58 + (48 - aHsl.l) * 0.25, 54, 68)
      : clamp(aHsl.l, 48, 82)
    : clamp(Math.max(61 + lShift * 0.45, darkBaseL + 26), 48, 84);

  const bgDeepL = clamp(darkBaseL, 0, 56);
  const bgMidL = clamp(darkBaseL + 2, 2, 60);
  const bgCardL = clamp(darkBaseL + 4, 3.5, 63);

  const bgDeepHex = normalizeHexColor(ov.bgDeepHex, hslToHex(h, sScaled(13, 16), bgDeepL));
  const bgMidHex = normalizeHexColor(ov.bgMidHex, hslToHex(h, sScaled(13, 17), bgMidL));
  const bgCardHex = normalizeHexColor(ov.bgCardHex, hslToHex(h, sScaled(13, 17), bgCardL));

  const borderBaseL = clamp(Math.max(44 + lShift * 0.65, darkBaseL + 18), 30, 78);
  const borderSat = clamp(pHsl.s, 0, 40);
  const borderBaseHex = normalizeHexColor(ov.borderBaseHex, hslToHex(h, borderSat, borderBaseL));
  const borderSoftRgba = hexToRgba(borderBaseHex, 0.25);
  const borderMidRgba = hexToRgba(borderBaseHex, 0.35);

  const lightTextBoost = darkBaseL > 18 ? (darkBaseL - 18) * 0.42 : 0;
  const inkMainHex = normalizeHexColor(
    ov.inkMainHex,
    hslToHex(h, sScaled(19, 42), clamp(82 + lShift * 0.15 + lightTextBoost, 74, 97)),
  );
  const inkHeadingHex = hslToHex(
    h,
    sScaled(26, 48),
    clamp(91 + lShift * 0.12 + lightTextBoost * 0.6, 85, 99.5),
  );
  const inkMutedHex = borderBaseHex;

  const accentHex = normalizeHexColor(ov.accentHex, hslToHex(accH, accS, accBaseL));
  const accentBrightHex = hslToHex(accH, clamp(accS * 1.05, 0, 96), clamp(accBaseL + 16, 58, 96));
  const accentSoftHex = hslToHex(accH, clamp(accS * 0.85, 0, 82), clamp(accBaseL - 10, 22, 74));
  const accentBorderHex = normalizeHexColor(
    ov.accentBorderHex,
    isTwoColor
      ? hslToHex(accH, clamp(accS * 0.85, 0, 88), clamp(accBaseL + 4, 34, 84))
      : borderBaseHex,
  );

  const accentSurfaceTop = hslToHex(
    accH,
    isTwoColor ? clamp(accS * 0.58, 0, 68) : sScaled(15, 52),
    isTwoColor ? clamp(Math.max(accBaseL * 0.46, darkBaseL + 10), 10, 66) : clamp(darkBaseL + 15, 8, 66),
  );
  const accentSurfaceBot = hslToHex(
    accH,
    isTwoColor ? clamp(accS * 0.5, 0, 60) : sScaled(15, 48),
    isTwoColor ? clamp(Math.max(accBaseL * 0.31, darkBaseL + 4), 5, 58) : clamp(darkBaseL + 8, 4, 58),
  );

  const pageBgRgba = hexToRgba(bgDeepHex, 0.9);
  const cardBgRgba = hexToRgba(bgCardHex, 0.84);
  const cardHoverRgba = hslToRgba(h, sScaled(14, 19), clamp(darkBaseL + 8, 10, 66), 0.9);
  const inputBgRgba = hslToRgba(h, sScaled(12, 15), clamp(darkBaseL + 1.5, 6, 52), 0.86);
  const inputHoverRgba = hslToRgba(h, sScaled(14, 17), clamp(darkBaseL + 8.5, 10, 62), 0.9);
  const inputFocusRgba = hslToRgba(h, sScaled(15, 19), clamp(darkBaseL + 10.5, 12, 65), 0.94);

  const codeBgHex = hslToHex(h, sScaled(12, 18), clamp(darkBaseL + 0.5, 5, 48));
  const chatTextPalette = {
    text: inkMainHex,
    quote: isTwoColor
      ? hslToHex(accH, clamp(accS * 0.72, 0, 84), clamp(84 + lightTextBoost * 0.45, 74, 96))
      : hslToHex(h, sScaled(16, 40), clamp(84 + lShift * 0.18, 72, 96)),
    apostrophe: hslToHex(h, sScaled(14, 34), clamp(58 + lShift * 0.25 + lightTextBoost * 0.5, 48, 78)),
    italic: isTwoColor
      ? hslToHex(accH, clamp(accS * 0.55, 0, 68), clamp(77 + lightTextBoost * 0.5, 66, 93))
      : inkMainHex,
    bold: inkHeadingHex,
    code: { text: accentBrightHex, bg: codeBgHex, bgAlpha: 0.75 },
    codeBlock: { text: inkMainHex, bg: codeBgHex, bgAlpha: 1 },
    details: { text: inkMainHex, bg: bgMidHex, bgAlpha: 0.88 },
  };

  const btnFlatHex = hslToHex(h, sScaled(13, 16), clamp(darkBaseL + 13, 12, 65));
  const btnFlatHoverHex = hslToHex(accH, clamp(accS * 0.3, 0, 32), clamp(darkBaseL + 19, 17, 70));

  return {
    themeMode: 'dark',
    slots: { bgDeepHex, bgMidHex, bgCardHex, borderBaseHex, accentHex, accentBorderHex, inkMainHex },
    chatTextPalette,
    vars: {
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
      '--md-sys-color-surface-container-low-user': hslToRgba(h, sScaled(13, 16), clamp(darkBaseL + 3, 9, 52), 0.88),
      '--md-sys-color-outline': borderBaseHex,
      '--md-sys-color-outline-variant': borderSoftRgba,
      '--bb-shader-base': bgMidHex,
      '--bb-shader-pearl-a': accentSoftHex,
      '--bb-shader-pearl-b': borderBaseHex,
      '--bb-shader-pearl-c': accentSurfaceTop,
      '--bb-shader-vignette': bgCardHex,
      '--bb-scrollbar-thumb': hslToRgba(h, sScaled(8, 11), clamp(darkBaseL + 15, 19, 34), 0.72),
      '--bb-scrollbar-thumb-hover': hslToRgba(h, sScaled(9, 12), clamp(darkBaseL + 23, 27, 44), 0.86),
    },
  };
}

export function resolveEffectiveChatTextColors(config, derivedPalette) {
  const autoPal = derivedPalette.chatTextPalette;
  const isLight = derivedPalette.themeMode === 'light';
  const storedText = config?.chatText || {};
  const storedAuto = config?.chatTextAuto || {};

  const isReadableText = (hex) => {
    const { l } = rgbToHsl(hexToRgb(hex));
    return isLight ? l <= 66 : l >= 32;
  };
  const isCompatibleBg = (hex, alpha = 1) => {
    if (alpha <= 0.08) return true;
    const { l } = rgbToHsl(hexToRgb(hex));
    return isLight ? l >= 55 : l <= 55;
  };

  const pickText = (key) => {
    if (storedAuto[key] !== false) return autoPal[key];
    const candidate = normalizeHexColor(storedText[key], autoPal[key]);
    return isReadableText(candidate) ? candidate : autoPal[key];
  };

  const pickPair = (key) => {
    const autoPair = autoPal[key];
    const rawPair = storedText[key] && typeof storedText[key] === 'object' ? storedText[key] : {};
    if (storedAuto[key] !== false) return { ...autoPair };
    const textHex = normalizeHexColor(rawPair.text, autoPair.text);
    const bgHex = normalizeHexColor(rawPair.bg, autoPair.bg);
    const bgAlpha = clamp(
      Number.isFinite(Number(rawPair.bgAlpha)) ? Number(rawPair.bgAlpha) : 1,
      0,
      1,
    );
    return {
      text: isReadableText(textHex) ? textHex : autoPair.text,
      bg: isCompatibleBg(bgHex, bgAlpha) ? bgHex : autoPair.bg,
      bgAlpha,
    };
  };

  return {
    text: pickText('text'),
    quote: pickText('quote'),
    apostrophe: pickText('apostrophe'),
    italic: pickText('italic'),
    bold: pickText('bold'),
    code: pickPair('code'),
    codeBlock: pickPair('codeBlock'),
    details: pickPair('details'),
  };
}

export function buildPresetPreviewSwatches(preset) {
  const pal = buildDerivedTavernPalette({
    themeMode: preset.themeMode || 'dark',
    colorScheme: preset.colorScheme || 'two-color',
    primaryColor: preset.primaryColor,
    accentColor: preset.accentColor,
    paletteOverrides: preset.paletteOverrides,
  });
  return [
    pal.slots.bgDeepHex,
    pal.slots.bgCardHex,
    normalizeHexColor(preset.primaryColor, pal.slots.borderBaseHex),
    pal.slots.accentHex,
  ];
}

