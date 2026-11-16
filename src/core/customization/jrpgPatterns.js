/**
 * Built-in vector JRPG & geometric backdrop patterns ported cleanly from BookboundUI.
 * Automatically tinted with the active palette's subtle stroke & accent colors.
 */

export const JRPG_BACKDROP_PATTERNS = [
  {
    id: 'diamond-lattice',
    name: 'Diamond Lattice',
    subtitle: 'Classic JRPG ornament with crystals at every intersection',
    baseSize: 40,
    buildSvg: (stroke, accent) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40' fill='none'>` +
      `<path d='M20 1L39 20L20 39L1 20Z' stroke='${stroke}' stroke-width='0.9'/>` +
      `<path d='M20 9L31 20L20 31L9 20Z' stroke='${stroke}' stroke-width='0.65' stroke-opacity='0.65'/>` +
      `<polygon points='20,17 23,20 20,23 17,20' fill='${accent}' fill-opacity='0.75'/>` +
      `<circle cx='1' cy='1' r='1.1' fill='${accent}' fill-opacity='0.5'/>` +
      `<circle cx='39' cy='1' r='1.1' fill='${accent}' fill-opacity='0.5'/>` +
      `<circle cx='1' cy='39' r='1.1' fill='${accent}' fill-opacity='0.5'/>` +
      `<circle cx='39' cy='39' r='1.1' fill='${accent}' fill-opacity='0.5'/>` +
      `</svg>`,
  },
  {
    id: 'astral-stars',
    name: 'Astral Stars',
    subtitle: 'Delicate celestial grid with four-pointed star motifs',
    baseSize: 48,
    buildSvg: (stroke, accent) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48' fill='none'>` +
      `<path d='M24 0V48M0 24H48' stroke='${stroke}' stroke-width='0.55' stroke-opacity='0.55'/>` +
      `<path d='M24 16L26.2 21.8L32 24L26.2 26.2L24 32L21.8 26.2L16 24L21.8 21.8Z' stroke='${accent}' stroke-width='0.9' fill='${accent}' fill-opacity='0.22'/>` +
      `<circle cx='6' cy='6' r='1' fill='${stroke}' fill-opacity='0.7'/>` +
      `<circle cx='42' cy='6' r='1' fill='${stroke}' fill-opacity='0.7'/>` +
      `<circle cx='6' cy='42' r='1' fill='${stroke}' fill-opacity='0.7'/>` +
      `<circle cx='42' cy='42' r='1' fill='${stroke}' fill-opacity='0.7'/>` +
      `</svg>`,
  },
  {
    id: 'arcane-hex',
    name: 'Arcane Hex',
    subtitle: 'Interlocking geometric alchemy lattice',
    baseSize: 44,
    buildSvg: (stroke, accent) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44' fill='none'>` +
      `<polygon points='22,3 38,12.5 38,31.5 22,41 6,31.5 6,12.5' stroke='${stroke}' stroke-width='0.85'/>` +
      `<polygon points='22,11 31,16.5 31,27.5 22,33 13,27.5 13,16.5' stroke='${accent}' stroke-width='0.65' stroke-opacity='0.7'/>` +
      `<circle cx='22' cy='22' r='1.8' fill='${accent}' fill-opacity='0.65'/>` +
      `</svg>`,
  },
  {
    id: 'royal-crest',
    name: 'Royal Crest',
    subtitle: 'Gothic bookbinding crosshatch & corner fleurs',
    baseSize: 42,
    buildSvg: (stroke, accent) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='42' height='42' viewBox='0 0 42 42' fill='none'>` +
      `<rect x='3' y='3' width='36' height='36' rx='2' stroke='${stroke}' stroke-width='0.7' stroke-opacity='0.65'/>` +
      `<path d='M21 7L35 21L21 35L7 21Z' stroke='${stroke}' stroke-width='0.8'/>` +
      `<polygon points='21,16 26,21 21,26 16,21' stroke='${accent}' stroke-width='0.85' fill='${accent}' fill-opacity='0.2'/>` +
      `</svg>`,
  },
  {
    id: 'charmed-diamonds',
    name: 'Charmed Diamonds',
    subtitle: 'Light airy argyle weave with soft accent dots',
    baseSize: 36,
    buildSvg: (stroke, accent) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36' fill='none'>` +
      `<path d='M18 0L36 18L18 36L0 18Z' stroke='${stroke}' stroke-width='0.75'/>` +
      `<circle cx='18' cy='18' r='2' fill='${accent}' fill-opacity='0.6'/>` +
      `</svg>`,
  },
  {
    id: 'dungeon-tiles',
    name: 'Dungeon Tiles',
    subtitle: 'Minimalist isometric stone floor grid',
    baseSize: 40,
    buildSvg: (stroke, accent) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40' fill='none'>` +
      `<rect x='1' y='1' width='18' height='18' rx='1.5' stroke='${stroke}' stroke-width='0.75'/>` +
      `<rect x='21' y='21' width='18' height='18' rx='1.5' stroke='${stroke}' stroke-width='0.75'/>` +
      `<rect x='21' y='1' width='18' height='18' rx='1.5' stroke='${accent}' stroke-width='0.6' stroke-opacity='0.5'/>` +
      `<rect x='1' y='21' width='18' height='18' rx='1.5' stroke='${accent}' stroke-width='0.6' stroke-opacity='0.5'/>` +
      `</svg>`,
  },
];

export function buildJrpgPatternDataUri(patternId, strokeHex = '#6D6D83', accentHex = '#6575B3') {
  const found =
    JRPG_BACKDROP_PATTERNS.find((p) => p.id === patternId) || JRPG_BACKDROP_PATTERNS[0];
  const svg = found.buildSvg(strokeHex, accentHex);
  return {
    dataUri: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    baseSize: found.baseSize,
  };
}
