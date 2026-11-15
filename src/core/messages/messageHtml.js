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

const ENCODE_STYLE_REGEX = /<style>(.+?)<\/style>/gims;
const DECODE_STYLE_REGEX = /<custom-style>(.+?)<\/custom-style>/gms;

const PSEUDO_WITH_SELECTORS = ['has', 'not', 'where', 'is', 'matches', 'any'];

/** Escapes `<style>` blocks into `<custom-style>` with encoded CSS. */
export function encodeStyleTags(text = '') {
  return String(text).replaceAll(ENCODE_STYLE_REGEX, (_, css) => {
    return `<custom-style>${encodeURIComponent(css)}</custom-style>`;
  });
}

/**
 * Prefixes a single selector so it can only match inside the message body.
 * Nested selectors inside :is()/:not()/etc. are prefixed recursively.
 */
function prefixSimpleSelector(selector = '') {
  const trimmed = selector.trim();
  if (!trimmed) return trimmed;

  if (trimmed.startsWith(STYLE_SCOPE_PREFIX.trim())) return trimmed;
  if (/^(@|:root|html|body)\b/i.test(trimmed)) return trimmed;

  const pseudoRegex = new RegExp(`:(${PSEUDO_WITH_SELECTORS.join('|')})\\(([^)]+)\\)`, 'g');
  const withPrefixedPseudos = trimmed.replace(pseudoRegex, (match, pseudo, content) => {
    const inner = content
      .split(',')
      .map((part) => prefixSimpleSelector(part))
      .join(', ');
    return `:${pseudo}(${inner})`;
  });

  return `${STYLE_SCOPE_PREFIX}${withPrefixedPseudos}`;
}

/**
 * Restores `<custom-style>` blocks as real `<style>`, prefixing each selector
 * with the scope. When external media is forbidden, declarations pointing at
 * an absolute URL are dropped (same intent as ST's forbid_external_media).
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

    if (!allowExternalMedia) {
      // Drop declarations that reference an absolute URL.
      css = css.replace(/[^;{}]*:\s*[^;{}]*:\/\/[^;{}]*;?/g, '');
    }

    // Prefix each selector preceding a `{`.
    css = css.replace(/(^|})\s*([^{}@]+?)\s*\{/g, (match, brace, selectors) => {
      const scoped = selectors
        .split(',')
        .map((selector) => prefixSimpleSelector(selector))
        .join(', ');
      return `${brace}${scoped}{`;
    });

    return `<style>${css}</style>`;
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

