/* eslint-disable complexity --
 * Pre-existing legacy debt carried verbatim from planNodeRoutes.js
 * (task #29). complexity: PATCH handler = 13 — validation branches +
 * RBAC gate + field-presence checks.
 * Pragma is a ceiling — do NOT grow the file or add new violations.
 */

// ── Plan-Nodes Broad Activity Routes ──
//
// Extracted from `services/api-server/src/routes/planNodeRoutes.js` as
// part of the task #29 split. One admin-only endpoint:
//   PATCH /broad-activity/:id — update division ownership fields
//
// Mounted at `/api/plan-nodes` via the parent aggregator — URL paths
// identical to pre-split.

const router = require('express').Router();
const { authenticateToken } = require('../../middleware/authMiddleware');
const {
  knex,
  log,
  enrichNode,
  canEditIndicators,
  envelopeError,
} = require('./_helpers');

router.use(authenticateToken);

// PATCH /plan-nodes/broad-activity/:id — admin/ME update for BROAD_ACTIVITY ownership
/**
 * Update a BROAD_ACTIVITY's division ownership fields (responsible, contributing, title).
 *
 * @name PATCH /api/plan-nodes/broad-activity/:id
 * @param {express.Request} req — path param `id`, body with optional responsible_division_code, contributing_divisions, title
 * @param {express.Response} res — 200 JSON enriched broad-activity row, 400/403/404 on validation/auth/missing
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * PATCH /api/plan-nodes/broad-activity/55 { responsible_division_code: "PHI" }
 */
router.patch('/broad-activity/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return envelopeError(res, 400, 'invalid id');

    if (!await canEditIndicators(req.user)) {
      return envelopeError(res, 403, 'You do not have permission to edit broad activities');
    }

    const row = await knex('plan_nodes').where('id', id).first();
    if (!row || row.node_type !== 'BROAD_ACTIVITY') {
      return envelopeError(res, 404, 'broad activity not found');
    }

    const b = req.body;
    const patch = {};
    if (b.responsible_division_code !== undefined) patch.responsible_division_code = b.responsible_division_code || null;
    if (b.contributing_divisions !== undefined) {
      patch.contributing_divisions = Array.isArray(b.contributing_divisions) ? JSON.stringify(b.contributing_divisions) : null;
    }
    // plan_nodes.title is NOT NULL — `b.title || null` turned an empty string
    // into null and threw a raw DB constraint error (cleaning bug PN-1).
    if (b.title !== undefined) {
      if (!b.title || !String(b.title).trim()) return envelopeError(res, 400, 'title cannot be empty');
      patch.title = String(b.title).trim();
    }

    if (Object.keys(patch).length === 0) {
      return envelopeError(res, 400, 'No fields to update');
    }

    patch.updated_at = new Date();
    await knex('plan_nodes').where('id', id).update(patch);

    const updated = await enrichNode(await knex('plan_nodes').where('id', id).first());
    res.json(updated);
  } catch (err) {
    log.error('plan_nodes.broad_activity_update_failed', { err: err.message, id: req.params.id });
    envelopeError(res, 500, err.message);
  }
});

module.exports = router;
