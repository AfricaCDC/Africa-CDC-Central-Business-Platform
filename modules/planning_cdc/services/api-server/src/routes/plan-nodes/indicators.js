/* eslint-disable complexity, max-lines --
 * Pre-existing legacy debt carried verbatim from planNodeRoutes.js
 * (task #29). complexity: PUT handler = 31 (field-mapping branches),
 * POST handler = 17 (validation + field mapping).
 * max-lines: 205 (8 over) — cohesive OUTCOME_INDICATOR admin file: PUT/POST/DELETE
 * + the private syncActivePeriods helper share the same field-mapping vocabulary;
 * splitting produces 3 mutually-coupled fragments for zero clarity gain
 * (CLAUDE.md sanctions max-lines on cohesive admin files).
 * Pragma is a ceiling — do NOT grow the file or add new violations.
 */

// ── Plan-Nodes Indicator Routes ──
//
// Extracted from `services/api-server/src/routes/planNodeRoutes.js` as
// part of the task #29 split. Two admin-only indicator endpoints:
//   PUT  /indicator/:id  — update OUTCOME_INDICATOR PIRS fields
//   POST /indicator      — create new OUTCOME_INDICATOR (T3/T4)
//
// Mounted at `/api/plan-nodes` via the parent aggregator — URL paths
// identical to pre-split.

const router = require('express').Router();
const { authenticateToken } = require('../../middleware/authMiddleware');
const { ensureTargetQuartersActive } = require('../../services/activePeriodsService');
const {
  knex,
  log,
  STATUSES,
  enrichNode,
  canEditIndicators,
  envelopeError,
} = require('./_helpers');

router.use(authenticateToken);

/**
 * Replace an indicator's active reporting periods in one transaction.
 * Safe to call with an empty array (clears all periods). Duplicates in
 * the payload are silently de-duplicated.
 * @private
 */
async function syncActivePeriods(planNodeId, periods) {
  const rows = (Array.isArray(periods) ? periods : [])
    .map((p) => ({
      plan_node_id: planNodeId,
      fiscal_year_num: Number(p?.fy),
      quarter: Number(p?.q),
    }))
    .filter((r) => Number.isFinite(r.fiscal_year_num) && r.fiscal_year_num >= 1
      && Number.isFinite(r.quarter) && r.quarter >= 1 && r.quarter <= 4);
  const uniq = Array.from(new Map(rows.map((r) => [`${r.fiscal_year_num}-${r.quarter}`, r])).values());
  await knex.transaction(async (trx) => {
    await trx('plan_node_active_periods').where('plan_node_id', planNodeId).del();
    if (uniq.length) await trx('plan_node_active_periods').insert(uniq);
  });
}

// PUT /plan-nodes/indicator/:id — admin/ME update for OUTCOME_INDICATOR PIRS fields
/**
 * Update an OUTCOME_INDICATOR (T2/T3/T4) — maps form field names to plan_nodes columns.
 *
 * @name PUT /api/plan-nodes/indicator/:id
 * @param {express.Request} req — path param `id`, body with indicator form fields
 * @param {express.Response} res — 200 JSON enriched indicator row, 403/404 on auth/missing
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * PUT /api/plan-nodes/indicator/42 { indicator_name: "New name" }
 */
router.put('/indicator/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return envelopeError(res, 400, 'invalid id');

    if (!await canEditIndicators(req.user)) {
      return envelopeError(res, 403, 'You do not have permission to edit indicators');
    }

    const row = await knex('plan_nodes').where('id', id).first();
    if (!row || row.node_type !== 'OUTCOME_INDICATOR') {
      return envelopeError(res, 404, 'indicator not found');
    }

    const b = req.body;
    const patch = {};
    // plan_nodes.title is NOT NULL — empty indicator_name must be rejected, not
    // coerced to null (which threw a raw DB constraint error) (cleaning bug PN-1).
    if (b.indicator_name !== undefined) {
      if (!b.indicator_name || !String(b.indicator_name).trim()) return envelopeError(res, 400, 'indicator_name cannot be empty');
      patch.title = String(b.indicator_name).trim();
    }
    if (b.indicator_code !== undefined) { patch.code = b.indicator_code || null; patch.indicator_code = b.indicator_code || null; }
    if (b.tier_id !== undefined) patch.tier_id = Number(b.tier_id) || null;
    if (b.definition !== undefined) patch.description = b.definition || null;
    // Text such as "Q2" in a target used to reach MySQL as NaN (500). Collect
    // the offending fields and answer 400 instead.
    const notNumbers = [];
    const toNum = (v, field) => {
      if (v === '' || v === null || v === undefined) return null;
      const n = Number(v);
      if (!Number.isFinite(n)) notNumbers.push(field);
      return n;
    };
    if (b.baseline_value !== undefined) patch.baseline_numeric = toNum(b.baseline_value, 'baseline_value');
    if (b.target_fy1 !== undefined) patch.target_y1_numeric = toNum(b.target_fy1, 'target_fy1');
    if (b.target_fy2 !== undefined) patch.target_y2_numeric = toNum(b.target_fy2, 'target_fy2');
    if (b.target_fy3 !== undefined) patch.target_y3_numeric = toNum(b.target_fy3, 'target_fy3');
    if (b.target_fy4 !== undefined) patch.target_y4_numeric = toNum(b.target_fy4, 'target_fy4');
    if (b.target_fy5 !== undefined) patch.target_y5_numeric = toNum(b.target_fy5, 'target_fy5');
    if (b.q1_target !== undefined) patch.q1_target_numeric = toNum(b.q1_target, 'q1_target');
    if (b.q2_target !== undefined) patch.q2_target_numeric = toNum(b.q2_target, 'q2_target');
    if (b.q3_target !== undefined) patch.q3_target_numeric = toNum(b.q3_target, 'q3_target');
    if (b.q4_target !== undefined) patch.q4_target_numeric = toNum(b.q4_target, 'q4_target');
    if (b.parent_id !== undefined) patch.parent_id = b.parent_id === '' ? null : (Number(b.parent_id) || null);
    if (b.unit_of_measure_id !== undefined) patch.unit_of_measure_id = b.unit_of_measure_id === '' ? null : (Number(b.unit_of_measure_id) || null);
    if (b.accountable_division_id !== undefined) patch.responsible_division_code = b.accountable_division_id || null;
    if (b.contributing_divisions !== undefined) {
      patch.contributing_divisions = Array.isArray(b.contributing_divisions) ? JSON.stringify(b.contributing_divisions) : null;
    }
    if (b.is_big_ticket !== undefined) patch.is_big_ticket = b.is_big_ticket ? 1 : 0;
    if (b.pillar_id !== undefined) patch.pillar_id = b.pillar_id === '' || b.pillar_id === null ? null : (Number(b.pillar_id) || null);

    if (notNumbers.length) {
      return envelopeError(res, 400, `These fields must be numbers: ${notNumbers.join(', ')}`);
    }

    patch.updated_at = new Date();
    await knex('plan_nodes').where('id', id).update(patch);

    // Sync the active (fy × quarter) reporting periods when the client
    // sent them explicitly. Omitting `active_periods` from the payload
    // leaves existing rows untouched (partial-update semantics).
    if (Array.isArray(b.active_periods)) {
      await syncActivePeriods(id, b.active_periods);
    }
    // Target set ⇒ reporting expected (D-20260708-02) — re-adds any current-FY
    // quarter whose target is > 0, even if the grid above just cleared it.
    await ensureTargetQuartersActive(id);

    const updated = await enrichNode(await knex('plan_nodes').where('id', id).first());
    res.json(updated);
  } catch (err) {
    log.error('plan_nodes.indicator_update_failed', { err: err.message, id: req.params.id });
    envelopeError(res, 500, err.message);
  }
});

