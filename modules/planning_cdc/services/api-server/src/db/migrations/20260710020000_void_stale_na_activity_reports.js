/**
 * Void STALE Not-Applicable activity reports (D-20260710-02).
 *
 * A NOT_APPLICABLE verdict means "this activity does not concern OUR
 * division" — it is only meaningful while the activity still belongs to
 * the division that filed it. When specific activities are reassigned
 * (Lenny moved the 4.1.2.01.xx activities from WA RCC to Central RCC),
 * the old N/A rows keep blocking the Report button for the NEW division —
 * and since 78b4dbb removed the N/A action, nobody can clear them.
 *
 * Rule: delete NOT_APPLICABLE activity_reports whose FILER does not belong
 * to the plan node's CURRENT responsible division (user_divisions, with
 * users.division_code as legacy fallback). N/A rows filed by the current
 * division stay. Staging at write time: 10 N/A rows, 8+ provably stale
 * (filed by WARCC user, activities now CARCC/SARCC, reason "Not for WA RCC").
 *
 * Idempotent. down() no-op (deleted verdicts are stale by definition).
 */

'use strict';

exports.up = async function up(knex) {
  const naReports = await knex('activity_reports as ar')
    .join('plan_nodes as p', 'p.id', 'ar.plan_node_id')
    .where('ar.status', 'NOT_APPLICABLE')
    .select('ar.id', 'ar.user_id', 'p.responsible_division_code as current_div');

  for (const r of naReports) {
    if (!r.current_div) continue;
    const filerDivs = new Set(
      (await knex('user_divisions').where('user_id', r.user_id).pluck('division_code'))
        .map((c) => String(c).toUpperCase()),
    );
    const legacy = await knex('users').where('id', r.user_id).select('division_code').first();
    if (legacy && legacy.division_code) filerDivs.add(String(legacy.division_code).toUpperCase());

    if (!filerDivs.has(String(r.current_div).toUpperCase())) {
      await knex('activity_reports').where('id', r.id).del();
    }
  }
};

exports.down = async function down() {
  // No reversal: the deleted rows were verdicts from a division that no
  // longer owns the activity — recreating them would re-block reporting.
};
