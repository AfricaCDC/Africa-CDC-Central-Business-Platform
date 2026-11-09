// ── Division hierarchy helpers ──
//
// Pure utilities for the division / directorate filters (Workplan, M&E
// submissions, …). A `division_codes` row carries `code`, `division_name`,
// `parent_code` and `level_type` ('directorate' | 'division' | 'unit'). The
// directorate of a division is the first ancestor (or itself) whose level_type
// is 'directorate', found by walking `parent_code`.
import { LEVEL_TYPES } from '@rbm/lib/enums';

/**
 * Index division rows by their code for O(1) parent walks.
 *
 * @param {Array<{code: string}>} [divisions]
 * @returns {Record<string, object>}
 */
export function indexByCode(divisions = []) {
  const byCode = {};
  for (const d of divisions) if (d?.code) byCode[d.code] = d;
  return byCode;
}

/**
 * Resolve the directorate code for a division code by walking `parent_code`
 * up to the first ancestor (or itself) of level_type 'directorate'.
 * Returns null when none is found. Cycle-safe.
 *
 * @param {string} code
 * @param {Record<string, object>} byCode - output of {@link indexByCode}
 * @returns {string|null}
 */
export function directorateOf(code, byCode) {
  const seen = new Set();
  let cur = byCode[code];
  while (cur && !seen.has(cur.code)) {
    seen.add(cur.code);
    if (cur.level_type === LEVEL_TYPES.DIRECTORATE) return cur.code;
    cur = cur.parent_code ? byCode[cur.parent_code] : null;
  }
  return null;
}

/**
 * Directorate options for a SearchSelect (value = code, label = name).
 *
 * @param {Array<object>} [divisions]
 * @returns {Array<{ value: string, label: string, sub: string }>}
 */
export function directorateOptions(divisions = []) {
  return divisions
    .filter((d) => d.level_type === LEVEL_TYPES.DIRECTORATE)
    .map((d) => ({ value: d.code, label: d.division_name || d.code, sub: d.code }));
}

/**
 * Division options for a SearchSelect, optionally narrowed to one directorate.
 * Directorate rows themselves are excluded (they group divisions, not own work).
 *
 * @param {Array<object>} [divisions]
 * @param {string} [directorateCode] - 'all'/empty = no narrowing
 * @returns {Array<{ value: string, label: string, sub: string }>}
 */
export function divisionOptions(divisions = [], directorateCode) {
  const byCode = indexByCode(divisions);
  const narrow = directorateCode && directorateCode !== 'all';
  return divisions
    .filter((d) => d.level_type !== LEVEL_TYPES.DIRECTORATE)
    .filter((d) => !narrow || directorateOf(d.code, byCode) === directorateCode)
    .map((d) => ({ value: d.code, label: d.division_name || d.code, sub: d.code }));
}

/**
 * Does a node pass the division/directorate filter? 'all'/empty always passes.
 *
 * @param {{ responsible_division_code?: string }} node
 * @param {{ divisionId?: string, directorate?: string }} filters
 * @param {Record<string, object>} [byCode] - output of {@link indexByCode}
 * @returns {boolean}
 */
export function matchesDivisionFilter(node, { divisionId, directorate } = {}, byCode = {}) {
  const code = node?.responsible_division_code;
  if (divisionId && divisionId !== 'all' && code !== divisionId) return false;
  if (directorate && directorate !== 'all' && directorateOf(code, byCode) !== directorate) return false;
  return true;
}
