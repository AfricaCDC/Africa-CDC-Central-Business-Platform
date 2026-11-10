/**
 * Load the FY2027 AMERT budget proposal into `plan_nodes`.
 *
 * House pattern (precedent: 20260715000000_import_mis_workplan.js): the xlsx
 * stays out of git, a reviewed JSON snapshot is committed under `src/db/data/`,
 * and this migration is idempotent so it can be replayed.
 *
 * THE ONE RULE — every read and every write below is filtered on
 * `fiscal_year = '2027'`. The 2026 generation shares the same codes ('1.1.1'
 * exists in both) and matching on (node_type, code) alone would overwrite it.
 * A fingerprint of the 2026 rows is taken before and after, and a mismatch
 * aborts the transaction.
 *
 * Deliberately NOT loaded here:
 * - the 1050 costing lines and the 2028/2029 targets. They stay in the snapshot
 *   and can be loaded later without going back to the workbook.
 * - `plan_node_active_periods`. Those rows drive the reporting screens, and no
 *   server-side guard yet refuses a write against a year that has not started
 *   (anomaly A-14). Seeding them would expose 2027 to report entry.
 *
 * `down` is a no-op: rolling back a data load would delete whatever the
 * divisions have since planned on top of it.
 */

'use strict';

const snapshot = require('../data/amert_2027_proposal.json');
const divisionMap = require('../data/amert_2027_division_map.json');

const FY = '2027';
const OWNED_TYPES = ['IMPACT', 'IMPACT_INDICATOR', 'OUTCOME_AREA', 'OUTCOME_INDICATOR', 'BROAD_ACTIVITY'];
const EXPECTED = { IMPACT: 1, IMPACT_INDICATOR: 7, OUTCOME_AREA: 13, OUTCOME_INDICATOR: 54, BROAD_ACTIVITY: 115 };
const EXPECTED_TOTAL = 105563940;

/** Source unit label -> units_of_measure.code. */
const UNIT_CODES = {
  Number: 'NUMBER',
  Percentage: 'PERCENTAGE',
  Proportion: 'PROPORTION',
  'Value (USD)': 'USD',
};
const PERCENT_CODES = new Set(['PERCENTAGE', 'PROPORTION']);

/**
 * Render a source number the way the 2026 generation stores it: percentages as
 * `'45%'`, everything else as a plain numeric string.
 *
 * @param {number|null|undefined} value — raw value from the snapshot
 * @param {string|null} unitCode — units_of_measure.code, or null
 * @returns {string|null}
 * @example display(0.04, 'PERCENTAGE') // '4%'
 */
function display(value, unitCode) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (PERCENT_CODES.has(unitCode)) return `${Math.round(n * 1000) / 10}%`;
  return String(n);
}

/** @returns {number|null} the numeric twin of a target/baseline column. */
function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Spread a snapshot `budget` block over the plan_nodes budget columns (D4). */
function budgetColumns(b) {
  const g = (k) => Number(b && b[k] ? b[k] : 0);
  return {
    budget_main: g('main'),
    budget_pass_through: g('pass_through'),
    budget_tech_assistance: g('tech_assistance'),
    budget_special_projects: g('special_projects'),
    // Relative slots, not calendar years: for a 2027 plan the "plan year" column
    // holds 2027 and the two look-ahead columns hold 2028 and 2029. Renaming
    // them is a separate change, never mixed with a data load (D4).
    budget_total_2026: g('total_2027'),
    budget_2027: g('y2_2028'),
    budget_2028: g('y3_2029'),
  };
}

/**
 * MD5 over the 2026 rows, used to prove the load left them untouched.
 *
 * @param {import('knex')} knex
 * @returns {Promise<string>}
 * @example const before = await fingerprint2026(knex)
 */
async function fingerprint2026(knex) {
  const [rows] = await knex.raw(
    `SELECT MD5(GROUP_CONCAT(id, ':', COALESCE(code,''), ':', COALESCE(node_type,''),
                             ':', COALESCE(budget_total_2026,''), ':', COALESCE(target_y4,'')
                             ORDER BY id SEPARATOR '|')) AS fp,
            COUNT(*) AS n
       FROM plan_nodes WHERE fiscal_year = '2026'`,
  );
  return `${rows[0].n}/${rows[0].fp}`;
}

/**
 * Resolve every free-text division label to a validated division_codes.code.
 *
 * @param {import('knex')} knex
 * @returns {Promise<Map<string,string|null>>} label -> code
 * @throws {Error} when a label is missing from the map, or a code is unknown
 * @example const byLabel = await resolveDivisions(knex)
 */
