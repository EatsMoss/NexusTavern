/**
 * Built-in vector JRPG & grimoire backdrop patterns ported cleanly from BookboundUI.
 * Automatically tinted with the active M3 palette's stroke & accent colors.
 */

export const JRPG_BACKDROP_PATTERNS = [
  {
    id: 'diamond-lattice',
    name: 'Diamond Lattice',
    subtitle: 'Classic JRPG ornament with crystals at every intersection',
    baseSize: 40,
    baseWidth: 40,
    baseHeight: 40,
    buildSvg: (stroke, accent) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40' fill='none'>` +
      `<path d='M20 0 L40 20 L20 40 L0 20 Z' stroke='${stroke}' stroke-width='1' stroke-opacity='0.42'/>` +
      `<path d='M20 6 L34 20 L20 34 L6 20 Z' stroke='${stroke}' stroke-width='0.75' stroke-opacity='0.24' stroke-dasharray='2 2'/>` +
      `<polygon points='20,16.5 23.5,20 20,23.5 16.5,20' fill='${accent}' fill-opacity='0.48'/>` +
      `<circle cx='0' cy='0' r='1.6' fill='${accent}' fill-opacity='0.4'/>` +
      `<circle cx='40' cy='0' r='1.6' fill='${accent}' fill-opacity='0.4'/>` +
      `<circle cx='0' cy='40' r='1.6' fill='${accent}' fill-opacity='0.4'/>` +
      `<circle cx='40' cy='40' r='1.6' fill='${accent}' fill-opacity='0.4'/>` +
      `</svg>`,
  },
  {
    id: 'astral-stars',
    name: 'Astral Grimoire',
    subtitle: 'Four-pointed sparks and a delicate constellation of chronicles',
    baseSize: 48,
    baseWidth: 48,
    baseHeight: 48,
    buildSvg: (stroke, accent) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48' fill='none'>` +
      `<rect x='1' y='1' width='46' height='46' stroke='${stroke}' stroke-width='0.65' stroke-opacity='0.22'/>` +
      `<circle cx='24' cy='24' r='12' stroke='${stroke}' stroke-width='0.85' stroke-opacity='0.3' stroke-dasharray='2 3'/>` +
      `<path d='M24 14 Q24 24 34 24 Q24 24 24 34 Q24 24 14 24 Q24 24 24 14 Z' fill='${accent}' fill-opacity='0.4' stroke='${accent}' stroke-width='0.65' stroke-opacity='0.58'/>` +
      `<circle cx='8' cy='8' r='1.15' fill='${stroke}' fill-opacity='0.42'/>` +
      `<circle cx='40' cy='8' r='1.15' fill='${stroke}' fill-opacity='0.42'/>` +
      `<circle cx='8' cy='40' r='1.15' fill='${stroke}' fill-opacity='0.42'/>` +
      `<circle cx='40' cy='40' r='1.15' fill='${stroke}' fill-opacity='0.42'/>` +
      `</svg>`,
  },
  {
    id: 'dungeon-tiles',
    name: 'Sanctuary Tiles',
    subtitle: 'Stone masonry of a tactical map with beveled corners',
    baseSize: 44,
    baseWidth: 44,
    baseHeight: 44,
    buildSvg: (stroke, accent) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44' fill='none'>` +
      `<path d='M6 2 H38 L42 6 V38 L38 42 H6 L2 38 V6 Z' stroke='${stroke}' stroke-width='1' stroke-opacity='0.38'/>` +
      `<rect x='7' y='7' width='30' height='30' stroke='${stroke}' stroke-width='0.65' stroke-opacity='0.22'/>` +
      `<path d='M2 10 L10 2 M34 2 L42 10 M2 34 L10 42 M34 42 L42 34' stroke='${accent}' stroke-width='1' stroke-opacity='0.44'/>` +
      `<rect x='20.5' y='20.5' width='3' height='3' transform='rotate(45 22 22)' fill='${accent}' fill-opacity='0.44'/>` +
      `</svg>`,
  },
  {
    id: 'royal-crest',
    name: 'Royal Crest',
    subtitle: 'Intertwined medallions and heraldic rosettes',
    baseSize: 48,
    baseWidth: 48,
    baseHeight: 48,
    buildSvg: (stroke, accent) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48' fill='none'>` +
      `<circle cx='24' cy='24' r='18' stroke='${stroke}' stroke-width='0.95' stroke-opacity='0.34'/>` +
      `<circle cx='24' cy='24' r='13' stroke='${stroke}' stroke-width='0.75' stroke-opacity='0.24'/>` +
      `<path d='M24 2 L28 10 L24 14 L20 10 Z M24 46 L28 38 L24 34 L20 38 Z M2 24 L10 28 L14 24 L10 20 Z M46 24 L38 28 L34 24 L38 20 Z' fill='${accent}' fill-opacity='0.34'/>` +
      `<polygon points='24,18 30,24 24,30 18,24' stroke='${accent}' stroke-width='1' stroke-opacity='0.52' fill='${accent}' fill-opacity='0.22'/>` +
      `</svg>`,
  },
  {
    id: 'arcane-hex',
    name: 'Aether Hexagram',
    subtitle: 'Alchemical honeycomb lattice with runic nodes',
    baseSize: 40,
    baseWidth: 40,
    baseHeight: 46,
    buildSvg: (stroke, accent) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='46' viewBox='0 0 40 46' fill='none'>` +
      `<path d='M20 2 L38 12.5 V33.5 L20 44 L2 33.5 V12.5 Z' stroke='${stroke}' stroke-width='0.95' stroke-opacity='0.38'/>` +
      `<path d='M20 9 L32 16 V30 L20 37 L8 30 V16 Z' stroke='${stroke}' stroke-width='0.65' stroke-opacity='0.22'/>` +
      `<circle cx='20' cy='23' r='2.4' fill='${accent}' fill-opacity='0.46'/>` +
      `<path d='M20 2 V9 M20 37 V44 M2 12.5 L8 16 M38 12.5 L32 16 M2 33.5 L8 30 M38 33.5 L32 30' stroke='${accent}' stroke-width='0.85' stroke-opacity='0.38'/>` +
      `</svg>`,
  },
  {
    id: 'charmed-diamonds',
    name: 'Charmed Diamonds',
    subtitle: 'Tender little hearts centered within dim diamonds',
    baseSize: 48,
    baseWidth: 48,
    baseHeight: 48,
    buildSvg: (stroke, accent) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48' fill='none'>` +
      `<path d='M24 5.5 L42.5 24 L24 42.5 L5.5 24 Z' stroke='${stroke}' stroke-width='1' stroke-opacity='0.36' fill='${stroke}' fill-opacity='0.05'/>` +
      `<path d='M0 5 C-3.2 2.2 -5 0.4 -5 -2 C-5 -4.2 -3.4 -5.5 -1.8 -5.5 C-0.7 -5.5 0 -4.7 0 -3.8 C0 -4.7 0.7 -5.5 1.8 -5.5 C3.4 -5.5 5 -4.2 5 -2 C5 0.4 3.2 2.2 0 5 Z' transform='translate(24 24.4) scale(1.6)' fill='${accent}' fill-opacity='0.34' stroke='${accent}' stroke-width='0.65' stroke-opacity='0.56'/>` +
      `<circle cx='0' cy='0' r='1.2' fill='${accent}' fill-opacity='0.34'/>` +
      `<circle cx='48' cy='0' r='1.2' fill='${accent}' fill-opacity='0.34'/>` +
      `<circle cx='0' cy='48' r='1.2' fill='${accent}' fill-opacity='0.34'/>` +
      `<circle cx='48' cy='48' r='1.2' fill='${accent}' fill-opacity='0.34'/>` +
      `</svg>`,
  },
];

export function buildJrpgPatternDataUri(patternId, strokeHex = '#6D6D83', accentHex = '#6575B3') {
  const found =
    JRPG_BACKDROP_PATTERNS.find((p) => p.id === patternId) || JRPG_BACKDROP_PATTERNS[0];
  const svg = found.buildSvg(strokeHex, accentHex);
  const baseWidth = found.baseWidth || found.baseSize || 40;
  const baseHeight = found.baseHeight || found.baseSize || 40;
  return {
    dataUri: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    baseSize: found.baseSize || baseWidth,
    baseWidth,
    baseHeight,
  };
}
