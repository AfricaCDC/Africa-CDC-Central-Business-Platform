// ── Public: PIRS and Big Tickets exports ──
//
// API-key gated endpoints for external consumers (Excel Power Query,
// Power BI, sister apps), next to /api/public/workplan (D-20261026-03):
//   · GET /api/public/pirs        — scope pirs:read
//   · GET /api/public/big-tickets — scope big_tickets:read
//
// Rows are the in-app exports' rows (services/reporting/planExportService
// and services/bigTickets/bigTicketsExport), published data only: indicators
// in a public status, Big Ticket reports neither draft nor returned.
'use strict';

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { apiKeyAuth } = require('../../middleware/apiKeyAuth');
const { PUBLIC_STATUSES } = require('../plan-nodes/_helpers');
const { buildPirsRows, PIRS_HEADERS } = require('../../services/reporting/planExportService');
const { toCsv } = require('../../services/reporting/quarterlyReportExportService');
const { bigTicketsExport, defaultQuarter } = require('../../services/bigTickets/bigTicketsExport');

// UTF-8 byte-order mark so Excel opens the CSV with correct encoding.
const UTF8_BOM = String.fromCharCode(0xfeff);
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const YEAR = /^\d{4}$/;

const fail = (res, message) => res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message });

/** Shared query parameters: fiscal year (default current), format, division list. */
function parseCommon(query) {
  const fiscalYear = String(query.fiscal_year || new Date().getUTCFullYear()).trim();
  if (!YEAR.test(fiscalYear)) return { error: 'fiscal_year must be a 4-digit year' };
  const format = String(query.format || 'json').toLowerCase();
  if (!['json', 'csv'].includes(format)) return { error: 'format must be "json" or "csv"' };
  const rawDiv = query.division || query.division_code;
  const divFilter = (Array.isArray(rawDiv) ? rawDiv : (rawDiv ? String(rawDiv).split(',') : []))
    .map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  return { fiscalYear, format, divFilter };
}

/** JSON envelope, or a CSV attachment named `${name}.csv`. */
function respond(res, { format, name, headers, rows, meta }) {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    return res.send(UTF8_BOM + toCsv(rows, headers));
  }
  return res.json({ success: true, meta: { ...meta, rows: rows.length }, data: rows });
}

/**
 * Indicator reference sheet: outcome areas and their published indicators.
 *
 * @name GET /api/public/pirs
 * @param {express.Request} req - query `fiscal_year`, `division` (CSV of codes), `format` json|csv
 * @param {express.Response} res - 200 `{ success, meta, data }` or CSV; 400 bad parameter; 401/403 key
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/public/pirs?fiscal_year=2026&division=EPR&format=csv
 */
router.get('/pirs', apiKeyAuth(['pirs:read']), asyncHandler(async (req, res) => {
  const { fiscalYear, format, divFilter, error } = parseCommon(req.query);
  if (error) return fail(res, error);
  const rows = await buildPirsRows({ fiscalYear, divFilter, statuses: PUBLIC_STATUSES });
  return respond(res, {
    format, rows, headers: PIRS_HEADERS, name: `pirs-${fiscalYear}`, meta: { fiscal_year: fiscalYear },
  });
}));

/**
 * Big Tickets: one row per indicator line of every ticket running in the year,
 * with the chosen quarter's published report.
 *
 * @name GET /api/public/big-tickets
 * @param {express.Request} req - query `fiscal_year`, `quarter` Q1..Q4 (default latest with reports), `format` json|csv
 * @param {express.Response} res - 200 `{ success, meta, data }` or CSV; 400 bad parameter; 401/403 key
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/public/big-tickets?fiscal_year=2026&quarter=Q3
 */
router.get('/big-tickets', apiKeyAuth(['big_tickets:read']), asyncHandler(async (req, res) => {
  const { fiscalYear, format, error } = parseCommon(req.query);
  if (error) return fail(res, error);
  const quarter = req.query.quarter ? String(req.query.quarter).toUpperCase() : await defaultQuarter(fiscalYear);
  if (!QUARTERS.includes(quarter)) return fail(res, 'quarter must be Q1, Q2, Q3 or Q4');
  const { headers, rows } = await bigTicketsExport({ fiscalYear, quarter });
  return respond(res, {
    format, rows, headers, name: `big-tickets-${fiscalYear}-${quarter}`, meta: { fiscal_year: fiscalYear, quarter },
  });
}));

module.exports = router;