// POST /plan-nodes/indicator — admin/ME create for OUTCOME_INDICATOR (T3/T4)
/**
 * Create a new OUTCOME_INDICATOR (T3/T4) plan node.
 *
 * @name POST /api/plan-nodes/indicator
 * @param {express.Request} req — body with indicator_name, indicator_code, tier_id (required) + optional PIRS fields
 * @param {express.Response} res — 201 JSON enriched indicator row, 400/403 on validation/auth
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example
 * POST /api/plan-nodes/indicator { indicator_name: "TB cases", indicator_code: "TB.01", tier_id: 3 }
 */
router.post('/indicator', async (req, res) => {
  try {
    if (!await canEditIndicators(req.user)) {
      return envelopeError(res, 403, 'You do not have permission to create indicators');
    }

    const b = req.body;
    const tierId = Number(b.tier_id);
    if (!b.indicator_name || !b.indicator_code || !tierId) {
      return envelopeError(res, 400, 'indicator_name, indicator_code and tier_id are required');
    }

    const row = {
      node_type: 'OUTCOME_INDICATOR',
      title: b.indicator_name,
      code: b.indicator_code,
      indicator_code: b.indicator_code,
      tier_id: tierId,
      description: b.definition || null,
      baseline_numeric: b.baseline_value === '' ? null : Number(b.baseline_value) || null,
      target_y1_numeric: b.target_fy1 === '' ? null : Number(b.target_fy1) || null,
      target_y2_numeric: b.target_fy2 === '' ? null : Number(b.target_fy2) || null,
      target_y3_numeric: b.target_fy3 === '' ? null : Number(b.target_fy3) || null,
      target_y4_numeric: b.target_fy4 === '' ? null : Number(b.target_fy4) || null,
      target_y5_numeric: b.target_fy5 === '' ? null : Number(b.target_fy5) || null,
      responsible_division_code: b.accountable_division_id || null,
      contributing_divisions: Array.isArray(b.contributing_divisions) ? JSON.stringify(b.contributing_divisions) : null,
      is_big_ticket: b.is_big_ticket ? 1 : 0,
      pillar_id: b.pillar_id ? Number(b.pillar_id) || null : null,
      fiscal_year: new Date().getFullYear().toString(),
      status: STATUSES.APPROVED,
      created_by_user_id: req.user.id,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const [id] = await knex('plan_nodes').insert(row);
    if (Array.isArray(b.active_periods)) {
      await syncActivePeriods(id, b.active_periods);
    }
    // Target set ⇒ reporting expected (D-20260708-02).
    await ensureTargetQuartersActive(id);
    const created = await enrichNode(await knex('plan_nodes').where('id', id).first());
    res.status(201).json(created);
  } catch (err) {
    log.error('plan_nodes.indicator_create_failed', { err: err.message });
    envelopeError(res, 500, err.message);
  }
});

// DELETE /plan-nodes/indicator/:id — delete an OUTCOME_INDICATOR
const { authorize } = require('../../middleware/rbacMiddleware');

router.delete('/indicator/:id', authorize({ module: 'pirs', action: 'delete' }), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return envelopeError(res, 400, 'invalid id');

    const row = await knex('plan_nodes').where('id', id).first();
    if (!row || row.node_type !== 'OUTCOME_INDICATOR') {
      return envelopeError(res, 404, 'indicator not found');
    }

    await knex('plan_nodes').where('id', id).del();
    res.json({ success: true, data: null });
  } catch (err) {
    log.error('plan_nodes.indicator_delete_failed', { err: err.message, id: req.params.id });
    envelopeError(res, 500, err.message);
  }
});

module.exports = router;
