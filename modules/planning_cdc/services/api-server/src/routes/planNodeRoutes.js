// ── Plan-Node Routes — Aggregator Facade ──
//
// Formerly a 1134L monolith. Decomposed into focused sub-routers under
// `./plan-nodes/` as part of task #29 (behaviour-neutral extraction).
//
// Sub-routers:
//   activityFocal.js      — GET /division-staff/:code + focal-person helpers
//   reads.js              — GET / (list), GET /:idOrCode (detail), GET /:id/tree (subtree)
//   specificActivities.js — POST/PATCH/DELETE specific-activity CRUD + approval workflow
//   indicators.js         — PUT/POST indicator admin endpoints
//   broadActivities.js    — PATCH broad-activity ownership update
//
// Shared helpers, constants, and enrichment live in `./plan-nodes/_helpers.js`.
//
// Mounted at `/api/plan-nodes` by the top-level app router — URL paths
// identical to pre-split.

const router = require('express').Router();

router.use(require('./plan-nodes/activityFocal').router);
router.use(require('./plan-nodes/reads'));
router.use(require('./plan-nodes/specificActivities'));
router.use(require('./plan-nodes/indicators'));
router.use(require('./plan-nodes/broadActivities'));

module.exports = router;
