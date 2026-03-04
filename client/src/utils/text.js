/** Remove accents/diacritics. */
export function stripDiacritics(input) {
  return String(input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Base normalize: lowercase + trim + remove diacritics. */
export function normalizeKey(input) {
  return stripDiacritics(input).toLowerCase().trim();
}

/**
 * Normalize for search (legacy): keeps spaces, deletes punctuation/symbols.
 */
export function normalizeSearch(input) {
  return normalizeKey(input).replace(/[^a-z0-9\s]+/g, '');
}

/**
 * Normalize alphanumeric only: removes ALL non [a-z0-9].
 */
export function normalizeAlnum(input) {
  return normalizeKey(input).replace(/[^a-z0-9]+/g, '');
}

/**
 * Slug: lowercase, dash-separated, collapses dashes, trims edges.
 */
export function slugify(input) {
  return normalizeKey(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
