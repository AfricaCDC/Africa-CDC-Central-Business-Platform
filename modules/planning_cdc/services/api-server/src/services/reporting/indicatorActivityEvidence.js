// ── Activity reports behind a quarterly indicator report (automation roadmap, lot 4) ──
//
// D-20261105-12. While a unit writes its indicator report for a quarter,
// the form lists the approved activity reports of that quarter whose
// specific activity is carried by the unit and is linked to the indicator,
// directly (plan_nodes.linked_indicator_id) or through its broad activity
// (indicator_broad_links). The focal person can add them to the narrative;
// nothing is written by this read.

'use strict';

const db = require('../../config/db');
const { STATUSES } = require('@rbm/lib/enums');

const textOf = (r) => String(r.indicator_achievement || r.achievements || '').trim();

/**
 * Approved activity reports of the quarter that feed an indicator for one unit.
 *
 * @param {{ indicatorId: number, divisionCode: string, quarter: string, fiscalYear: string }} q
 * @returns {Promise<Array<{ id: number, plan_node_id: number, code: string, title: string, text: string, link: string }>>}
 * @throws {Error} on DB failure
 * @example await activityEvidence({ indicatorId: 40, divisionCode: 'EPR', quarter: 'Q4', fiscalYear: '2026' });
 */
async function activityEvidence({ indicatorId, divisionCode, quarter, fiscalYear }) {
  const rows = await db('activity_reports as ar')
    .join('plan_nodes as s', 's.id', 'ar.plan_node_id')
    .where(function linkedToIndicator() {
      this.where('s.linked_indicator_id', indicatorId)
        .orWhereExists(function viaBroad() {
          this.from('indicator_broad_links as l').whereRaw('l.broad_activity_id = s.parent_id').where('l.indicator_id', indicatorId);
        });
    })
    .where('s.responsible_division_code', divisionCode)
    .where('ar.status', STATUSES.APPROVED)
    .where('ar.quarter', quarter)
    .where('ar.fiscal_year', fiscalYear)
    .where(function started() { this.whereNull('ar.not_started').orWhere('ar.not_started', 0); })
    .select('ar.id', 'ar.plan_node_id', 's.code', 's.title', 'ar.indicator_achievement', 'ar.achievements')
    .orderBy('s.code');
  return rows.map((r) => ({
    id: r.id, plan_node_id: r.plan_node_id, code: r.code, title: r.title, text: textOf(r),
    link: `/activity-report/${r.plan_node_id}/report/${r.id}`,
  }));
}

module.exports = { activityEvidence };
