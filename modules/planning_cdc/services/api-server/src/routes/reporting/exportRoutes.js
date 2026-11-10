// ── Reporting: In-App Authenticated Exports (XLSX / CSV) ──
//
// Backlog VH-5. Authenticated, RBAC-gated downloads of the canonical reports.
// Unlike the API-key public endpoint (routes/public/quarterlyReportExportRoutes),
// these are for logged-in users and are gated by the dynamic RBAC matrix
// (`<module>:export`) with row-level scope: a user may only export the division
// data their scope allows (own/division/directorate → their assigned divisions;
// all → everything). Mounted under /api/reporting (see reportingRoutes.js).
'use strict';

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const { authorize } = require('../../middleware/rbacMiddleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const {
  buildQuarterlyReportRows,
  headersFor,
} = require('../../services/reporting/quarterlyReportExportService');
const {
  buildWorkplanRows,
  buildPirsRows,
  WORKPLAN_HEADERS,
  PIRS_HEADERS,
} = require('../../services/reporting/planExportService');
const {
  buildActivityReportRows,
  ACTIVITY_REPORT_HEADERS,
} = require('../../services/reporting/activityReportExportService');
const {
  buildDonorRows,
  DONOR_HEADERS,
} = require('../../services/reporting/donorExportService');
const {
  headersOrFallback,
  sendExport,
  parseExportQuery,
  scopedDivFilter,
} = require('./_exportHelpers');

router.use(authenticateToken);

/**
 * GET /api/reporting/exports/quarterly-report
 *   ?fiscal_year=2026 &quarter=Q1 &format=xlsx|csv &division=WD,PH (optional)
 *
 * Gated by quarterly_report:export. The export is scoped: non-`all` users only
 * get their assigned divisions' rows, even if they request others.
 */
router.get(
  '/exports/quarterly-report',
  authorize({ module: RBAC_MODULES.QUARTERLY_REPORT, action: RBAC_ACTIONS.EXPORT }),
  asyncHandler(async (req, res) => {
    const { fiscalYear, format, requested } = parseExportQuery(req);
    const quarter = String(req.query.quarter || 'Q1').toUpperCase();
    const { divFilter, scopedEmpty } = await scopedDivFilter(req, requested);

    const rows = scopedEmpty ? [] : await buildQuarterlyReportRows({ fiscalYear, quarter, divFilter });
    return sendExport(res, {
      format,
      rows,
      headers: headersFor(rows, fiscalYear, quarter),
      baseName: `quarterly-report-${fiscalYear}-${quarter}`,
      sheetName: `${quarter} ${fiscalYear}`,
    });
  }),
);

/**
 * GET /api/reporting/exports/workplan
 *   ?fiscal_year=2026 &format=xlsx|csv &division=WD (optional)
 *
 * Gated by workplan:export. Broad + specific activities with budgets, scoped.
 */
router.get(
  '/exports/workplan',
  authorize({ module: RBAC_MODULES.WORKPLAN, action: RBAC_ACTIONS.EXPORT }),
  asyncHandler(async (req, res) => {
    const { fiscalYear, format, requested } = parseExportQuery(req);
    const { divFilter, scopedEmpty } = await scopedDivFilter(req, requested);

    const rows = scopedEmpty ? [] : await buildWorkplanRows({ fiscalYear, divFilter });
    return sendExport(res, {
      format,
      rows,
      headers: headersOrFallback(rows, WORKPLAN_HEADERS),
      baseName: `workplan-${fiscalYear}`,
      sheetName: `Workplan ${fiscalYear}`,
    });
  }),
);

/**
 * GET /api/reporting/exports/pirs
 *   ?fiscal_year=2026 &format=xlsx|csv &division=WD (optional)
 *
 * Gated by pirs:export. Indicator reference sheet (PIRS), scoped by division.
 */
router.get(
  '/exports/pirs',
  authorize({ module: RBAC_MODULES.PIRS, action: RBAC_ACTIONS.EXPORT }),
  asyncHandler(async (req, res) => {
    const { fiscalYear, format, requested } = parseExportQuery(req);
    const { divFilter, scopedEmpty } = await scopedDivFilter(req, requested);

    const rows = scopedEmpty ? [] : await buildPirsRows({ fiscalYear, divFilter });
    return sendExport(res, {
      format,
      rows,
      headers: headersOrFallback(rows, PIRS_HEADERS),
      baseName: `pirs-indicators-${fiscalYear}`,
      sheetName: `PIRS ${fiscalYear}`,
    });
  }),
);

/**
 * GET /api/reporting/exports/activity-report
 *   ?fiscal_year=2026 &quarter=Q1 (optional) &format=xlsx|csv &division=WD (optional)
 *
 * Gated by activity_report:export. Division activity (narrative) reports, scoped.
 */
router.get(
  '/exports/activity-report',
  authorize({ module: RBAC_MODULES.ACTIVITY_REPORT, action: RBAC_ACTIONS.EXPORT }),
  asyncHandler(async (req, res) => {
    const { fiscalYear, format, requested } = parseExportQuery(req);
    const quarter = req.query.quarter ? String(req.query.quarter).toUpperCase() : undefined;
    const { divFilter, scopedEmpty } = await scopedDivFilter(req, requested);

    const rows = scopedEmpty ? [] : await buildActivityReportRows({ fiscalYear, quarter, divFilter });
    return sendExport(res, {
      format,
      rows,
      headers: headersOrFallback(rows, ACTIVITY_REPORT_HEADERS),
      baseName: `activity-reports-${fiscalYear}${quarter ? `-${quarter}` : ''}`,
      sheetName: `Activity reports ${fiscalYear}`,
    });
  }),
);

/**
 * GET /api/reporting/exports/donor
 *   ?fiscal_year=2026 &funding_source=Japan%20Funds (optional) &grant=... (optional)
 *   &format=xlsx|csv &division=WD (optional)
 *
 * Gated by workplan:export (donor data lives on workplan activities). Flat list
 * of broad/specific activities matching the funding source / grant, scoped.
 */
router.get(
  '/exports/donor',
  authorize({ module: RBAC_MODULES.WORKPLAN, action: RBAC_ACTIONS.EXPORT }),
  asyncHandler(async (req, res) => {
    const { fiscalYear, format, requested } = parseExportQuery(req);
    const fundingSource = req.query.funding_source ? String(req.query.funding_source).trim() : undefined;
    const grant = req.query.grant ? String(req.query.grant).trim() : undefined;
    const { divFilter, scopedEmpty } = await scopedDivFilter(req, requested);

    const rows = scopedEmpty ? [] : await buildDonorRows({ fiscalYear, divFilter, fundingSource, grant });
    const slug = (fundingSource || grant || 'all').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return sendExport(res, {
      format,
      rows,
      headers: headersOrFallback(rows, DONOR_HEADERS),
      baseName: `donor-${slug}-${fiscalYear}`,
      sheetName: `Donor ${fiscalYear}`,
    });
  }),
);

module.exports = router;