async function resolveDivisions(knex) {
  const byLabel = new Map(divisionMap.mappings.map((m) => [m.label, m.code]));
  const missing = snapshot.activities
    .map((a) => a.responsible_division_raw)
    .filter((l) => l && !byLabel.has(l));
  if (missing.length) {
    throw new Error(`[amert2027] division labels absent from amert_2027_division_map.json: ${[...new Set(missing)].join(' | ')}`);
  }
  const wanted = [...new Set([...byLabel.values()].filter(Boolean))];
  const known = new Set((await knex('division_codes').whereIn('code', wanted).select('code')).map((r) => r.code));
  const unknown = wanted.filter((c) => !known.has(c));
  if (unknown.length) {
    throw new Error(`[amert2027] codes in the division map that do not exist in division_codes: ${unknown.join(', ')}`);
  }
  return byLabel;
}

/**
 * Map the snapshot's measuring units onto units_of_measure ids.
 *
 * @param {import('knex')} knex
 * @returns {Promise<Map<string,{id:number,code:string}>>} source label -> unit
 * @throws {Error} when a source unit has no counterpart
 * @example const units = await resolveUnits(knex)
 */
async function resolveUnits(knex) {
  const rows = await knex('units_of_measure').select('id', 'code');
  const byCode = new Map(rows.map((r) => [r.code, r.id]));
  const out = new Map();
  for (const [label, code] of Object.entries(UNIT_CODES)) {
    if (!byCode.has(code)) throw new Error(`[amert2027] units_of_measure is missing '${code}'`);
    out.set(label, { id: byCode.get(code), code });
  }
  const used = new Set([
    ...snapshot.outcome_indicators.map((i) => i.measuring_unit),
    ...snapshot.output_indicators.map((i) => i.measuring_unit),
  ].filter(Boolean));
  const unmapped = [...used].filter((u) => !out.has(u));
  if (unmapped.length) throw new Error(`[amert2027] unmapped measuring units: ${unmapped.join(' | ')}`);
  return out;
}

/**
 * Insert or update one 2027 node, keyed on (fiscal_year, node_type, code).
 *
 * Upsert rather than delete-then-insert: a replay must not remove the specific
 * activities the divisions will have planned under these broad activities.
 *
 * @param {import('knex')} trx
 * @param {string} nodeType
 * @param {string|null} code — null only for the IMPACT root
 * @param {object} payload — columns to write
 * @returns {Promise<number>} the row id
 * @example const id = await upsert(trx, 'OUTCOME_AREA', '1.1', {...})
 */
