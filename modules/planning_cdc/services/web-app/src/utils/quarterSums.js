/**
 * Pure helpers for the "quarterly values should add up to the annual total"
 * coherence checks (backlog VH-2). These power NON-BLOCKING warnings on the
 * indicator form (Q1..Q4 targets vs the annual/overall target) and the
 * specific-activity form (Q1..Q4 budgets vs the total cost).
 *
 * Design notes:
 *   - Inputs are raw form values (strings or numbers, possibly empty/null).
 *     Empty / unparseable values count as 0 so a partially-filled form does
 *     not throw and does not warn spuriously.
 *   - The comparison is tolerant: floating-point money/targets rarely match to
 *     the cent, so a small absolute epsilon avoids false alarms.
 *   - Nothing here blocks a save — callers render the returned message as an
 *     advisory banner only.
 */

/**
 * True when a raw form field is "not filled in" (empty string / null / undefined).
 *
 * @param {string|number|null|undefined} v
 * @returns {boolean}
 */
function isBlank(v) {
  return v === '' || v === null || v === undefined;
}

/**
 * Format a number for display: trim trailing .00 noise, keep up to 2 decimals.
 *
 * @param {number} n
 * @returns {string}
 */
function fmtNum(n) {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

/**
 * Coerce a raw form field to a finite number; blank / NaN → 0.
 *
 * @param {string|number|null|undefined} v
 * @returns {number}
 */
export function toNum(v) {
  if (isBlank(v)) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sum an array of raw quarterly values.
 *
 * @param {Array<string|number|null|undefined>} quarters - e.g. [q1, q2, q3, q4]
 * @returns {number}
 */
export function sumQuarters(quarters) {
  return (quarters || []).reduce((acc, q) => acc + toNum(q), 0);
}

/**
 * Compare the sum of quarterly values against an annual total and return a
 * human-readable warning when they diverge beyond `epsilon`. Returns `null`
 * when they match, when the annual total is blank (nothing to compare against),
 * or when all quarters are blank (form not filled yet).
 *
 * @param {Array<string|number|null|undefined>} quarters - [q1, q2, q3, q4]
 * @param {string|number|null|undefined} annual - the annual/overall total
 * @param {{ epsilon?: number, unit?: string }} [opts]
 *        epsilon: tolerance for the equality check (default 0.01)
 *        unit: optional suffix appended to numbers in the message (e.g. 'USD')
 * @returns {string|null} warning text, or null when coherent / not comparable
 * @example
 * quarterlyVsAnnualWarning(['10','20','30','40'], '100');        // → null
 * quarterlyVsAnnualWarning(['10','20','30','40'], '90');         // → "…sum to 100…annual target is 90…"
 */
export function quarterlyVsAnnualWarning(quarters, annual, opts = {}) {
  const epsilon = opts.epsilon ?? 0.01;
  const unit = opts.unit ? ` ${opts.unit}` : '';

  // Nothing meaningful to compare yet: no annual total, or no quarters filled.
  const allQuartersBlank = (quarters || []).every(isBlank);
  if (isBlank(annual) || allQuartersBlank) return null;

  const annualNum = toNum(annual);
  const total = sumQuarters(quarters);
  const diff = total - annualNum;
  if (Math.abs(diff) <= epsilon) return null;

  const direction = diff > 0 ? 'exceed' : 'fall short of';
  return `The four quarterly values sum to ${fmtNum(total)}${unit}, which ${direction} the total of ${fmtNum(annualNum)}${unit} by ${fmtNum(Math.abs(diff))}${unit}.`;
}
