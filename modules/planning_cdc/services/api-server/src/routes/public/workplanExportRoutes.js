// ── Public: Workplan Export ──
//
// API-key gated endpoint (scope workplan:read) for external consumers
// (Excel Power Query, Power BI, sister apps of the Africa CDC suite).
// Returns the workplan tree — T3/T4 indicators with their broad and
// specific activities — as JSON (default) or a flat CSV (?format=csv,
// one row per specific activity).
//
// Auth: X-API-Key header, Authorization Bearer/Basic, or ?api_key=
// query fallback (see middleware/apiKeyAuth.js). Only PUBLIC statuses
// are exposed — pending/rejected/cancelled rows never leave the app.
//
// Tree building lives in services/reporting/workplanTreeExportService.js.
'use strict';

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { apiKeyAuth } = require('../../middleware/apiKeyAuth');
const {
  buildWorkplanTree,
  flattenWorkplanTree,
  workplanCsv,
} = require('../../services/reporting/workplanTreeExportService');

const SCOPE = 'workplan:read';
// UTF-8 byte-order mark so Excel opens the CSV with correct encoding.
const UTF8_BOM = String.fromCharCode(0xfeff);
const VALID_TIERS = new Set([3, 4]);

/**
 * Parse + validate the query string into service filters.
 *
 * @param {object} query - req.query
 * @returns {{ fiscalYear: string, divFilter: string[], tiers: number[], format: string, error?: string }}
 */
function parseParams(query) {
  const fiscalYear = String(query.fiscal_year || new Date().getFullYear()).trim();

  const rawDiv = query.division || query.division_code;
  const divFilter = (Array.isArray(rawDiv) ? rawDiv : (rawDiv ? String(rawDiv).split(',') : []))
    .map((c) => String(c).trim().toUpperCase()).filter(Boolean);

  const tiers = query.tier
    ? String(query.tier).split(',').map((t) => parseInt(t.trim(), 10)).filter(Boolean)
    : [3, 4];
  if (!tiers.length || tiers.some((t) => !VALID_TIERS.has(t))) {
    return { error: 'tier must be 3, 4 or "3,4"' };
  }

  const format = String(query.format || 'json').toLowerCase();
  if (!['json', 'csv'].includes(format)) {
    return { error: 'format must be "json" or "csv"' };
  }
  return { fiscalYear, divFilter, tiers, format };
}

/**
 * GET /api/public/workplan
 *   ?fiscal_year=2026        (default: current year)
 *   &division=CT,SCI         (optional, CSV of responsible-division codes)
 *   &tier=3,4                (optional, default both)
 *   &format=json|csv         (default json; csv = one row per specific activity)
 *
 * @returns 200 `{ success, meta, data }` or CSV attachment; 400 on bad tier/format
 */
router.get('/workplan', apiKeyAuth([SCOPE]), asyncHandler(async (req, res) => {
  const { fiscalYear, divFilter, tiers, format, error } = parseParams(req.query);
  if (error) {
    return res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: error });
  }

  const { meta, data } = await buildWorkplanTree({ fiscalYear, tiers, divFilter });

  if (format === 'csv') {
    const rows = flattenWorkplanTree(data);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="workplan-${fiscalYear}.csv"`);
    return res.send(UTF8_BOM + workplanCsv(rows));
  }
  return res.json({ success: true, meta, data });
}));

module.exports = router;
