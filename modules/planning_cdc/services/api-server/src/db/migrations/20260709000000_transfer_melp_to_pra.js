/**
 * Merge division MELP into PRA, then delete MELP (D-20260709-02).
 *
 * MELP no longer exists organisationally. It was already an ALIAS of PRA
 * (division_codes.alias_of='PRA', same division_name), so alias-aware code
 * paths treated them as one division — but raw-code surfaces (quarterly
 * dashboard grouping, filters, org chart) still showed MELP separately
 * because rows carried the literal 'MELP' code.
 *
 * Staging inventory at write time: 10 plan_nodes (9 T3/T4 indicators
 * PR&A.13.x + broad activity 3.3.4.04, no child specifics, no activity
 * reports), 1 indicator_division_report (Q2 2026 REJECTED), 1 user_divisions
 * row (user 397 ME_OFFICER — duplicate of an existing PRA row), 1 legacy
 * workplan_items.responsible_division. Everything else is 0 but is swept
 * defensively anyway so the migration is safe on any environment.
 *
 * Idempotent and additive-safe: re-running on a merged DB is a no-op.
 * down() is a documented no-op — after the merge, ex-MELP rows are
 * indistinguishable from native PRA rows.
 */

'use strict';

const FROM = 'MELP';
const TO = 'PRA';

/** Rewrite a JSON contributing_divisions column, de-duplicating on merge. */
async function rewriteContribJson(knex, table) {
  const rows = await knex(table)
    .where('contributing_divisions', 'like', `%${FROM}%`)
    .select('id', 'contributing_divisions');
  for (const row of rows) {
    let list;
    try {
      list = JSON.parse(row.contributing_divisions);
    } catch {
      continue; // non-JSON legacy text — handled by callers if ever needed
    }
    if (!Array.isArray(list)) continue;
    const mapped = Array.from(new Set(
      list.map((c) => (String(c).toUpperCase() === FROM ? TO : c)),
    ));
    await knex(table).where('id', row.id).update({ contributing_divisions: JSON.stringify(mapped) });
  }
}

exports.up = async function up(knex) {
  // ── 1. plan_nodes ─────────────────────────────────────────────
  await knex('plan_nodes').where('responsible_division_code', FROM)
    .update({ responsible_division_code: TO });
  await knex('plan_nodes').where('secondary_division_code', FROM)
    .update({ secondary_division_code: TO });
  await rewriteContribJson(knex, 'plan_nodes');

  // ── 2. indicator_division_reports — skip logical duplicates ───
  const idrRows = await knex('indicator_division_reports')
    .where('division_code', FROM)
    .select('id', 'plan_node_id', 'quarter', 'fiscal_year', 'role');
  for (const r of idrRows) {
    const dup = await knex('indicator_division_reports')
      .where({
        division_code: TO,
        plan_node_id: r.plan_node_id,
        quarter: r.quarter,
        fiscal_year: r.fiscal_year,
        role: r.role,
      })
      .first();
    if (dup) {
      await knex('indicator_division_reports').where('id', r.id).del();
    } else {
      await knex('indicator_division_reports').where('id', r.id).update({ division_code: TO });
    }
  }

  // ── 3. user_divisions — move assignments, never duplicate ─────
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

  // ── 4. workplan / legacy tables (defensive sweeps) ────────────
  await knex('workplan_items').where('responsible_division_code', FROM)
    .update({ responsible_division_code: TO });
  await knex('workplan_items').where('responsible_division', FROM)
    .update({ responsible_division: TO });
  await rewriteContribJson(knex, 'workplan_items');

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

  // ── 5. Delete the MELP division row — guarded ─────────────────
  const children = await knex('division_codes').where('parent_code', FROM).first();
  const inboundAliases = await knex('division_codes').where('alias_of', FROM).first();
  if (children || inboundAliases) {
    throw new Error(
      'transfer_melp_to_pra: MELP still has children or inbound aliases — aborting the delete. Investigate before re-running.',
    );
  }
  await knex('division_codes').where('code', FROM).del();
};

exports.down = async function down() {
  // Irreversible by design: merged rows are indistinguishable from native
  // PRA rows, and re-creating MELP would resurrect a division that no
  // longer exists organisationally.
};
