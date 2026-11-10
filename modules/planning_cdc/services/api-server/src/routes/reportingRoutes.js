// ── Reporting Routes — Parent Aggregator ──
//
// Post task #27 split, this file is a pure mount point for the six
// reporting sub-routers. Every route handler has been extracted into
// ./reporting/*.js — the parent no longer carries any pragma,
// middleware, or business logic.
//
// Sub-router layout (mount order preserved from pre-split):
//   1. periodsRoutes            (D-20260418-11, commit 4/N)
//   (actualsRoutes and divisionRoutes were removed with the legacy
//   actuals and division narratives, D-20261106-14)
//   4. disaggregationsRoutes    (D-20260418-14, commit 7/N)
//   5. activityReportsRoutes    (D-20260418-15, commit 8/N)
//   6. evidenceRoutes           (D-20260418-16, commit 9/N)
//
// All sub-routers mount their own `authenticateToken` — the parent
// does not wrap them at this level.

const router = require('express').Router();

router.use(require('./reporting/periodsRoutes'));
router.use(require('./reporting/disaggregationsRoutes'));
router.use(require('./reporting/activityReportsRoutes'));
router.use(require('./reporting/activityReportPreparerRoutes'));
router.use(require('./reporting/evidenceRoutes'));
router.use(require('./reporting/quarterlyDashboardRoutes'));
// Before the report routes: its own authenticateToken (D-20261105-12).
router.use(require('./reporting/indicatorEvidenceRoutes'));
router.use(require('./reporting/indicatorDivisionReportRoutes'));
router.use(require('./reporting/draftReminderRoutes'));
router.use(require('./reporting/deadlineReminderRoutes'));
router.use(require('./reporting/exportRoutes'));
router.use(require('./reporting/divisionQuarterlySummaryRoutes'));

module.exports = router;
