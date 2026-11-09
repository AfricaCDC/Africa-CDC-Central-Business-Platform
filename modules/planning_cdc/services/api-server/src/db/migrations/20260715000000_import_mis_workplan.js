/**
 * MIS detailed workplan import (D-20260715-01).
 *
 * Imports the specific activities from Lenny's `2026_SDU_Workplan_Detailed.xlsx`
 * (sheet "MIS Only", main section only — the "Contributing" section belongs to
 * other divisions and is NOT imported) under broad activity `4.2.4.06`:
 *   1. Updates baseline/target of the 5 existing MIS indicators to the
 *      workbook values (user-confirmed the file is authoritative, including
 *      the atypical MIS.13.2-2 target 5 < baseline 10 and MIS.13.2-7 = 2/2).
 *   2. Inserts the new specifics (45 on local/staging data as of 2026-07-15;
 *      title-duplicates are skipped, so re-running is safe) with sequential
 *      `4.2.4.06.NN` codes continuing after the current max, division MIS,
 *      status APPROVED (aligned with the previously imported siblings),
 *      description prefixed "Responsible: <name>", all budgets 0.
 *   3. Deletes the single obsolete specific `4.2.4.06.10` ("DHIS Team: Team
 *      building and synergy workshop") — done LAST so its code is not
 *      recycled by the max+1 sequence; guarded: skipped if any
 *      activity_reports or budget_codes reference it.
 *
 * Source snapshot lives in src/db/data/mis_workplan_2026.json (the xlsx
 * itself stays out of git, same convention as the AHSS alignment import).
 */

'use strict';

const workplan = require('../data/mis_workplan_2026.json');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

exports.up = async function up(knex) {
  const broad = await knex('plan_nodes')
    .where({ code: workplan.broad_code, node_type: 'BROAD_ACTIVITY' })
    .first('id');
  if (!broad) {
    // Environment without the MIS subtree (e.g. a fresh dev DB) — nothing to import into.
    return;
  }

  // ── 1. Indicator baseline/target updates ─────────────────────
  for (const t of workplan.indicatorTargets) {
    await knex('plan_nodes')
      .where({ code: t.code, node_type: 'OUTCOME_INDICATOR' })
      .update({ baseline_numeric: t.baseline, target_y4_numeric: t.target });
  }

  // ── 2. Insert new specifics (skip title-duplicates) ──────────
  const siblings = await knex('plan_nodes')
    .where({ parent_id: broad.id, node_type: 'SPECIFIC_ACTIVITY' })
    .select('title', 'code', 'sort_order');
  const existingTitles = new Set(siblings.map((s) => norm(s.title)));

  // Continue the `<broad>.NN` sequence after the current max suffix.
  let maxSuffix = 0;
  let maxSort = 0;
  for (const s of siblings) {
    const m = String(s.code || '').match(/\.(\d+)$/);
    if (m) maxSuffix = Math.max(maxSuffix, parseInt(m[1], 10));
    maxSort = Math.max(maxSort, s.sort_order || 0);
  }

  const indicatorIdByCode = {};
  for (const t of await knex('plan_nodes')
    .whereIn('code', [...new Set(workplan.specifics.map((s) => s.indicator_code).filter(Boolean))])
    .where('node_type', 'OUTCOME_INDICATOR')
    .select('id', 'code')) {
    indicatorIdByCode[t.code] = t.id;
  }

  for (const spec of workplan.specifics) {
    if (existingTitles.has(norm(spec.title))) continue;
    maxSuffix += 1;
    maxSort += 1;
    await knex('plan_nodes').insert({
      parent_id: broad.id,
      node_type: 'SPECIFIC_ACTIVITY',
      code: `${workplan.broad_code}.${String(maxSuffix).padStart(2, '0')}`,
      title: spec.title,
      description: spec.responsible ? `Responsible: ${spec.responsible}` : null,
      responsible_division_code: workplan.division_code,
      indicator_code: spec.indicator_code || null,
      linked_indicator_id: (spec.indicator_code && indicatorIdByCode[spec.indicator_code]) || null,
      status: 'APPROVED',
      fiscal_year: '2026',
      sort_order: maxSort,
      is_active: 1,
      implementation_at_rcc: 0,
      budget_main: 0,
      budget_pass_through: 0,
      budget_tech_assistance: 0,
      budget_special_projects: 0,
      budget_total_2026: 0,
      budget_2027: 0,
      budget_2028: 0,
      q1_budget: 0,
      q2_budget: 0,
      q3_budget: 0,
      q4_budget: 0,
    });
    existingTitles.add(norm(spec.title));
  }

  // ── 3. Remove the obsolete "DHIS Team building" specific ─────
  const obsolete = await knex('plan_nodes')
    .where({ code: workplan.remove_specific_code, node_type: 'SPECIFIC_ACTIVITY' })
    .first('id');
  if (obsolete) {
    const [reports, budgets] = await Promise.all([
      knex('activity_reports').where('plan_node_id', obsolete.id).count({ c: '*' }).first(),
      knex('budget_codes').where('plan_node_id', obsolete.id).count({ c: '*' }).first(),
    ]);
    if (Number(reports.c) === 0 && Number(budgets.c) === 0) {
      await knex('plan_nodes').where('id', obsolete.id).del();
    }
    // If anything references it, leave it in place — an admin decides manually.
  }
};

// Imported rows become live workplan data users edit and report against —
// reversing would destroy their work. Restore from backup if ever needed.
exports.down = async function down() {};
