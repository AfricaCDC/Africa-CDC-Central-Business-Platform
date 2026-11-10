// ── Reporting export route helpers ──
//
// Shared request/scope/encoding helpers for routes/reporting/exportRoutes.js.
// Extracted so the route file stays focused on route definitions (CHARTER §1
// file-size limits). Pure-ish: only resolveAllowedDivisionCodes / scopedDivFilter
// touch the DB (via the user-divisions resolver).
'use strict';

const knex = require('../../config/db');
const { getUserDivisionCodes, ALL_ROLES } = require('@rbm/lib/user-divisions');
const { toCsv, toXlsxBuffer } = require('../../services/reporting/quarterlyReportExportService');

const UTF8_BOM = String.fromCharCode(0xfeff);

/** Header set for an export: row keys when present, else the supplied fallback. */
function headersOrFallback(rows, fallback) {
  return rows.length ? Object.keys(rows[0]) : fallback;
}

/**
 * Resolve the set of owner division codes a user is allowed to export, given
 * their RBAC scope. `all` → null (no restriction). Any narrower scope → the
 * union of the user's assigned division codes (fail-closed). An empty array
 * means "scoped but no divisions" → exporter sees nothing.
 *
 * @param {object} req - express req (req.user, req.rbac.scope)
 * @returns {Promise<string[]|null>} uppercased codes, or null for unrestricted
 */
async function resolveAllowedDivisionCodes(req) {
  const scope = req.rbac?.scope;
  if (scope === 'all') return null;

  let codes = await getUserDivisionCodes(knex, req.user.id, { roles: ALL_ROLES });
  if (!codes.length && req.user.division_code) codes = [req.user.division_code];
  return [...new Set(codes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))];
}

/**
 * Intersect a requested division filter with the user's allowed set.
 * - allowed === null (scope all): honour the requested filter as-is.
 * - otherwise: keep only requested codes inside the allowed set; if no filter
 *   was requested, default to the full allowed set.
 *
 * @param {string[]} requested - uppercased requested codes
 * @param {string[]|null} allowed
 * @returns {string[]} effective owner-division filter (empty = all when allowed===null)
 */
function effectiveDivFilter(requested, allowed) {
  if (allowed === null) return requested;
  if (!requested.length) return allowed;
  const allowedSet = new Set(allowed);
  return requested.filter((c) => allowedSet.has(c));
}

/** Send rows as an attachment in the requested format (xlsx default, or csv). */
async function sendExport(res, { format, rows, headers, baseName, sheetName }) {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`);
    return res.send(UTF8_BOM + toCsv(rows, headers));
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
  // toXlsxBuffer is async since the exceljs styling rewrite (D-20260713-03).
  return res.send(await toXlsxBuffer(rows, headers, sheetName));
}

/** Parse the request's fiscal_year + format + division query into normalized values. */
function parseExportQuery(req) {
  const fiscalYear = String(req.query.fiscal_year || new Date().getFullYear()).trim();
  const format = (req.query.format || 'xlsx').toLowerCase();
  const rawDiv = req.query.division || req.query.division_code;
  const requested = (Array.isArray(rawDiv) ? rawDiv : (rawDiv ? String(rawDiv).split(',') : []))
    .map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  return { fiscalYear, format, requested };
}

/**
 * Resolve the scoped owner-division filter for this request.
 *
 * @param {object} req
 * @param {string[]} requested
 * @returns {Promise<{ divFilter: string[], scopedEmpty: boolean }>}
 */
async function scopedDivFilter(req, requested) {
  const allowed = await resolveAllowedDivisionCodes(req);
  const divFilter = effectiveDivFilter(requested, allowed);
  // Scoped (non-`all`) user with zero divisions in range → nothing to export.
  return { divFilter, scopedEmpty: allowed !== null && divFilter.length === 0 };
}

module.exports = {
  headersOrFallback,
  resolveAllowedDivisionCodes,
  effectiveDivFilter,
  sendExport,
  parseExportQuery,
  scopedDivFilter,
};
