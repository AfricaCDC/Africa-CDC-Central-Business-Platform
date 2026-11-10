// ── CBP import outcome copy (D-20260713-01) ──
//
// Pure helpers for the "Import CBP users" toast text. Kept out of the component
// file so that file exports only components (react-refresh).

const FALLBACK_ERROR = 'CBP import failed. Please try again.';
const GATEWAY_TIMEOUT_MESSAGE = 'The server did not answer in time. The import may still complete; refresh the list in a minute.';

/**
 * Map a failed import request to a human-readable message. Never returns the
 * raw error object.
 *
 * @param {unknown} err — axios error (or anything thrown by the mutation)
 * @returns {string} message safe to show in a toast
 * @example describeCbpImportError({ response: { status: 409, data: { message: 'busy' } } }) // 'busy'
 */
export function describeCbpImportError(err) {
  const data = err?.response?.data;
  // Gateway-generated 502/504 (nginx timed out or lost the backend) carries BAD_GATEWAY.
  if (data?.code === 'BAD_GATEWAY') return GATEWAY_TIMEOUT_MESSAGE;
  const msg = data?.message;
  return typeof msg === 'string' && msg.trim() ? msg : FALLBACK_ERROR;
}

/**
 * Build the success toast text from an import summary.
 *
 * @param {{inserted?:number, updated?:number, skipped?:number, eligible?:number, divisions_filled?:number}} summary
 * @returns {string}
 * @example formatCbpImportSummary({ inserted: 2, updated: 1, skipped: 3, eligible: 6, divisions_filled: 1 })
 */
export function formatCbpImportSummary(summary) {
  const { inserted = 0, updated = 0, skipped = 0, eligible = 0, divisions_filled = 0 } = summary || {};
  const base = `CBP import: ${inserted} created, ${updated} completed, ${skipped} already up to date (${eligible} CBP accounts scanned)`;
  return divisions_filled > 0 ? `${base}, ${divisions_filled} placed in their CBP division` : base;
}
