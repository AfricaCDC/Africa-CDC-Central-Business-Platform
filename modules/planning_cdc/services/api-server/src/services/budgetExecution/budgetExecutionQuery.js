// ── Budget execution — reads (D-20261015-04) ──
//
// A fund center of the MIS export links to its broad activity through
// budget_codes.budget_code (fiscal year of the activity). An activity can
// have several fund centers (several partners / donors), and a fund center
// several funds: every one is added up. Figures come from one import (the
// latest of the year unless another is asked).

'use strict';

const db = require('../../config/db');
const { NODE_TYPES } = require('@rbm/lib/enums');

const SUMS = ['original_budget', 'released_budget', 'committed', 'spent', 'bbf_budget', 'bbf_spent'];

const round = (n) => Math.round(n * 100) / 100;
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

/**
 * Totals of a set of figures, with the balance and the two execution rates.
 * Balance = released − committed − spent (the MIS formula). Execution rate =
 * (committed + spent) / released (the MIS rate); spend rate = spent / released.
 *
 * @param {object[]} rows - objects carrying the SUMS fields
 * @returns {{ original_budget: number, released_budget: number, committed: number, spent: number,
 *   balance: number, execution_pct: number|null, spend_pct: number|null, bbf_budget: number, bbf_spent: number, bbf_balance: number }}
 * @example totals([{ released_budget: 100, committed: 20, spent: 30 }]); // balance 50, execution_pct 50
 */
function totals(rows) {
  const t = Object.fromEntries(SUMS.map((k) => [k, round(rows.reduce((s, r) => s + Number(r[k] || 0), 0))]));
  return {
    ...t,
    balance: round(t.released_budget - t.committed - t.spent),
    execution_pct: pct(t.committed + t.spent, t.released_budget),
    spend_pct: pct(t.spent, t.released_budget),
    bbf_balance: round(t.bbf_budget - t.bbf_spent),
  };
}

/**
 * Import to read: `importId` when given, else the latest of the year.
 *
 * @param {string} fiscalYear
 * @param {number} [importId]
 * @returns {Promise<object|null>}
 * @throws {Error} on DB failure
 * @example await resolveImport('2026');
 */
async function resolveImport(fiscalYear, importId) {
  const q = db('budget_execution_imports');
  if (importId) return q.where('id', importId).first();
  return q.where('fiscal_year', fiscalYear).orderBy([{ column: 'as_of_date', order: 'desc' }, { column: 'id', order: 'desc' }]).first();
}

/** Sums per (fund center, fund) of an import. */
function fundTotals(importId) {
  return db('budget_execution_lines').where('import_id', importId)
    .groupBy('fund_center', 'fund')
    .select('fund_center', 'fund', db.raw('MAX(fund_center_text) as fund_center_text'),
      ...SUMS.map((k) => db.raw('SUM(??) as ??', [k, k])));
}

/** Broad activities of the year with their budget codes, optionally limited to divisions. */
async function linkedActivities(fiscalYear, divisions) {
  let q = db('budget_codes as bc').join('plan_nodes as p', 'p.id', 'bc.plan_node_id')
    .leftJoin('division_codes as d', 'd.code', 'p.responsible_division_code')
    .where('p.fiscal_year', fiscalYear).where('p.node_type', NODE_TYPES.BROAD_ACTIVITY).whereNotNull('bc.budget_code')
    .select('p.id', 'p.code', 'p.title', 'p.responsible_division_code as division_code', 'd.division_name',
      'bc.budget_code', 'bc.fund_code', 'bc.fund_description', 'bc.amount as planned');
  if (divisions) q = q.whereIn('p.responsible_division_code', divisions.length ? divisions : ['']);
  return q;
}

/**
 * Broad activities with their execution (all fund centers and funds added).
 *
 * @param {{ importId: number, fiscalYear: string, divisions: string[]|null }} p - divisions null = every division
 * @returns {Promise<object[]>} one row per activity: totals + `fund_centers`
 * @throws {Error} on DB failure
 * @example await activityExecution({ importId: 3, fiscalYear: '2026', divisions: ['EPR'] });
 */
