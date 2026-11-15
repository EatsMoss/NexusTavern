import DOMPurify from 'dompurify';

/**
 * NexusTavern — message HTML sanitisation & style scoping.
 *
 * Mirrors the SillyTavern approach:
 *  1. `<style>` blocks are swapped for `<custom-style>` with URL-encoded CSS,
 *     so the sanitizer does not drop them.
 *  2. The whole payload goes through DOMPurify.
 *  3. Style blocks are restored with EVERY selector prefixed, so character
 *     card CSS can never leak into (or break) the application UI.
 *
 * Scoping prefix mirrors ST's `.mes_text ` and points at our decorator body.
 */
export const STYLE_SCOPE_PREFIX = '.bb-decorator-body ';
const SCOPE_CLASS = '.bb-decorator-body';

const ENCODE_STYLE_REGEX = /<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi;
const DECODE_STYLE_REGEX = /<custom-style>([\s\S]*?)<\/custom-style>/g;

const PSEUDO_WITH_SELECTORS = new Set(['has', 'not', 'where', 'is', 'matches', 'any']);

/** Escapes `<style>` blocks into `<custom-style>` with encoded CSS. */
export function encodeStyleTags(text = '') {
  return String(text).replaceAll(ENCODE_STYLE_REGEX, (_, css) => {
    return `<custom-style>${encodeURIComponent(css)}</custom-style>`;
  });
}

/**
 * Splits a selector list by top-level commas while preserving commas inside `(...)` and `[...]`.
 */
