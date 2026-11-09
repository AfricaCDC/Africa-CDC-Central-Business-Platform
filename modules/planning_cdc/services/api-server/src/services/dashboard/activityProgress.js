// ── Dashboard — implementation progress of the specific activities (D-20261015-06) ──
//
// The dashboards used to show "0 % progress" from a hard-coded value. The real
// signal is the activity report: a specific activity is "reported" when it has
// a SUBMITTED or APPROVED report (not flagged not started) in the year.

'use strict';

const db = require('../../config/db');
const { STATUSES, NODE_TYPES } = require('@rbm/lib/enums');
const { getDirectorateChildren } = require('../divisionAliasService');

const flag = (sql, bindings) => db.raw(`MAX(CASE WHEN ${sql} THEN 1 ELSE 0 END)`, bindings);

/**
 * Specific activities of a year by report state: approved, in review
 * (submitted), draft / returned, no report. `reported_pct` = (approved +
 * in review) / total.
 *
 * @param {{ fiscalYear: string, division?: string }} p - division: a division or directorate code (units under it included)
 * @returns {Promise<{ total: number, approved: number, in_review: number, draft: number, not_reported: number, reported_pct: number|null }>}
 * @throws {Error} on DB failure
 * @example await activityProgress({ fiscalYear: '2026', division: 'EPR' });
 */
async function activityProgress({ fiscalYear, division }) {
  let q = db('plan_nodes as p')
    .leftJoin('activity_reports as ar', function onReport() {
      this.on('ar.plan_node_id', '=', 'p.id').andOn('ar.fiscal_year', '=', 'p.fiscal_year');
    })
    .where('p.fiscal_year', fiscalYear).where('p.node_type', NODE_TYPES.SPECIFIC_ACTIVITY)
    .groupBy('p.id')
    .select('p.id',
      flag('ar.status = ? AND COALESCE(ar.not_started, 0) = 0', [STATUSES.APPROVED]).wrap('(', ') as approved'),
      flag('ar.status = ? AND COALESCE(ar.not_started, 0) = 0', [STATUSES.SUBMITTED]).wrap('(', ') as in_review'),
      flag('ar.status IN (?, ?)', [STATUSES.DRAFT, STATUSES.REJECTED]).wrap('(', ') as draft'));
  if (division) {
    const codes = await getDirectorateChildren(String(division).toUpperCase());
    q = q.whereIn('p.responsible_division_code', codes.length ? codes : [division]);
  }
  return summarize(await q);
}

/**
 * Count activities by their best report state.
 *
 * @param {Array<{ approved: number, in_review: number, draft: number }>} rows - one per activity
 * @returns {{ total: number, approved: number, in_review: number, draft: number, not_reported: number, reported_pct: number|null }}
 * @example summarize([{ approved: 1, in_review: 1, draft: 0 }]); // approved 1
 */
function summarize(rows) {
  const out = { total: rows.length, approved: 0, in_review: 0, draft: 0, not_reported: 0 };
  for (const r of rows) {
    // Best state wins: an approved report counts once even if a later quarter is still a draft.
    if (Number(r.approved)) out.approved += 1;
    else if (Number(r.in_review)) out.in_review += 1;
    else if (Number(r.draft)) out.draft += 1;
    else out.not_reported += 1;
  }
  out.reported_pct = out.total ? Math.round(((out.approved + out.in_review) / out.total) * 1000) / 10 : null;
  return out;
}

module.exports = { activityProgress, summarize };
