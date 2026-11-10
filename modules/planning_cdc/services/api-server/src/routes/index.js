const express = require('express');
const router = express.Router();

// Auth
router.use('/auth', require('./authRoutes'));

// Admin & Reference Data
router.use('/admin', require('./adminRoutes'));

// Admin — user ↔ division assignments (multi-division CRUD)
router.use('/admin', require('./userDivisionRoutes'));

// Service-to-service sync (D-03): POST /api/admin/sync-staff
router.use('/admin', require('./syncRoutes'));

// App settings (D-20260707-01): GET/PUT /api/admin/settings
router.use('/admin', require('./admin/settingsRoutes'));

// CBP staff import (D-20260713-01): POST /api/admin/import-cbp-users
router.use('/admin', require('./admin/cbpImportRoutes'));

// Data health checks (D-20261105-11): GET /api/admin/data-health
router.use('/admin', require('./admin/dataHealthRoutes'));
router.use('/admin', require('./admin/adoptionRoutes')); // Adoption (D-20261106-03)

// Global search of the top bar (D-20261106-05): GET /api/search
router.use('/search', require('./searchRoutes'));

// AHSS pillars reference (D-20260714-03): GET /api/pillars
router.use('/pillars', require('./pillarsRoutes'));

// Notification Wizard admin (D-20260417-01): subs / events / templates / test-send
router.use('/admin/notifications', require('./notificationAdminRoutes'));

// Governance (approvals, audit, notifications, snapshots)
router.use('/governance', require('./governanceRoutes'));
router.use('/governance', require('./workflowRoutes'));
router.use('/governance', require('./contributorApprovalRoutes'));

// Staff (CBP integration)
router.use('/staff', require('./staffRoutes'));

// Plan Hierarchy (new unified tree)
router.use('/plan-nodes', require('./planNodeRoutes'));

// Budget Codes (linked to plan_nodes broad activities)
router.use('/budget-codes', require('./budgetCodeRoutes'));

// Activity Reports (linked to plan_nodes specific activities)
router.use('/activity-reports', require('./activityReportRoutes'));

// Dashboard
router.use('/dashboard', require('./dashboardRoutes'));

// Reporting (actuals / periods)
router.use('/reporting', require('./reportingRoutes'));

// Big Tickets — leadership priorities (D-20261015-02)
router.use('/big-tickets', require('./bigTicketReportRoutes'));
router.use('/big-tickets', require('./bigTicketRoutes'));

// Budget execution from the MIS export (D-20261015-04)
router.use('/budget-execution', require('./budgetExecutionRoutes'));
router.use('/indicator-mapping', require('./indicatorMappingRoutes'));
router.use('/activity-planning', require('./activityPlanningRoutes'));
router.use('/country-workplan', require('./countryWorkplanRoutes'));

// Per-user data (notification bell, to-do inbox)
// Onboarding tour state (D-20261105-16): GET/PUT /api/me/tour
router.use('/me', require('./me/tourRoutes'));
router.use('/me', require('./meRoutes'));

// Out-of-office delegation of approvals (D-20261105-09)
router.use('/delegations', require('./delegationRoutes'));

// Monthly digest for directors (D-20261105-15): GET /api/digest
router.use('/digest', require('./digestRoutes'));

// Decide an approval step from its email (D-20261105-10)
router.use('/approvals', require('./approvalStepRoutes'));

// Reference suggestion lists (funding sources, grants — H-3 comboboxes)
router.use('/reference', require('./referenceRoutes'));

module.exports = router;
