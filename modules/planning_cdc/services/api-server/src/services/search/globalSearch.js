/**
 * Global search of the top bar (D-20261106-05): plan items of one fiscal
 * year by code or title, Business Units, AU member states. Plan items follow
 * the visibility of the plan lists: approved items for everybody, drafts and
 * items in review for their author, their focal person and administrators.
 */
'use strict';

const db = require('../../config/db');
const { NODE_TYPES, SEARCH_GROUPS } = require('@rbm/lib/enums');
const { AU_MEMBER_STATES } = require('@rbm/lib/countries');
// Same visibility as GET /api/plan-nodes.
const { PUBLIC_STATUSES } = require('../../routes/plan-nodes/_helpers');

/** Result groups, in display order. `types` = plan_nodes.node_type values. */
const PLAN_GROUPS = Object.freeze([
  { group: SEARCH_GROUPS.SPECIFIC, types: [NODE_TYPES.SPECIFIC_ACTIVITY] },
  { group: SEARCH_GROUPS.BROAD, types: [NODE_TYPES.BROAD_ACTIVITY] },
  { group: SEARCH_GROUPS.INDICATOR, types: [NODE_TYPES.OUTCOME_INDICATOR, NODE_TYPES.IMPACT_INDICATOR] },
  { group: SEARCH_GROUPS.RESULT, types: [NODE_TYPES.OUTCOME_AREA, NODE_TYPES.IMPACT] },
]);

const escapeLike = (text) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Plan items of one group: exact code first, then code prefix, then title. */
function planItems({ types, q, fiscalYear, userId, canSeeAll, limit }) {
  const like = escapeLike(q);
  const query = db('plan_nodes')
    .whereIn('node_type', types)
    .where(function match() { this.where('code', 'like', `${like}%`).orWhere('title', 'like', `%${like}%`); })
    .select('id', 'node_type', 'code', 'title', 'tier_id', 'responsible_division_code', 'status')
    .orderByRaw('CASE WHEN code = ? THEN 0 WHEN code LIKE ? THEN 1 ELSE 2 END', [q, `${like}%`])
    .orderBy('code')
    .limit(limit);
  if (fiscalYear) query.where('fiscal_year', fiscalYear);
  if (!canSeeAll) {
    query.where(function visible() {
      this.whereIn('status', PUBLIC_STATUSES).orWhere('created_by_user_id', userId).orWhere('focal_user_id', userId);
    });
  }
  return query;
}

function units(q, limit) {
  const like = escapeLike(q);
  return db('division_codes')
    .where(function match() { this.where('code', 'like', `${like}%`).orWhere('division_name', 'like', `%${like}%`); })
    .select('code', 'division_name as name', 'level_type')
    .orderByRaw('CASE WHEN code = ? THEN 0 ELSE 1 END', [q])
    .orderBy('code')
    .limit(limit);
}

function memberStates(q, limit) {
  const needle = q.toLowerCase();
  return AU_MEMBER_STATES
    .filter((c) => c.code.toLowerCase() === needle || c.name.toLowerCase().includes(needle))
    .slice(0, limit)
    .map((c) => ({ code: c.code, name: c.name, region: c.region }));
}

/**
 * Search everything the top bar can open.
 *
 * @param {{ q: string, fiscalYear?: string|null, userId: number, canSeeAll: boolean, limit?: number }} opts
 * @returns {Promise<{ q: string, fiscal_year: string|null, groups: Array<{ group: string, items: object[] }> }>}
 * @example await globalSearch({ q: 'SDI.2', fiscalYear: '2026', userId: 7, canSeeAll: false });
 */
async function globalSearch({ q, fiscalYear = null, userId, canSeeAll, limit = 6 }) {
  const planResults = await Promise.all(PLAN_GROUPS.map((g) => planItems({ ...g, q, fiscalYear, userId, canSeeAll, limit })));
  const groups = PLAN_GROUPS.map((g, i) => ({ group: g.group, items: planResults[i] }));
  groups.push({ group: SEARCH_GROUPS.UNIT, items: await units(q, limit) });
  groups.push({ group: SEARCH_GROUPS.COUNTRY, items: memberStates(q, limit) });
  return { q, fiscal_year: fiscalYear, groups: groups.filter((g) => g.items.length) };
}

module.exports = { globalSearch, PLAN_GROUPS };
