// ── Reporting: Division Quarterly Summary (VH-6 / D-1) ──
//
// Authenticated, RBAC-gated. Returns the per-division quarterly summary
// (owned + contributed indicators, KPIs, narrative activity report) and an
// in-app XLSX/CSV export of the indicator detail. Gated by quarterly_report
// (read / export) with row-level scope: a non-`all` user may only read or
// export a division within their assigned set. Mounted under /api/reporting.
'use strict';

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const { authorize } = require('../../middleware/rbacMiddleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const {
  getDivisionQuarterlySummary,
  buildDivisionSummaryRows,
  SUMMARY_HEADERS,
} = require('../../services/reporting/summaryReportService');
const { buildDivisionQuarterlyDeck } = require('../../services/reporting/divisionDeckService');
const {
  headersOrFallback,
  sendExport,
  resolveAllowedDivisionCodes,
} = require('./_exportHelpers');

router.use(authenticateToken);

/**
 * Enforce row-level scope: a non-`all` user may only touch a division within
 * their assigned set. Returns the normalized code, or null after sending 403.
 * @private
 */
async function resolveScopedDivision(req, res) {
  const code = String(req.params.divisionCode || '').trim().toUpperCase();
  if (!code) {
    res.status(400).json({ success: false, message: 'Division code is required', code: 'VALIDATION_FAILED' });
    return null;
  }
  const allowed = await resolveAllowedDivisionCodes(req);
  if (allowed !== null && !allowed.includes(code)) {
    res.status(403).json({ success: false, message: 'You do not have access to this division', code: 'FORBIDDEN' });
    return null;
  }
  return code;
}

/** Common query parsing: fiscal_year + quarter. */
function parseSummaryQuery(req) {
  const fiscalYear = String(req.query.fiscal_year || new Date().getFullYear()).trim();
  const quarter = String(req.query.quarter || 'Q1').toUpperCase();
  return { fiscalYear, quarter };
}

/**
 * GET /api/reporting/division-quarterly-reports/:divisionCode
 *   ?fiscal_year=2026 &quarter=Q1
 *
 * Gated by quarterly_report:read (scoped).
 */
router.get(
  '/division-quarterly-reports/:divisionCode',
  authorize({ module: RBAC_MODULES.QUARTERLY_REPORT, action: RBAC_ACTIONS.READ }),
  asyncHandler(async (req, res) => {
    const code = await resolveScopedDivision(req, res);
    if (!code) return undefined;
    const { fiscalYear, quarter } = parseSummaryQuery(req);
    const data = await getDivisionQuarterlySummary({ divisionCode: code, fiscalYear, quarter });
    return res.json({ success: true, data });
  }),
);

/**
 * GET /api/reporting/division-quarterly-reports/:divisionCode/export
 *   ?fiscal_year=2026 &quarter=Q1 &format=xlsx|csv|pptx
 *
 * Gated by quarterly_report:export (scoped). Indicator detail as XLSX/CSV,
 * or the full summary as a PPTX slide deck (D-2). PDF is intentionally NOT
 * offered here — it needs the browser-based engine gated behind the retired
 * PDF microservice decision (D-20260415-08); see ADR-0001-slide-deck-engine.
 */
router.get(
  '/division-quarterly-reports/:divisionCode/export',
  authorize({ module: RBAC_MODULES.QUARTERLY_REPORT, action: RBAC_ACTIONS.EXPORT }),
  asyncHandler(async (req, res) => {
    const code = await resolveScopedDivision(req, res);
    if (!code) return undefined;
    const { fiscalYear, quarter } = parseSummaryQuery(req);
    const format = (req.query.format || 'xlsx').toLowerCase();

    if (format === 'pptx') {
      const { buffer, filename, mime } = await buildDivisionQuarterlyDeck({ divisionCode: code, fiscalYear, quarter });
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    }

    const rows = await buildDivisionSummaryRows({ divisionCode: code, fiscalYear, quarter });
    return sendExport(res, {
      format,
      rows,
      headers: headersOrFallback(rows, SUMMARY_HEADERS),
      baseName: `division-summary-${code}-${fiscalYear}-${quarter}`,
      sheetName: `${code} ${quarter} ${fiscalYear}`,
    });
  }),
);

module.exports = router;
