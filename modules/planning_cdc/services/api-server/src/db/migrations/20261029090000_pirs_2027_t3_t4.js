/**
 * FY2027 Tier 3 / Tier 4 indicators from the PIRS 7.0 (D-20261029-01).
 *
 * The 2027 T3/T4 were carried forward from 2026 (carry_forward_indicators.js).
 * PIRS 7.0 gives the real 2027 set and tiers: they replace the carried rows.
 *
 *   · Source: src/db/data/pirs_2027.json (extract_pirs_2027.js; the workbook
 *     stays out of git) and the reviewed map src/db/data/pirs_2027_map.json
 *     (objective → 2027 outcome area, BU label → division code, pillar, unit).
 *   · Guard: refuses to run when any FY2027 T3/T4 is referenced (specific
 *     activity, broad link, report, budget code, child node). Their quarterly
 *     reporting flags (plan_node_active_periods) are removed with them.
 *   · The file has annual targets only (target_y1 = 2023 … target_y5 = 2027):
 *     quarterly milestones, hence the reporting quarters, are set by the BUs.
 *   · No-op on a database without the FY2027 outcome areas (dev databases
 *     without the AMERT 2027 import), and when FY2027 already holds exactly
 *     the codes of the snapshot.
 *
 * down(): no-op. The carried rows are not rebuilt; restore them from the
 * backup taken before the deploy, or re-run carry_forward_indicators.js.
 */

'use strict';

const { PLAN_NODE_TYPES } = require('@rbm/lib/enums');
const snapshot = require('../data/pirs_2027.json');
const map = require('../data/pirs_2027_map.json');
const { buildIndicatorRows } = require('../../services/pirsImport');

const YEAR = snapshot.fiscal_year;
const TIERS = [3, 4];
// [table, column] pairs pointing at an indicator.
const REFERENCES = [
  ['plan_nodes', 'linked_indicator_id'], ['plan_nodes', 'parent_id'],
  ['indicator_broad_links', 'indicator_id'], ['indicator_division_reports', 'plan_node_id'],
  ['indicator_reports', 'plan_node_id'], ['activity_reports', 'plan_node_id'], ['budget_codes', 'plan_node_id'],
];

async function lookups(knex) {
  const areas = await knex('plan_nodes').where({ fiscal_year: YEAR, node_type: PLAN_NODE_TYPES.OUTCOME_AREA }).select('id', 'code');
  const divisions = await knex('division_codes').pluck('code');
  const pillars = await knex('pillars').select('id', 'name');
  const units = await knex('units_of_measure').select('id', 'code');
  return {
    areaIdByCode: new Map(areas.map((a) => [a.code, a.id])),
    divisionCodes: new Set(divisions),
    pillarIdByName: new Map(pillars.map((p) => [p.name, p.id])),
    unitIdByCode: new Map(units.map((u) => [u.code, u.id])),
  };
}

async function assertUnreferenced(knex, ids) {
  for (const [table, column] of REFERENCES) {
    const [{ n }] = await knex(table).whereIn(column, ids).count({ n: '*' });
    if (Number(n) > 0) throw new Error(`${n} row(s) of ${table}.${column} use a FY${YEAR} T3/T4 indicator: not replacing them`);
  }
}

exports.up = async function up(knex) {
  const ctx = await lookups(knex);
  if (!ctx.areaIdByCode.size) return; // no FY2027 plan in this database
  const existing = await knex('plan_nodes').where({ fiscal_year: YEAR, node_type: PLAN_NODE_TYPES.OUTCOME_INDICATOR })
    .whereIn('tier_id', TIERS).select('id', 'code');
  const wanted = new Set(snapshot.indicators.map((i) => i.code));
  if (existing.length === wanted.size && existing.every((e) => wanted.has(e.code))) return; // already imported

  const { rows, errors } = buildIndicatorRows(snapshot, map, ctx);
  if (errors.length) throw new Error(`PIRS ${YEAR} import: ${errors.length} problem(s)\n${errors.join('\n')}`);

  const ids = existing.map((e) => e.id);
  if (ids.length) {
    await assertUnreferenced(knex, ids);
    await knex('plan_node_active_periods').whereIn('plan_node_id', ids).del();
    await knex('plan_nodes').whereIn('id', ids).del();
  }
  for (let i = 0; i < rows.length; i += 100) await knex('plan_nodes').insert(rows.slice(i, i + 100));
};

exports.down = async function down() {
  // Data migration: restore the carried-forward rows from the pre-deploy backup.
};
