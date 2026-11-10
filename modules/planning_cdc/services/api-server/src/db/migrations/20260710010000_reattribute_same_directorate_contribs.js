/**
 * Re-attribute same-directorate contributor reports to the MAIN division
 * (D-20260710-01, Lenny: "si le contributeur est en dessous du même
 * directorate que la division main, ça veut dire que la main a reporté").
 *
 * When division X files a CONTRIB indicator report on an indicator whose
 * responsible division M sits under the SAME top-level directorate
 * (level_type='directorate' ancestor), the report becomes M's OWNER report:
 * the dashboard, review queues and exports then show M as having reported.
 * The DG group is EXCLUDED — divisions under the Office of the DG are
 * independent entities, not a thematic reporting family (Lenny's call).
 *
 * Collisions (M already has an OWNER row for the same plan_node × quarter
 * × fy) keep the row with the BEST status; the loser row and its approval
 * chain are deleted. Runs AFTER 20260710000000_merge_division_aliases so
 * ex-alias codes (e.g. LABNET→CLDS under CLSN) participate correctly.
 *
 * Going forward the same rule is enforced at report creation
 * (indicatorDivisionReportsService.getOrInit). Idempotent; down() no-op.
 */

'use strict';

const STATUS_RANK = {
  VALIDATED: 6, APPROVED: 6,
  SUBMITTED: 4, IN_REVIEW: 4,
  DRAFT: 3,
  NOT_APPLICABLE: 2,
  REJECTED: 1,
};
const rank = (s) => STATUS_RANK[s] || 0;
const EXCLUDED_DIRECTORATES = new Set(['DG']);

/** Build code → top directorate map (walk parent_code up to level_type='directorate'). */
async function buildDirectorateMap(knex) {
  const rows = await knex('division_codes').select('code', 'parent_code', 'level_type');
  const byCode = new Map(rows.map((r) => [r.code.toUpperCase(), r]));
  const dirOf = new Map();
  for (const r of rows) {
    let cur = r;
    const seen = new Set();
    let found = null;
    while (cur && !seen.has(cur.code.toUpperCase())) {
      seen.add(cur.code.toUpperCase());
      if (cur.level_type === 'directorate') { found = cur.code.toUpperCase(); break; }
      cur = cur.parent_code ? byCode.get(cur.parent_code.toUpperCase()) : null;
    }
    dirOf.set(r.code.toUpperCase(), found);
  }
  return dirOf;
}

async function deleteReportWithApprovals(knex, reportId) {
  const instances = await knex('approval_instances')
    .where({ entity_type: 'INDICATOR_DIVISION_REPORT', entity_id: reportId })
    .pluck('id');
  if (instances.length) {
    await knex('approval_steps').whereIn('approval_instance_id', instances).del();
    await knex('approval_instances').whereIn('id', instances).del();
  }
  await knex('indicator_division_reports').where('id', reportId).del();
}

exports.up = async function up(knex) {
  const dirOf = await buildDirectorateMap(knex);

  const contribs = await knex('indicator_division_reports as r')
    .join('plan_nodes as p', 'p.id', 'r.plan_node_id')
    .where('r.role', 'CONTRIB')
    .select(
      'r.id', 'r.division_code', 'r.plan_node_id', 'r.quarter', 'r.fiscal_year', 'r.status',
      'p.responsible_division_code as main_code',
    );

  for (const r of contribs) {
    const contribCode = (r.division_code || '').toUpperCase();
    const mainCode = (r.main_code || '').toUpperCase();
    if (!contribCode || !mainCode || contribCode === mainCode) continue;

    const dContrib = dirOf.get(contribCode);
    const dMain = dirOf.get(mainCode);
    if (!dContrib || !dMain || dContrib !== dMain) continue;
    if (EXCLUDED_DIRECTORATES.has(dContrib)) continue;

    const ownerRow = await knex('indicator_division_reports')
      .where({
        plan_node_id: r.plan_node_id, division_code: r.main_code,
        quarter: r.quarter, fiscal_year: r.fiscal_year,
      })
      .first();

    if (!ownerRow) {
      await knex('indicator_division_reports').where('id', r.id)
        .update({ division_code: r.main_code, role: 'OWNER' });
    } else if (rank(r.status) > rank(ownerRow.status)) {
      await deleteReportWithApprovals(knex, ownerRow.id);
      await knex('indicator_division_reports').where('id', r.id)
        .update({ division_code: r.main_code, role: 'OWNER' });
    } else {
      await deleteReportWithApprovals(knex, r.id);
    }
  }
};

exports.down = async function down() {
  // Irreversible: re-attributed rows are indistinguishable from native
  // OWNER reports of the main division.
};