function splitSelectorList(selectorText = '') {
  const parts = [];
  let depthParen = 0;
  let depthBracket = 0;
  let quote = '';
  let start = 0;

  for (let i = 0; i < selectorText.length; i += 1) {
    const ch = selectorText[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depthParen += 1;
    else if (ch === ')') depthParen = Math.max(0, depthParen - 1);
    else if (ch === '[') depthBracket += 1;
    else if (ch === ']') depthBracket = Math.max(0, depthBracket - 1);
    else if (ch === ',' && depthParen === 0 && depthBracket === 0) {
      parts.push(selectorText.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(selectorText.slice(start));
  return parts;
}

/**
 * Rewrites functional pseudo-classes (`:is(...)`, `:not(...)`, `:where(...)`, `:has(...)`)
 * so root-level selectors inside them are rewritten safely without double-nesting `.bb-decorator-body`.
 */
function rewriteFunctionalPseudos(selector = '') {
  let out = '';
  let i = 0;

  while (i < selector.length) {
    if (selector[i] === ':') {
      const m = selector.slice(i).match(/^:([a-zA-Z-]+)\(/);
      if (m && PSEUDO_WITH_SELECTORS.has(m[1].toLowerCase())) {
        const pseudoName = m[1];
        const openParenIdx = i + m[0].length - 1;
        let depth = 1;
        let j = openParenIdx + 1;
        let quote = '';

        while (j < selector.length && depth > 0) {
          const ch = selector[j];
          if (quote) {
            if (ch === '\\') j += 1;
            else if (ch === quote) quote = '';
          } else if (ch === '"' || ch === "'") quote = ch;
          else if (ch === '(') depth += 1;
          else if (ch === ')') depth -= 1;
          j += 1;
        }

        if (depth === 0) {
          const innerContent = selector.slice(openParenIdx + 1, j - 1);
          const rewrittenInner = splitSelectorList(innerContent)
            .map((part) => replaceRootTargets(part.trim()))
            .filter(Boolean)
            .join(', ');
          out += `:${pseudoName}(${rewrittenInner})`;
          i = j;
          continue;
        }
      }
    }
    out += selector[i];
    i += 1;
  }

  return out;
}

/**
 * Replaces global root targets (`:root`, `html`, `body`, `html > body`) with `.bb-decorator-body`
 * so card-level custom properties and wrapper styles apply strictly to the message container.
 */
function replaceRootTargets(selector = '') {
  if (!selector) return '';
  let next = selector
    .replace(/^(?:html\s*(?:>\s*)?body|html|body|:root)(?=$|[\s>+~.#[:])/i, SCOPE_CLASS)
    .replace(/(^|[\s>+~])(?:html|body|:root)(?=$|[\s>+~.#[:])/gi, `$1${SCOPE_CLASS}`);
  const dupPattern = new RegExp(
    `\\${SCOPE_CLASS}(?:\\s*(?:>\\s*)?\\${SCOPE_CLASS})+`,
    'g',
  );
  next = next.replace(dupPattern, SCOPE_CLASS);
  return next.trim();
}

/**
 * Prefixes a single selector so it can only match inside `.bb-decorator-body`.
 */
function prefixSimpleSelector(selector = '') {
  const trimmed = selector.trim();
  if (!trimmed) return '';

  const rootReplaced = replaceRootTargets(trimmed);
  const withPseudos = rewriteFunctionalPseudos(rootReplaced);

  if (
    withPseudos === SCOPE_CLASS ||
    withPseudos.startsWith(`${SCOPE_CLASS} `) ||
    withPseudos.startsWith(`${SCOPE_CLASS}.`) ||
    withPseudos.startsWith(`${SCOPE_CLASS}:`) ||
    withPseudos.startsWith(`${SCOPE_CLASS}[`) ||
    withPseudos.startsWith(`${SCOPE_CLASS}>`) ||
    withPseudos.startsWith(`${SCOPE_CLASS}+`) ||
    withPseudos.startsWith(`${SCOPE_CLASS}~`)
  ) {
    return withPseudos;
  }

  return `${STYLE_SCOPE_PREFIX}${withPseudos}`;
}

/**
 * Balanced-brace CSS scoper:
 * - Strips `@import` rules completely.
 * - Preserves `@keyframes` / `@font-face` / `@property` inner blocks intact (so `from`, `to`, `50%` work).
 * - Recursively scopes rules inside `@media`, `@supports`, `@container`, and `@layer` blocks.
 * - Scopes every standard style rule selector under `.bb-decorator-body`.
 */
export function scopeCssStylesheet(rawCss = '', { allowExternalMedia = true } = {}) {
  if (!rawCss) return '';

  let css = String(rawCss)
    .replace(/<\/style/gi, '<\\/style')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Strip all `@import` statements (preventing external stylesheet injection)
  css = css.replace(/@import\b[^;{]*(?:;|$)/gi, '');

  if (!allowExternalMedia) {
    // Drop `url(...)` pointing to external protocols (`http:`, `https:`, `//`)
    css = css.replace(
      /[^;{}]*:\s*[^;{}]*(?:url\(\s*['"]?\s*(?:https?:|\/\/)|https?:\/\/)[^;{}]*;?/gi,
      '',
    );
  }

  let out = '';
  let i = 0;
  const len = css.length;

  while (i < len) {
    while (i < len && /[\s;]/.test(css[i])) {
      out += css[i];
      i += 1;
    }
    if (i >= len) break;

    const preludeStart = i;
    let quote = '';
    while (i < len) {
      const ch = css[i];
      if (quote) {
        if (ch === '\\') i += 1;
        else if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '{' || ch === ';') break;
      i += 1;
    }

    const prelude = css.slice(preludeStart, i).trim();
    if (i >= len || css[i] === ';') {
      if (i < len) i += 1;
      continue;
    }

    const bodyStart = i + 1;
    let depth = 1;
    i += 1;
    quote = '';
    while (i < len && depth > 0) {
      const ch = css[i];
      if (quote) {
        if (ch === '\\') i += 1;
        else if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
    }

    const bodyEnd = depth === 0 ? i - 1 : len;
    const innerBody = css.slice(bodyStart, bodyEnd);
    if (!prelude) continue;

    if (prelude.startsWith('@')) {
      const atMatch = prelude.match(/^@([a-zA-Z-]+)/);
      const atName = atMatch ? atMatch[1].toLowerCase() : '';

      if (
        atName === 'keyframes' ||
        atName === '-webkit-keyframes' ||
        atName === 'font-face' ||
        atName === 'property' ||
        atName === 'counter-style'
      ) {
        out += `${prelude}{${innerBody}}`;
      } else if (
        atName === 'media' ||
        atName === 'supports' ||
        atName === 'container' ||
        atName === 'layer'
      ) {
        const scopedInner = scopeCssStylesheet(innerBody, { allowExternalMedia });
        out += `${prelude}{${scopedInner}}`;
      }
      continue;
    }

    const scopedSelectors = splitSelectorList(prelude)
      .map((sel) => prefixSimpleSelector(sel))
      .filter(Boolean)
      .join(', ');

    if (scopedSelectors) {
      out += `${scopedSelectors}{${innerBody}}`;
    }
  }

  return out;
}

/**
 * Restores `<custom-style>` blocks as real `<style>`, strictly scoping every rule
 * to `.bb-decorator-body`.
 */
export function decodeStyleTags(
  text = '',
  { allowExternalMedia = true } = {},
) {
  return String(text).replaceAll(DECODE_STYLE_REGEX, (_, encodedCss) => {
    let css = '';
    try {
      css = decodeURIComponent(encodedCss);
    } catch {
      return '';
    }

    const scoped = scopeCssStylesheet(css, { allowExternalMedia });
    return scoped.trim() ? `<style>${scoped}</style>` : '';
  });
}

let hooksRegistered = false;

/** Registers the DOMPurify hooks once, mirroring ST's addDOMPurifyHooks(). */
function ensureHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;

  // Force every link into a new tab with no opener access.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if ('target' in node) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

/**
 * Sanitizes raw message HTML.
 * Keeps the ST-compatible payload (rich cards, details, inputs) while
 * dropping scripts, frames and embedded documents.
 */
export function sanitizeMessageHtml(rawHtml = '', { allowExternalMedia = true } = {}) {
  if (!rawHtml) return '';

  ensureHooks();

  const encoded = encodeStyleTags(rawHtml);

  const clean = DOMPurify.sanitize(encoded, {
    ADD_TAGS: ['custom-style'],
    ADD_ATTR: ['open', 'target', 'rel'],
    FORBID_TAGS: [
      'script',
      'iframe',
      'object',
      'embed',
      'base',
      'link',
      'meta',
      'form',
      'noscript',
    ],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
  });

  return decodeStyleTags(clean, { allowExternalMedia });
}

