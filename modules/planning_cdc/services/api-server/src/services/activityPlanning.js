// ── Specific activity planning: cost lines and Decision Complexity Screening (D-20261026-01) ──
//
// Cost lines say what an activity plans to pay: an expense category (first
// column of the cost catalogue), a description and an amount. The screening
// asks whether the activity needs complex decision-making and, on Yes, rates
// five criteria; it is informative and does not change the approval.

'use strict';

const db = require('../config/db');
const { ValidationError } = require('@rbm/lib/errors');
const { COMPLEXITY_CRITERIA, scoreComplexity } = require('@rbm/lib/complexity');

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * Active expense categories, in the catalogue order.
 *
 * @returns {Promise<Array<{ id: number, name: string }>>}
 * @throws {Error} on DB failure
 * @example await listExpenseCategories(); // [{ id: 1, name: 'External Expertise' }, ...]
 */
function listExpenseCategories() {
  return db('expense_categories').where('is_active', true).orderBy('sort_order').select('id', 'name');
}

/**
 * Cost lines (with their category name), total and screening of one activity.
 *
 * @param {number} planNodeId
 * @returns {Promise<{ cost_lines: object[], total: number, screening: object|null }>}
 * @throws {Error} on DB failure
 * @example await getPlanning(4102);
 */
async function getPlanning(planNodeId) {
  const [lines, screening] = await Promise.all([
    db('activity_cost_lines as l').join('expense_categories as c', 'c.id', 'l.expense_category_id').where('l.plan_node_id', planNodeId)
      .orderBy(['l.sort_order', 'l.id'])
      .select('l.id', 'l.expense_category_id', 'c.name as expense_category', 'l.description', 'l.amount'),
    db('activity_complexity_screenings').where('plan_node_id', planNodeId).first(),
  ]);
  const costLines = lines.map((l) => ({ ...l, amount: round2(l.amount) }));
  return { cost_lines: costLines, total: round2(costLines.reduce((s, l) => s + l.amount, 0)), screening: screening || null };
}

/**
 * Replace the cost lines of an activity.
 *
 * @param {number} planNodeId
 * @param {Array<{ expense_category_id: number, description: string, amount: number }>} lines
 * @returns {Promise<{ cost_lines: object[], total: number, screening: object|null }>}
 * @throws {ValidationError} on an unknown category
 * @example await saveCostLines(4102, [{ expense_category_id: 2, description: '3 tickets Nairobi', amount: 1368 }]);
 */
async function saveCostLines(planNodeId, lines) {
  const ids = [...new Set(lines.map((l) => l.expense_category_id))];
  const known = ids.length ? await db('expense_categories').whereIn('id', ids).pluck('id') : [];
  if (known.length !== ids.length) throw new ValidationError('Choose an expense category from the list for every line');
  const rows = lines.map((l, i) => ({
    plan_node_id: planNodeId, expense_category_id: l.expense_category_id,
    description: l.description.trim(), amount: round2(l.amount), sort_order: i + 1,
  }));
  await db.transaction(async (trx) => {
    await trx('activity_cost_lines').where('plan_node_id', planNodeId).del();
    if (rows.length) await trx('activity_cost_lines').insert(rows);
  });
  return getPlanning(planNodeId);
}

/**
 * Save the screening of an activity. On Yes the five ratings are required
 * and the total and band are computed; on No the ratings are cleared.
 *
 * @param {number} planNodeId
 * @param {{ requires_complex_decision: boolean } & Record<string, number|null>} body
 * @param {number} userId
 * @returns {Promise<object>} the saved screening row
 * @throws {ValidationError} when Yes is answered without the five ratings
 * @example await saveScreening(4102, { requires_complex_decision: false }, 7);
 */
async function saveScreening(planNodeId, body, userId) {
  const isComplex = Boolean(body.requires_complex_decision);
  const ratings = Object.fromEntries(COMPLEXITY_CRITERIA.map((c) => [c.key, isComplex ? body[c.key] ?? null : null]));
  const score = isComplex ? scoreComplexity(ratings) : null;
  if (isComplex && !score) throw new ValidationError('Rate the five criteria (Low, Moderate or High) when the activity requires complex decision-making');
  const row = {
    requires_complex_decision: isComplex,
    ...ratings,
    total_score: score ? score.total : null,
    complexity_band: score ? score.band.key : null,
    updated_by_user_id: userId,
    updated_at: db.fn.now(),
  };
  const existing = await db('activity_complexity_screenings').where('plan_node_id', planNodeId).first('id');
  if (existing) await db('activity_complexity_screenings').where('id', existing.id).update(row);
  else await db('activity_complexity_screenings').insert({ ...row, plan_node_id: planNodeId });
  return db('activity_complexity_screenings').where('plan_node_id', planNodeId).first();
}

/**
 * Whether the activity has answered the Decision Complexity Screening (required
 * before submission).
 *
 * @param {number} planNodeId
 * @returns {Promise<boolean>}
 * @throws {Error} on DB failure
 * @example await hasScreening(4102) // true once Yes or No was saved
 */
async function hasScreening(planNodeId) {
  return Boolean(await db('activity_complexity_screenings').where('plan_node_id', planNodeId).first('id'));
}

module.exports = { listExpenseCategories, getPlanning, saveCostLines, saveScreening, hasScreening };
