/**
 * Merge EVERY alias division into its canonical, then delete the alias rows
 * (D-20260710-01). Generalisation of the MELP→PRA merge (20260709000000):
 * Lenny wants aliases gone — "l'alias EST la division" becomes literal.
 *
 * Staging inventory at write time (8 aliases): ADIM→ASSET (13 plan_nodes,
 * 2 user_divisions), CPHI→PHIHSS (16 ud), DDS→Legal, DIA→DIAG, HP→PHC-HP,
 * HRMD→HR (3 workplan_items), LABNET→CLDS (16 indicator reports, 20 ud),
 * PHIR→NPHI — plus 16 approval_instances org codes, 35 users.division_code,
 * 5 contributing_divisions JSON entries, 1 focal_points row.
 *
 * indicator_division_reports collisions (alias row AND canonical row on the
 * same plan_node × quarter × fy × role — 5 real cases, e.g. LABNET APPROVED
 * vs CLDS REJECTED) keep the row with the BEST status; tie keeps canonical.
 * Approval instances/steps of dropped report rows are deleted (orphans).
 *
 * Idempotent; down() is a documented no-op (merged rows indistinguishable).
 */

'use strict';

// Higher = better. Loser row is deleted with its approval chain.
const STATUS_RANK = {
  VALIDATED: 6, APPROVED: 6,
  SUBMITTED: 4, IN_REVIEW: 4,
  DRAFT: 3,
  NOT_APPLICABLE: 2,
  REJECTED: 1,
};
const rank = (s) => STATUS_RANK[s] || 0;

async function rewriteContribJson(knex, table, FROM, TO) {
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

/** Delete a report row plus its approval instances/steps (orphan cleanup). */
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

async function mergeOne(knex, FROM, TO) {
  // 1. plan_nodes
  await knex('plan_nodes').where('responsible_division_code', FROM)
    .update({ responsible_division_code: TO });
  await knex('plan_nodes').where('secondary_division_code', FROM)
    .update({ secondary_division_code: TO });
  await rewriteContribJson(knex, 'plan_nodes', FROM, TO);

  // 2. indicator_division_reports — best-status wins on collision
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

  // 3. user_divisions — move without duplicating
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

  // 4. Legacy / satellite tables
  await knex('workplan_items').where('responsible_division_code', FROM)
    .update({ responsible_division_code: TO });
  await knex('workplan_items').where('responsible_division', FROM)
    .update({ responsible_division: TO });
  await rewriteContribJson(knex, 'workplan_items', FROM, TO);

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

  // 5. Delete the alias division row — guarded
  const children = await knex('division_codes').where('parent_code', FROM).first();
  if (children) {
    throw new Error(`merge_division_aliases: ${FROM} still has children — aborting.`);
  }
  await knex('division_codes').where('code', FROM).del();
}

exports.up = async function up(knex) {
  const aliases = await knex('division_codes')
    .whereNotNull('alias_of')
    .select('code', 'alias_of');
  for (const a of aliases) {
    // Alias chains are forbidden app-side; guard anyway.
    const canonical = await knex('division_codes').where('code', a.alias_of).first();
    if (!canonical) {
      throw new Error(`merge_division_aliases: canonical ${a.alias_of} for alias ${a.code} not found — aborting.`);
    }
    await mergeOne(knex, a.code, a.alias_of);
  }
};

exports.down = async function down() {
  // Irreversible by design — merged rows are indistinguishable from native
  // canonical rows, and the alias rows carry no data worth resurrecting.
};
