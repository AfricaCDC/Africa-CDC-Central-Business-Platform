// ── Budget execution — fund centers not linked to an activity (D-20261015-04) ──
//
// Fund centers created during the year are not in budget_codes yet. M&E
// links each one to its broad activity; the link is a budget_codes row, the
// same table the 2026 budget codes came from. The MIS text (cut at 40
// characters) is only a suggestion: a person confirms.

'use strict';

const db = require('../../config/db');
const { NODE_TYPES } = require('@rbm/lib/enums');
const { ConflictError, ValidationError } = require('@rbm/lib/errors');
const { fundTotals, totals } = require('./budgetExecutionQuery');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Broad activities of the year (id, code, title, division). */
function broadActivities(fiscalYear) {
  return db('plan_nodes').where({ fiscal_year: fiscalYear, node_type: NODE_TYPES.BROAD_ACTIVITY })
    .select('id', 'code', 'title', 'responsible_division_code as division_code');
}

/**
 * The activity whose title starts with the MIS text, when exactly one does.
 *
 * @param {string|null} misText
 * @param {object[]} activities
 * @returns {object|null}
 * @example suggestActivity('Support the domestication and implementa', acts);
 */
function suggestActivity(misText, activities) {
  const prefix = norm(misText);
  if (prefix.length < 10) return null;
  const hits = activities.filter((a) => norm(a.title).startsWith(prefix));
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Fund centers of an import that no budget code links to an activity of the
 * year, with their totals and a suggested activity.
 *
 * @param {{ importId: number, fiscalYear: string }} p
 * @returns {Promise<object[]>}
 * @throws {Error} on DB failure
 * @example await unlinkedFundCenters({ importId: 3, fiscalYear: '2026' });
 */
async function unlinkedFundCenters({ importId, fiscalYear }) {
  const [funds, linked, activities] = await Promise.all([
    fundTotals(importId),
    db('budget_codes as bc').join('plan_nodes as p', 'p.id', 'bc.plan_node_id').where('p.fiscal_year', fiscalYear)
      .whereNotNull('bc.budget_code').pluck('bc.budget_code'),
    broadActivities(fiscalYear),
  ]);
  const known = new Set(linked);
  const byCenter = new Map();
  for (const f of funds.filter((x) => !known.has(x.fund_center))) {
    if (!byCenter.has(f.fund_center)) byCenter.set(f.fund_center, []);
    byCenter.get(f.fund_center).push(f);
  }
  return [...byCenter.entries()].map(([fundCenter, rows]) => {
    const text = rows.find((r) => r.fund_center_text)?.fund_center_text || null;
    return { fund_center: fundCenter, text, funds: rows.map((r) => r.fund).filter(Boolean), ...totals(rows), suggestion: suggestActivity(text, activities) };
  }).sort((a, b) => b.released_budget + b.spent + b.committed - (a.released_budget + a.spent + a.committed));
}

/**
 * Link a fund center to a broad activity of the year (new budget_codes row).
 *
 * @param {{ fundCenter: string, planNodeId: number, fiscalYear: string, importId: number }} p
 * @returns {Promise<{ id: number }>}
 * @throws {ValidationError} not a broad activity of that year
 * @throws {ConflictError} fund center already linked
 * @example await linkFundCenter({ fundCenter: 'CDC1002013MB', planNodeId: 68, fiscalYear: '2026', importId: 3 });
 */
async function linkFundCenter({ fundCenter, planNodeId, fiscalYear, importId }) {
  const node = await db('plan_nodes').where({ id: planNodeId, fiscal_year: fiscalYear, node_type: NODE_TYPES.BROAD_ACTIVITY }).first('id');
  if (!node) throw new ValidationError(`Choose a broad activity of ${fiscalYear}`);
  const taken = await db('budget_codes as bc').join('plan_nodes as p', 'p.id', 'bc.plan_node_id')
    .where('bc.budget_code', fundCenter).where('p.fiscal_year', fiscalYear).first('bc.id');
  if (taken) throw new ConflictError(`${fundCenter} is already linked to an activity`);
  const fund = importId
    ? await db('budget_execution_lines').where({ import_id: importId, fund_center: fundCenter }).whereNotNull('fund').first('fund')
    : null;
  const [id] = await db('budget_codes').insert({
    plan_node_id: planNodeId, budget_code: fundCenter, fund_code: fund?.fund || null, fiscal_year: fiscalYear,
    amount: 0, main_budget: 0, technical_assistance: 0, total_ips: 0, gap: 0,
    description: 'Linked from the budget execution export',
  });
  return { id };
}

module.exports = { unlinkedFundCenters, linkFundCenter, suggestActivity };
