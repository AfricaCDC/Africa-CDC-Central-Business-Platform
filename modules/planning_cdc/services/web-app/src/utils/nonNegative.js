// ── Non-negative number inputs (D-20261013-11) ──
// Results, counts and amounts never go below zero: the minus key is blocked
// and a pasted negative value is dropped.

const BLOCKED_KEYS = new Set(['-', '+', 'e', 'E']);

/**
 * onKeyDown for a number input: stops "-", "+" and the exponent "e".
 * @param {KeyboardEvent} e
 * @returns {void}
 * @example <input type="number" min="0" onKeyDown={blockNegativeKeys} />
 */
export function blockNegativeKeys(e) {
  if (BLOCKED_KEYS.has(e.key)) e.preventDefault();
}

/**
 * The typed value, or '' when it is negative (e.g. pasted "-100").
 * @param {string} value
 * @returns {string}
 * @example nonNegative('-100') // ''
 */
export function nonNegative(value) {
  const n = Number(value);
  return value !== '' && Number.isFinite(n) && n < 0 ? '' : value;
}
