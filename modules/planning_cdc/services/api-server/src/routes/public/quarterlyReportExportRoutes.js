// ── Public: Quarterly Report Export ──
//
// API-key gated endpoint for external consumers (Excel Power Query,
// partners, PowerPoint linked-data pipelines). Returns one row per
// (indicator × owner division) for a given fiscal year with the
// 18-column shape from the canonical PRA report xlsx.
//
// Auth: X-API-Key header (or ?api_key= query fallback).
// Response: JSON by default, CSV with ?format=csv.
//
// The row aggregation lives in services/reporting/quarterlyReportExportService.js
// so this external endpoint and the in-app authenticated export
// (routes/reporting/exportRoutes.js) return byte-for-byte identical rows.
'use strict';

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { apiKeyAuth } = require('../../middleware/apiKeyAuth');
const {
  buildQuarterlyReportRows,
  toCsv,
  headersFor,
} = require('../../services/reporting/quarterlyReportExportService');

const SCOPE = 'report_export:read';
// UTF-8 byte-order mark so Excel opens the CSV with correct encoding.
const UTF8_BOM = String.fromCharCode(0xfeff);

/**
 * GET /api/public/exports/quarterly-report
 *   ?fiscal_year=2026
 *   &quarter=Q1
 *   &division=WD           (optional, CSV of codes)
 *   &format=json|csv       (default json)
 *
 * Accepts X-API-Key header OR ?api_key= query param.
 */
router.get('/quarterly-report', apiKeyAuth([SCOPE]), asyncHandler(async (req, res) => {
  const fiscalYear = String(req.query.fiscal_year || new Date().getFullYear()).trim();
  const quarter = String(req.query.quarter || 'Q1').toUpperCase();
  const rawDiv = req.query.division || req.query.division_code;
  const divFilter = (Array.isArray(rawDiv) ? rawDiv : (rawDiv ? String(rawDiv).split(',') : []))
    .map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  const format = (req.query.format || 'json').toLowerCase();

  // Partners see published indicators and approved reports only (D-20261108-02).
  const rows = await buildQuarterlyReportRows({ fiscalYear, quarter, divFilter, publicOnly: true });
  return respond(res, { format, rows, fiscalYear, quarter });
}));

function respond(res, { format, rows, fiscalYear, quarter }) {
  if (format === 'csv') {
    const headers = headersFor(rows, fiscalYear, quarter);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="quarterly-report-${fiscalYear}-${quarter}.csv"`);
    res.send(UTF8_BOM + toCsv(rows, headers));
    return;
  }
  res.json({ success: true, meta: { fiscal_year: fiscalYear, quarter, rows: rows.length }, data: rows });
}

module.exports = router;
