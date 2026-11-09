// ── Activity → T3/T4 indicator mapping (D-20261016-04) ──
//
// A broad activity contributes to several T3/T4 indicators
// (indicator_broad_links, many-to-many); a specific activity to one
// (plan_nodes.linked_indicator_id). Both are read and replaced here, for the
// /pirs/mapping page.

'use strict';

const db = require('../config/db');
const { NODE_TYPES } = require('@rbm/lib/enums');
const { NotFoundError, ValidationError } = require('@rbm/lib/errors');

const MAPPABLE = [NODE_TYPES.BROAD_ACTIVITY, NODE_TYPES.SPECIFIC_ACTIVITY];
const INDICATOR_TIERS = [3, 4];

/**
 * Activities of a year with the indicators they are linked to.
 *
 * @param {{ fiscalYear: string, nodeType: string }} p - BROAD_ACTIVITY or SPECIFIC_ACTIVITY
 * @returns {Promise<Array<{ id: number, code: string, title: string, responsible_division_code: string, indicator_ids: number[] }>>}
 * @throws {Error} on DB failure
 * @example await listMapping({ fiscalYear: '2026', nodeType: 'BROAD_ACTIVITY' });
 */
async function listMapping({ fiscalYear, nodeType }) {
  const nodes = await db('plan_nodes')
    .where({ fiscal_year: fiscalYear, node_type: nodeType })
    .orderBy('code')
    .select('id', 'code', 'title', 'responsible_division_code', 'linked_indicator_id');
  if (nodeType === NODE_TYPES.SPECIFIC_ACTIVITY) {
    return nodes.map(({ linked_indicator_id: linked, ...n }) => ({ ...n, indicator_ids: linked ? [linked] : [] }));
  }
  const links = nodes.length
    ? await db('indicator_broad_links').whereIn('broad_activity_id', nodes.map((n) => n.id)).select('broad_activity_id', 'indicator_id')
    : [];
  return nodes.map(({ linked_indicator_id: _unused, ...n }) => ({
    ...n,
    indicator_ids: links.filter((l) => l.broad_activity_id === n.id).map((l) => l.indicator_id),
  }));
}

/** The T3/T4 indicators among `ids`, of the activity's year; throws when one is not. */
async function assertIndicators(ids, fiscalYear) {
  if (!ids.length) return;
  const found = await db('plan_nodes').whereIn('id', ids)
    .where({ node_type: NODE_TYPES.OUTCOME_INDICATOR, fiscal_year: fiscalYear })
    .whereIn('tier_id', INDICATOR_TIERS).pluck('id');
  if (found.length !== ids.length) throw new ValidationError('Choose T3 or T4 indicators of the same year as the activity');
}

/**
 * Replace the indicators an activity is linked to. A specific activity takes
 * at most one.
 *
 * @param {{ nodeId: number, indicatorIds: number[] }} p
 * @returns {Promise<{ id: number, node_type: string, indicator_ids: number[], before: number[] }>}
 * @throws {NotFoundError} when the node is not a broad or specific activity
 * @throws {ValidationError} on a wrong indicator, or several for a specific activity
 * @example await setMapping({ nodeId: 68, indicatorIds: [412, 415] });
 */
async function setMapping({ nodeId, indicatorIds }) {
  const ids = [...new Set(indicatorIds)];
  const node = await db('plan_nodes').where('id', nodeId).first('id', 'node_type', 'fiscal_year', 'linked_indicator_id');
  if (!node || !MAPPABLE.includes(node.node_type)) throw new NotFoundError('Activity not found');
  await assertIndicators(ids, node.fiscal_year);

  if (node.node_type === NODE_TYPES.SPECIFIC_ACTIVITY) {
    if (ids.length > 1) throw new ValidationError('A specific activity contributes to one indicator');
    await db('plan_nodes').where('id', nodeId).update({ linked_indicator_id: ids[0] || null, updated_at: db.fn.now() });
    return { id: nodeId, node_type: node.node_type, indicator_ids: ids, before: node.linked_indicator_id ? [node.linked_indicator_id] : [] };
  }
  const before = await db.transaction(async (trx) => {
    const current = await trx('indicator_broad_links').where('broad_activity_id', nodeId).forUpdate().pluck('indicator_id');
    const removed = current.filter((id) => !ids.includes(id));
    const added = ids.filter((id) => !current.includes(id));
    if (removed.length) await trx('indicator_broad_links').where('broad_activity_id', nodeId).whereIn('indicator_id', removed).del();
    if (added.length) await trx('indicator_broad_links').insert(added.map((id) => ({ broad_activity_id: nodeId, indicator_id: id })));
    return current;
  });
  return { id: nodeId, node_type: node.node_type, indicator_ids: ids, before };
}

module.exports = { listMapping, setMapping };