async function activityExecution({ importId, fiscalYear, divisions }) {
  const [links, funds] = await Promise.all([linkedActivities(fiscalYear, divisions), fundTotals(importId)]);
  const byCenter = new Map();
  for (const f of funds) {
    if (!byCenter.has(f.fund_center)) byCenter.set(f.fund_center, []);
    byCenter.get(f.fund_center).push(f);
  }
  const acts = new Map();
  for (const l of links) {
    if (!acts.has(l.id)) {
      acts.set(l.id, { id: l.id, code: l.code, title: l.title, division_code: l.division_code, division_name: l.division_name, planned: 0, centers: [] });
    }
    const a = acts.get(l.id);
    a.planned = round(a.planned + Number(l.planned || 0));
    const rows = byCenter.get(l.budget_code) || [];
    a.centers.push({
      fund_center: l.budget_code, fund_code: l.fund_code, fund_description: l.fund_description,
      text: rows[0]?.fund_center_text || null, in_export: rows.length > 0,
      funds: rows.map((r) => r.fund).filter(Boolean), ...totals(rows),
    });
  }
  return [...acts.values()]
    .map(({ centers, ...a }) => ({ ...a, ...totals(centers), fund_centers: centers }))
    .sort((x, y) => String(x.code).localeCompare(String(y.code), undefined, { numeric: true }));
}

/**
 * Execution grouped by business unit, from activityExecution rows.
 *
 * @param {object[]} activities
 * @returns {object[]} one row per division with totals and activity count
 * @example divisionExecution(await activityExecution(p));
 */
function divisionExecution(activities) {
  const byDiv = new Map();
  for (const a of activities) {
    const key = a.division_code || '';
    if (!byDiv.has(key)) byDiv.set(key, { division_code: a.division_code, division_name: a.division_name, items: [] });
    byDiv.get(key).items.push(a);
  }
  return [...byDiv.values()]
    .map(({ items, ...d }) => ({ ...d, activity_count: items.length, ...totals(items) }))
    .sort((x, y) => String(x.division_code).localeCompare(String(y.division_code)));
}

/**
 * GL detail of one activity: each fund center, each fund, the budget and
 * the GL accounts (duplicate accounts added up).
 *
 * @param {{ importId: number, activity: object }} p - activity from activityExecution
 * @returns {Promise<object>} the activity with `fund_centers[].funds[].gl_lines`
 * @throws {Error} on DB failure
 * @example await activityDetail({ importId: 3, activity });
 */
async function activityDetail({ importId, activity }) {
  const centers = activity.fund_centers.map((c) => c.fund_center);
  const lines = centers.length
    ? await db('budget_execution_lines').where('import_id', importId).whereIn('fund_center', centers)
      .groupBy('fund_center', 'fund', 'gl_account', 'gl_description')
      .select('fund_center', 'fund', 'gl_account', 'gl_description', ...SUMS.map((k) => db.raw('SUM(??) as ??', [k, k])))
      .orderBy([{ column: 'fund_center' }, { column: 'fund' }, { column: 'gl_account' }])
    : [];
  return {
    ...activity,
    fund_centers: activity.fund_centers.map((c) => {
      const own = lines.filter((l) => l.fund_center === c.fund_center);
      const funds = [...new Set(own.map((l) => l.fund))].map((fund) => {
        const rows = own.filter((l) => l.fund === fund);
        // A GL account carries spending only; the budget sits on the fund row.
        const gl = rows.filter((l) => l.gl_account).map((l) => ({
          gl_account: l.gl_account, gl_description: l.gl_description,
          committed: round(Number(l.committed)), spent: round(Number(l.spent)), bbf_spent: round(Number(l.bbf_spent)),
        }));
        return { fund, ...totals(rows), gl_lines: gl };
      });
      return { ...c, funds };
    }),
  };
}

module.exports = { resolveImport, fundTotals, activityExecution, divisionExecution, activityDetail, totals };
