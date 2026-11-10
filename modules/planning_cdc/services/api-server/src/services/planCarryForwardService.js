// ── Plan carry-forward ──
//
// Copies indicators of some tiers from one fiscal year to the next, for when
// a new year keeps the previous year's indicators ("2027 tier 3 et 4 c'est les
// mêmes que 2026"). Everything year-specific is data, passed by the caller
// from a reviewed JSON map (src/db/data/carry_forward_*.json):
//   · parent_code_map: source parent code → target-year parent code. Outcome
//     areas are renumbered between years, so they are never matched by code
//     or fuzzy title at run time (D5, D-20260902-01). A parent missing from
//     the map aborts the run; null means "no parent".
//   · fill_targets: target column ← source column, written only when the
//     target column is empty (the year's target column moves each year).
//   · period_year_num: { from, to } plan-year index of the two years. Only
//     the source year's active quarters are copied, re-indexed to `to`.
//
// Idempotent: a node already present in the target year (same node_type,
// tier, code and title) is skipped. Links to broad activities are not copied:
// the target year's activities are different nodes, re-link them in the UI.
//
// Takes a knex transaction and never commits.

const { PLAN_NODE_TYPES } = require('@rbm/lib/enums');

/**
 * Natural key of an indicator inside one fiscal year.
 *
 * @param {{node_type: string, tier_id: number, code: string, title: string}} n
 * @returns {string}
 * @example
 * nodeKey({ node_type: 'OUTCOME_INDICATOR', tier_id: 3, code: 'SDI.1', title: 'X' });
 */
function nodeKey(n) {
  return [n.node_type, n.tier_id, n.code, (n.title || '').trim().toLowerCase()].join('|');
}

/**
 * Build the row to insert in the target year from a source row.
 *
 * @param {object} src — source plan_nodes row
 * @param {{toYear: string, parentId: number|null, fillTargets: object}} opts
 * @returns {object} row without `id`
 * @example
 * buildCopy(row, { toYear: '2027', parentId: 12, fillTargets: { target_y5: 'target_y4' } });
 */
function buildCopy(src, { toYear, parentId, fillTargets = {} }) {
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = src;
  const row = {};
  // mysql2 returns JSON columns parsed; knex would expand an array into a
  // value list, so write them back as JSON text.
  for (const [k, v] of Object.entries(rest)) {
    row[k] = v && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v;
  }
  Object.assign(row, { fiscal_year: toYear, parent_id: parentId });
  for (const [target, source] of Object.entries(fillTargets)) {
    if (row[target] == null || row[target] === '') row[target] = src[source] ?? null;
  }
  return row;
}

/**
 * Resolve the target-year parent id of a source node.
 *
 * @param {object} src — source row
 * @param {{codeById: Map, parentCodeMap: object, targetIdByCode: Map}} ctx
 * @returns {number|null}
 * @throws {Error} when the source parent has no entry in the map, or the mapped code is missing in the target year
 * @example
 * resolveParent(row, ctx); // 1234
 */
function resolveParent(src, { codeById, parentCodeMap, targetIdByCode }) {
  if (!src.parent_id) return null;
  const fromCode = codeById.get(src.parent_id);
  if (!(fromCode in parentCodeMap)) throw new Error(`Parent ${fromCode} of ${src.code} is not in parent_code_map`);
  const toCode = parentCodeMap[fromCode];
  if (toCode == null) return null;
  const id = targetIdByCode.get(toCode);
  if (!id) throw new Error(`Mapped parent ${toCode} does not exist in the target year`);
  return id;
}

/**
 * Copy a node's active quarters of the source plan year into the target plan
 * year. Quarters flagged on other plan years are not carried.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {{fromId: number, toId: number, periodYearNum: {from: number, to: number}}} args
 * @returns {Promise<number>} rows inserted
 * @example
 * await copyActivePeriods(trx, { fromId: 6043, toId: 9001, periodYearNum: { from: 4, to: 5 } });
 */
async function copyActivePeriods(trx, { fromId, toId, periodYearNum }) {
  if (!periodYearNum) return 0;
  const rows = await trx('plan_node_active_periods')
    .where({ plan_node_id: fromId, fiscal_year_num: periodYearNum.from }).select('quarter');
  for (const r of rows) {
    await trx('plan_node_active_periods').insert({
      plan_node_id: toId, fiscal_year_num: periodYearNum.to, quarter: r.quarter,
    });
  }
  return rows.length;
}

/**
 * Copy the indicators of `tierIds` from `fromYear` into `toYear`.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {{fromYear: string, toYear: string, tierIds: number[], parentCodeMap: object, fillTargets?: object, periodYearNum?: {from: number, to: number}}} args
 * @returns {Promise<{copied: number, skipped: number, periods: number}>}
 * @throws {Error} on an unmapped parent (nothing is written: the caller rolls back)
 * @example
 * await carryForwardIndicators(trx, { fromYear: '2026', toYear: '2027', tierIds: [3, 4], parentCodeMap });
 */
async function carryForwardIndicators(trx, { fromYear, toYear, tierIds, parentCodeMap, fillTargets = {}, periodYearNum }) {
  const sources = await trx('plan_nodes').where('fiscal_year', fromYear).whereIn('tier_id', tierIds).select('*');
  const fromParents = await trx('plan_nodes').where('fiscal_year', fromYear)
    .where('node_type', PLAN_NODE_TYPES.OUTCOME_AREA).select('id', 'code');
  const toParents = await trx('plan_nodes').where('fiscal_year', toYear)
    .where('node_type', PLAN_NODE_TYPES.OUTCOME_AREA).select('id', 'code');
  const existing = await trx('plan_nodes').where('fiscal_year', toYear).whereIn('tier_id', tierIds)
    .select('node_type', 'tier_id', 'code', 'title');

  const ctx = {
    codeById: new Map(fromParents.map((p) => [p.id, p.code])),
    targetIdByCode: new Map(toParents.map((p) => [p.code, p.id])),
    parentCodeMap,
  };
  const seen = new Set(existing.map(nodeKey));
  const out = { copied: 0, skipped: 0, periods: 0 };

  for (const src of sources) {
    if (seen.has(nodeKey(src))) { out.skipped += 1; continue; }
    const parentId = resolveParent(src, ctx);
    const [toId] = await trx('plan_nodes').insert(buildCopy(src, { toYear, parentId, fillTargets }));
    out.periods += await copyActivePeriods(trx, { fromId: src.id, toId, periodYearNum });
    seen.add(nodeKey(src));
    out.copied += 1;
  }
  return out;
}

module.exports = { carryForwardIndicators, buildCopy, resolveParent, nodeKey };
