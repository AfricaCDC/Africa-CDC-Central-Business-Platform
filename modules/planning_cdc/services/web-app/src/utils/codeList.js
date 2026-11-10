/**
 * Read a list of codes stored as a JSON array in a TEXT column
 * (`contributing_divisions`, `secondary_division_codes`).
 *
 * @param {string|string[]|null|undefined} raw - JSON text, an array, or nothing
 * @returns {string[]} the codes, or [] when empty or unreadable
 * @example parseCodeList('["EPR","SCI"]') // ['EPR', 'SCI']
 */
export function parseCodeList(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