async function upsert(trx, nodeType, code, payload) {
  const where = { fiscal_year: FY, node_type: nodeType };
  if (code === null) {
    const existing = await trx('plan_nodes').where(where).whereNull('code').first('id');
    if (existing) {
      await trx('plan_nodes').where('id', existing.id).update(payload);
      return existing.id;
    }
    const [id] = await trx('plan_nodes').insert({ ...where, code: null, ...payload });
    return id;
  }
  const existing = await trx('plan_nodes').where({ ...where, code }).first('id');
  if (existing) {
    await trx('plan_nodes').where('id', existing.id).update(payload);
    return existing.id;
  }
  const [id] = await trx('plan_nodes').insert({ ...where, code, ...payload });
  return id;
}

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('plan_nodes'))) return;
  if (!divisionMap.reviewed_by) {
    throw new Error('[amert2027] amert_2027_division_map.json carries no reviewed_by; a human must sign the division mapping before this load runs');
  }

  const byLabel = await resolveDivisions(knex);
  const units = await resolveUnits(knex);
  const before = await fingerprint2026(knex);

  await knex.transaction(async (trx) => {
    // ── IMPACT ────────────────────────────────────────────────────────────
    const impactId = await upsert(trx, 'IMPACT', null, {
      parent_id: null,
      tier_id: null,
      title: snapshot.outcome.title,
      status: 'APPROVED',
      sort_order: 0,
      is_active: 1,
      ...budgetColumns(snapshot.outcome.budget),
    });

    // ── IMPACT_INDICATOR (7, incl. the unbudgeted one) ────────────────────
    const indicatorIds = new Map();
    for (const [i, ind] of snapshot.outcome_indicators.entries()) {
      const unit = units.get(ind.measuring_unit) || null;
      indicatorIds.set(ind.code, await upsert(trx, 'IMPACT_INDICATOR', ind.code, {
        parent_id: impactId,
        tier_id: 1,
        title: ind.title,
        // The results framework carries one more indicator than the budget half,
        // which renumbers 7 -> 6. It is loaded with zero budget and flagged here
        // so no one plans against money that was never allocated.
        description: ind.unbudgeted
          ? 'Not budgeted in the FY2027 proposal: present in the results framework, absent from the budget. No activity can be planned against it.'
          : null,
        unit: ind.measuring_unit || null,
        unit_of_measure_id: unit ? unit.id : null,
        baseline: display(ind.baseline, unit && unit.code),
        baseline_numeric: numeric(ind.baseline),
        target_y5: display(ind.target_2027, unit && unit.code),
        target_y5_numeric: numeric(ind.target_2027),
        status: 'APPROVED',
        sort_order: i + 1,
        is_active: 1,
        ...budgetColumns(ind.budget),
      }));
    }

    // ── OUTCOME_AREA (13 outputs) ─────────────────────────────────────────
    const outputIds = new Map();
    for (const [i, out] of snapshot.outputs.entries()) {
      const parentId = indicatorIds.get(out.outcome_indicator_code);
      if (!parentId) throw new Error(`[amert2027] output ${out.code} has no parent indicator ${out.outcome_indicator_code}`);
      outputIds.set(out.code, await upsert(trx, 'OUTCOME_AREA', out.code, {
        parent_id: parentId,
        tier_id: null,
        title: out.title,
        status: 'APPROVED',
        sort_order: i + 1,
        is_active: 1,
        ...budgetColumns(out.budget),
      }));
    }

    // ── OUTCOME_INDICATOR (54 output indicators, tier 2) ──────────────────
    const outputIndicatorIds = new Map();
    for (const [i, ind] of snapshot.output_indicators.entries()) {
      const parentId = outputIds.get(ind.output_code);
      if (!parentId) throw new Error(`[amert2027] output indicator ${ind.code} has no parent output ${ind.output_code}`);
      const unit = units.get(ind.measuring_unit) || null;
      outputIndicatorIds.set(ind.code, await upsert(trx, 'OUTCOME_INDICATOR', ind.code, {
        parent_id: parentId,
        tier_id: 2,
        title: ind.title,
        unit: ind.measuring_unit || null,
        unit_of_measure_id: unit ? unit.id : null,
        baseline: display(ind.baseline, unit && unit.code),
        baseline_numeric: numeric(ind.baseline),
        target_y5: display(ind.target_2027, unit && unit.code),
        target_y5_numeric: numeric(ind.target_2027),
        status: 'APPROVED',
        sort_order: i + 1,
        is_active: 1,
        ...budgetColumns(ind.budget),
      }));
    }

    // ── BROAD_ACTIVITY (115) ──────────────────────────────────────────────
    for (const [i, act] of snapshot.activities.entries()) {
      const parentId = outputIndicatorIds.get(act.output_indicator_code);
      if (!parentId) throw new Error(`[amert2027] activity ${act.code} has no parent output indicator ${act.output_indicator_code}`);
      const divisionCode = byLabel.get(act.responsible_division_raw) || null;
      await upsert(trx, 'BROAD_ACTIVITY', act.code, {
        parent_id: parentId,
        tier_id: null,
        title: act.title,
        // The raw label is kept so a mapping decision can always be re-read
        // against what the workbook actually said.
        description: act.responsible_division_raw ? `Source division: ${act.responsible_division_raw}` : null,
        responsible_division_code: divisionCode,
        status: 'APPROVED',
        sort_order: i + 1,
        is_active: 1,
        ...budgetColumns(act.budget),
      });
    }

    // ── post-write checks, inside the transaction ─────────────────────────
    const counts = await trx('plan_nodes').where('fiscal_year', FY).whereIn('node_type', OWNED_TYPES)
      .select('node_type').count({ n: '*' }).groupBy('node_type');
    for (const [type, expected] of Object.entries(EXPECTED)) {
      const got = Number((counts.find((c) => c.node_type === type) || {}).n || 0);
      if (got !== expected) throw new Error(`[amert2027] ${type}: expected ${expected} rows for ${FY}, found ${got}`);
    }

    const { total } = await trx('plan_nodes')
      .where({ fiscal_year: FY, node_type: 'BROAD_ACTIVITY' })
      .sum({ total: 'budget_total_2026' }).first();
    if (Math.round(Number(total)) !== EXPECTED_TOTAL) {
      throw new Error(`[amert2027] activity budgets total ${total}, expected ${EXPECTED_TOTAL}`);
    }

    const orphans = await trx('plan_nodes').where('fiscal_year', FY)
      .whereIn('node_type', OWNED_TYPES.filter((t) => t !== 'IMPACT'))
      .whereNull('parent_id').count({ n: '*' }).first();
    if (Number(orphans.n) > 0) throw new Error(`[amert2027] ${orphans.n} ${FY} nodes have no parent`);
  });

  const after = await fingerprint2026(knex);
  if (before !== after) {
    throw new Error(`[amert2027] the 2026 generation changed during the load (${before} -> ${after}); investigate before trusting either year`);
  }

  console.log(`[20260919000000] FY${FY} loaded: 1 impact, 7 indicators, 13 outputs, 54 output indicators, 115 activities; 2026 untouched (${after})`);
};

/**
 * Exposed for tests only. `display` and `budgetColumns` encode two reviewed
 * decisions (targets land in the y5 slot, budgets keep relative year slots)
 * that are worth pinning independently of a live database.
 */
exports._internals = { display, numeric, budgetColumns, EXPECTED, EXPECTED_TOTAL };

exports.down = async function () {
  // Intentionally a no-op. Deleting the FY2027 generation would take the
  // specific activities the divisions planned on top of it with it. Removing
  // the plan is a reviewed data operation, not a schema rollback.
};
