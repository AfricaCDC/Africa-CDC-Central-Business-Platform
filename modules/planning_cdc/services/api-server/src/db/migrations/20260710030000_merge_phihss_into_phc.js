/**
 * Merge directorate PHIHSS ("Centre Public Health Institute") into PHC
 * ("Centre for Primary Healthcare") and delete PHIHSS (D-20260710-02,
 * Lenny: "les deux ensembles, PHC reste en priorité" → full merge chosen).
 *
 * Same shape as the MELP→PRA merge (Lenny: "juste comme MELP, c'est tout")
 * with ONE addition forced by the data: PHIHSS is a DIRECTORATE with
 * children (Wkf, NPHI), which are re-parented under PHC first (their legacy
 * `directorate` text column aligned to PHC's name). Then every PHIHSS
 * reference is rewritten to PHC (same sweep + best-status collision rule
 * on reports as D-20260710-01) and the row is deleted. Explicitly NO
 * re-attribution pass over existing CONTRIB reports — plain merge only.
 *
 * Idempotent; down() documented no-op (irreversible by design).
 */

'use strict';

const FROM = 'PHIHSS';
const TO = 'PHC';
const TO_NAME = 'Centre for Primary Healthcare';

const STATUS_RANK = {
  VALIDATED: 6, APPROVED: 6,
  SUBMITTED: 4, IN_REVIEW: 4,
  DRAFT: 3,
  NOT_APPLICABLE: 2,
  REJECTED: 1,
};
const rank = (s) => STATUS_RANK[s] || 0;

async function rewriteContribJson(knex, table) {
  const rows = await knex(table)
    .where('contributing_divisions', 'like', `%${FROM}%`)
    .select('id', 'contributing_divisions');
  for (const row of rows) {
    let list;
    try { list = JSON.parse(row.contributing_divisions); } catch { continue; }
    if (!Array.isArray(list)) continue;
    const mapped = Array.from(new Set(
      list.map((c) => (String(c).toUpperCase() === FROM ? TO : c)),
    ));
    await knex(table).where('id', row.id).update({ contributing_divisions: JSON.stringify(mapped) });
  }
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
  const phihss = await knex('division_codes').where('code', FROM).first();
  if (!phihss) return; // already merged — idempotent re-run

  // ── 1. Re-parent PHIHSS children under PHC ────────────────────
  await knex('division_codes').where('parent_code', FROM)
    .update({ parent_code: TO, directorate: TO_NAME });

  // ── 2. Rewrite every PHIHSS reference to PHC ──────────────────
  await knex('plan_nodes').where('responsible_division_code', FROM)
    .update({ responsible_division_code: TO });
  await knex('plan_nodes').where('secondary_division_code', FROM)
    .update({ secondary_division_code: TO });
  await rewriteContribJson(knex, 'plan_nodes');
  await rewriteContribJson(knex, 'workplan_items');

  const idrRows = await knex('indicator_division_reports')
    .where('division_code', FROM)
    .select('id', 'plan_node_id', 'quarter', 'fiscal_year', 'role', 'status');
  for (const r of idrRows) {
    const dup = await knex('indicator_division_reports')
      .where({
        division_code: TO, plan_node_id: r.plan_node_id,
        quarter: r.quarter, fiscal_year: r.fiscal_year, role: r.role,
      })
      .first();
    if (!dup) {
      await knex('indicator_division_reports').where('id', r.id).update({ division_code: TO });
    } else if (rank(r.status) > rank(dup.status)) {
      await deleteReportWithApprovals(knex, dup.id);
      await knex('indicator_division_reports').where('id', r.id).update({ division_code: TO });
    } else {
      await deleteReportWithApprovals(knex, r.id);
    }
  }

  const udRows = await knex('user_divisions').where('division_code', FROM).select('user_id', 'role');
  for (const r of udRows) {
    const existing = await knex('user_divisions')
      .where({ user_id: r.user_id, division_code: TO, role: r.role })
      .first();
    if (!existing) {
      await knex('user_divisions').insert({ user_id: r.user_id, division_code: TO, role: r.role });
    }
  }
  await knex('user_divisions').where('division_code', FROM).del();

  await knex('workplan_items').where('responsible_division_code', FROM)
    .update({ responsible_division_code: TO });
  await knex('workplan_items').where('responsible_division', FROM)
    .update({ responsible_division: TO });

  const sweep = async (table, col) => {
    if (!(await knex.schema.hasTable(table))) return;
    await knex(table).where(col, FROM).update({ [col]: TO });
  };
  await sweep('users', 'division_code');
  await sweep('indicator_reports', 'responsible_division_code');
  await sweep('focal_points', 'division_code');
  await sweep('item_contributing_divisions', 'division_code');
  await sweep('approval_instances', 'division_code');
  await sweep('approval_instances', 'contrib_org_code');
  await sweep('approval_instances', 'main_org_code');
  await sweep('amert_activities', 'responsible_division_code');
  await sweep('amert_activities', 'responsible_division');
  await sweep('division_activity_reports', 'division_code');
  if (await knex.schema.hasTable('indicators')) {
    await knex('indicators').where('accountable_division_id', FROM)
      .update({ accountable_division_id: TO });
  }

  // ── 3. Delete the PHIHSS row — guarded ────────────────────────
  const children = await knex('division_codes').where('parent_code', FROM).first();
  const inboundAliases = await knex('division_codes').where('alias_of', FROM).first();
  if (children || inboundAliases) {
    throw new Error('merge_phihss_into_phc: PHIHSS still has children or aliases — aborting.');
  }
  await knex('division_codes').where('code', FROM).del();
};

exports.down = async function down() {
  // Irreversible by design — see D-20260710-02.
};
