// ── Monthly digest of a directorate: the data (automation roadmap, lot 7) ──
//
// D-20261105-15. Each function reads one section for the units of a
// directorate (the directorate and every unit under it). Live data: the
// digest shows the situation on the day it is read.

'use strict';

const db = require('../../config/db');
const { STATUSES, PLAN_NODE_TYPES, ACTIVITY_RISK_LEVELS, APPROVAL_ENTITIES, TIERS } = require('@rbm/lib/enums');
const { resolveImport, activityExecution, divisionExecution } = require('../budgetExecution/budgetExecutionQuery');
const { varianceRules, withVariance, dayOf } = require('../budgetExecution/budgetVariance');

const LIST_LIMIT = 20;
const countRows = (rows) => rows.map((r) => ({ status: r.status, count: Number(r.count) || 0 }));

/** Specific activities of the year by status. */
async function specificsByStatus(units, fiscalYear) {
  return countRows(await db('plan_nodes').where('node_type', PLAN_NODE_TYPES.SPECIFIC_ACTIVITY)
    .where('fiscal_year', fiscalYear).whereIn('responsible_division_code', units)
    .groupBy('status').select('status').count('* as count'));
}

// One source per kind of item waiting for a decision: its table, its unit and its link.
const WAITING_SOURCES = [
  { type: APPROVAL_ENTITIES.PLAN_NODE, label: 'Specific activity',
    query: (q) => q.join('plan_nodes as p', 'p.id', 'ai.entity_id').select('p.code', 'p.title', 'p.responsible_division_code as unit_code', 'p.id as link_id') },
  { type: APPROVAL_ENTITIES.ACTIVITY_REPORT, label: 'Activity report',
    query: (q) => q.join('activity_reports as r', 'r.id', 'ai.entity_id').join('plan_nodes as p', 'p.id', 'r.plan_node_id')
      .select('p.code', 'p.title', 'p.responsible_division_code as unit_code', 'p.id as link_id') },
  { type: APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT, label: 'Indicator report',
    query: (q) => q.join('indicator_division_reports as r', 'r.id', 'ai.entity_id').join('plan_nodes as p', 'p.id', 'r.plan_node_id')
      .select('p.code', 'p.title', 'r.division_code as unit_code', 'p.id as link_id') },
];

/**
 * Items of the units waiting for a decision since before `cutoff`, oldest first.
 *
 * @param {string[]} units
 * @param {Date} cutoff
 * @returns {Promise<{ count: number, items: object[] }>}
 */
async function waitingApprovals(units, cutoff) {
  const lists = await Promise.all(WAITING_SOURCES.map(async (s) => {
    const q = db('approval_instances as ai').where('ai.entity_type', s.type).where('ai.status', STATUSES.IN_REVIEW)
      .where('ai.created_at', '<', cutoff);
    const rows = await s.query(q).select(db.raw("DATE_FORMAT(ai.created_at, '%Y-%m-%d') as since"));
    return rows.filter((r) => units.includes(String(r.unit_code || '').toUpperCase())).map((r) => ({ ...r, type_label: s.label }));
  }));
  const items = lists.flat().sort((a, b) => String(a.since).localeCompare(String(b.since)));
  return { count: items.length, items: items.slice(0, LIST_LIMIT) };
}

/** High-risk specific activities of the year, approved or in review, by start date. */
async function highRisk(units, fiscalYear) {
  const q = db('plan_nodes').where('node_type', PLAN_NODE_TYPES.SPECIFIC_ACTIVITY).where('fiscal_year', fiscalYear)
    .whereIn('responsible_division_code', units).where('risk_level', ACTIVITY_RISK_LEVELS.HIGH)
    .whereIn('status', [STATUSES.APPROVED, STATUSES.IN_REVIEW]);
  const rows = await q.clone().orderBy('start_date').limit(LIST_LIMIT)
    .select('id', 'code', 'title', 'responsible_division_code as unit_code', db.raw("DATE_FORMAT(start_date, '%Y-%m-%d') as start_day"));
  const [{ count } = {}] = await q.clone().count('* as count');
  return { count: Number(count) || 0, items: rows };
}

/** Activity reports of the quarter by status, and how many say « Not started ». */
async function activityReports(units, fiscalYear, quarter) {
  const base = () => db('activity_reports as ar').join('plan_nodes as s', 's.id', 'ar.plan_node_id')
    .where('ar.quarter', quarter).where('ar.fiscal_year', fiscalYear).whereIn('s.responsible_division_code', units);
  const byStatus = countRows(await base().groupBy('ar.status').select('ar.status as status').count('* as count'));
  const [{ count } = {}] = await base().where('ar.not_started', 1).count('* as count');
  return { by_status: byStatus, not_started: Number(count) || 0 };
}

/** T3/T4 indicators owned by the units, and their quarterly reports by status. */
async function indicatorReports(units, fiscalYear, quarter) {
  const [{ count } = {}] = await db('plan_nodes').where('node_type', PLAN_NODE_TYPES.OUTCOME_INDICATOR)
    .where('fiscal_year', fiscalYear).whereIn('tier_id', [TIERS.T3.id, TIERS.T4.id])
    .whereIn('responsible_division_code', units).whereNot('status', STATUSES.CANCELLED).count('* as count');
  const byStatus = countRows(await db('indicator_division_reports').where({ quarter, fiscal_year: fiscalYear })
    .whereIn('division_code', units).groupBy('status').select('status').count('* as count'));
  return { owned: Number(count) || 0, by_status: byStatus };
}

/** Budget execution per unit (latest import of the year), with the flagged activities. */
async function budget(units, fiscalYear) {
  const latest = await resolveImport(fiscalYear);
  if (!latest) return null;
  const rules = await varianceRules(latest.as_of_date);
  const items = withVariance(await activityExecution({ importId: latest.id, fiscalYear, divisions: units }), rules);
  return {
    as_of: dayOf(latest.as_of_date),
    units: divisionExecution(items).map((d) => ({
      code: d.division_code, name: d.division_name, released: d.released_budget, execution_pct: d.execution_pct,
      flagged: items.filter((a) => a.division_code === d.division_code && a.variance).length,
    })),
  };
}

module.exports = { specificsByStatus, waitingApprovals, highRisk, activityReports, indicatorReports, budget };
