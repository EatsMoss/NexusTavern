import React from 'react';
import './BrandLogo.css';

export const BRAND_LOGO_PATH_D =
  'M2510 6192 c384 -68 603 -137 905 -287 511 -253 881 -600 1099 -1029 ' +
  '166 -328 217 -655 150 -968 l-17 -76 -76 26 c-86 30 -75 11 -106 185 -72 402 ' +
  '-383 746 -837 926 -354 139 -774 109 -1158 -84 -422 -212 -800 -651 -1016 ' +
  '-1180 l-33 -80 -4 1020 c-4 1101 -2 1072 -58 1220 -38 102 -102 185 -169 220 ' +
  '-50 26 -66 81 -33 117 17 19 38 19 623 15 569 -3 612 -5 730 -25z m3590 8 c26 ' +
  '-26 25 -66 -2 -90 -13 -11 -47 -41 -76 -67 -63 -55 -101 -120 -135 -229 -38 ' +
  '-119 -47 -238 -47 -601 0 -624 -60 -996 -227 -1408 -250 -617 -698 -1051 ' +
  '-1220 -1182 -97 -25 -126 -28 -283 -28 -159 0 -204 5 -302 31 -15 4 -14 13 11 ' +
  '86 l28 82 96 17 c310 55 559 218 777 509 115 154 197 339 243 550 20 92 21 ' +
  '130 26 1145 7 1150 3 1082 65 1148 53 56 51 56 559 57 454 0 468 -1 487 -20z ' +
  'm-2717 -1474 c37 -7 70 -16 73 -19 7 -7 -46 -167 -55 -167 -30 0 -150 -25 ' +
  '-206 -42 -191 -58 -342 -153 -500 -312 -247 -248 -384 -537 -425 -891 -6 -55 ' +
  '-10 -454 -10 -1034 0 -716 -3 -954 -12 -985 -17 -56 -74 -110 -131 -124 -65 ' +
  '-17 -906 -17 -942 0 -14 6 -28 21 -31 34 -12 46 0 67 65 113 75 54 121 116 ' +
  '150 203 49 147 52 181 61 658 9 464 14 530 59 782 56 308 131 531 263 792 258 ' +
  '505 663 858 1112 971 181 45 362 53 529 21z m326 -276 c39 -107 97 -267 130 ' +
  '-355 l58 -160 214 -78 c415 -150 520 -190 516 -193 -2 -2 -165 -63 -363 -135 ' +
  '-197 -72 -361 -135 -364 -139 -3 -4 -63 -170 -135 -369 -71 -198 -133 -361 ' +
  '-136 -361 -6 0 -26 53 -179 475 -50 137 -94 253 -99 258 -7 7 -359 140 -609 ' +
  '229 -62 22 -110 44 -105 48 4 5 112 45 238 90 127 45 287 102 357 127 l126 45 ' +
  '100 277 c55 152 115 318 133 369 19 51 36 87 40 80 4 -7 39 -101 78 -208z ' +
  'm2158 -2825 c42 -181 89 -265 183 -325 78 -50 93 -100 43 -140 l-28 -22 -520 ' +
  '5 c-536 6 -594 9 -852 52 -670 112 -1314 460 -1695 914 -283 338 -429 694 ' +
  '-430 1051 -1 116 17 268 37 327 3 10 25 5 82 -15 l78 -28 7 -72 c48 -474 462 ' +
  '-908 997 -1043 538 -137 1090 47 1533 510 215 224 367 462 489 765 l44 108 6 ' +
  '-998 c5 -965 6 -1002 26 -1089z';

/**
 * NexusTavern vector mark (`src/assets/logo.svg`) rendered inline so it paints
 * on frame 0 without network wait and adapts cleanly to M3 theme tokens.
 */
export function BrandLogo({
  size = 48,
  badge = false,
  tone = 'on-surface', // 'on-surface' | 'primary'
  pulse = false,
  className = '',
  style,
  title = 'NexusTavern',
}) {
  const outerSize = badge ? Math.round(size * 1.42) : size;
  const padding = badge ? Math.round((outerSize - size) / 2) : 0;

  return (
    <span
      className={[
        'bb-brand-logo',
        badge ? 'bb-brand-logo--badge' : '',
        tone === 'primary' ? 'bb-brand-logo--primary' : '',
        pulse ? 'bb-brand-logo--pulse' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: outerSize,
        height: outerSize,
        padding: padding || undefined,
        ...style,
      }}
      role="img"
      aria-label={title}
    >
      <svg
        viewBox="0 0 726 726"
        preserveAspectRatio="xMidYMid meet"
        className="bb-brand-logo__svg"
        aria-hidden="true"
      >
        <g transform="translate(0,726) scale(0.1,-0.1)" fill="currentColor" stroke="none">
          <path d={BRAND_LOGO_PATH_D} />
        </g>
      </svg>
    </span>
  );
}
