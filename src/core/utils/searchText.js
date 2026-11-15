/**
 * NexusTavern — shared text normalization for search and filtering.
 *
 * Lives in core/utils because both the character gallery and any future list
 * (personas, backgrounds, lorebooks) must match accents, diacritics and case the
 * same way; a per-feature copy would drift.
 */

/**
 * Normalizes a string for case- and accent-insensitive comparison:
 * lowercases, strips combining diacritical marks, and collapses whitespace.
 */
export function normalizeSearchString(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Whether `haystack` contains `needle` under normalized comparison.
 * An empty needle matches everything.
 */
export function matchesSearch(haystack = '', needle = '') {
  const query = normalizeSearchString(needle);
  if (!query) return true;
  return normalizeSearchString(haystack).includes(query);
}
