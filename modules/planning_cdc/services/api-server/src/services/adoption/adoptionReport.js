/**
 * Adoption of the platform (D-20261106-03): for every active user, the last
 * sign-in, the onboarding tour and what they submitted (specific activities,
 * activity reports, quarterly indicator reports). Read by administrators to
 * follow up with the users who have not started.
 */
'use strict';

const db = require('../../config/db');
const { ADOPTION_FILTERS, TOUR_OUTCOMES, NODE_TYPES } = require('@rbm/lib/enums');

const ACTIVE_USER = 'ACTIVE';
const PAGE_SIZE = 15;
const RECENT_DAYS = 30;

/** Per-user count and last date of one kind of submission. */
const submissions = (table, userColumn, extra = (q) => q) => extra(db(table))
  .whereNotNull('submitted_at')
  .groupBy(userColumn)
  .select(`${userColumn} as user_id`)
  .count({ n: '*' })
  .max({ at: 'submitted_at' });

/** Active human users with their three submission counts joined. */
function baseQuery() {
  return db('users as u')
    .leftJoin(submissions('plan_nodes', 'created_by_user_id', (q) => q.where('node_type', NODE_TYPES.SPECIFIC_ACTIVITY)).as('s'), 's.user_id', 'u.id')
    .leftJoin(submissions('activity_reports', 'user_id').as('a'), 'a.user_id', 'u.id')
    .leftJoin(submissions('indicator_division_reports', 'submitted_by').as('i'), 'i.user_id', 'u.id')
    .where(function active() { this.where('u.status', ACTIVE_USER).orWhereNull('u.status'); })
    .where(function human() { this.where('u.is_bot', 0).orWhereNull('u.is_bot'); });
}

const neverSubmitted = (q) => q.whereNull('s.user_id').whereNull('a.user_id').whereNull('i.user_id');

const FILTERS = Object.freeze({
  [ADOPTION_FILTERS.NEVER_SIGNED_IN]: (q) => q.whereNull('u.last_login_at'),
  [ADOPTION_FILTERS.NO_TOUR]: (q) => q.whereNull('u.tour_version_seen'),
  [ADOPTION_FILTERS.TOUR_SKIPPED]: (q) => q.where('u.tour_outcome', TOUR_OUTCOMES.SKIPPED),
  [ADOPTION_FILTERS.NEVER_SUBMITTED]: neverSubmitted,
});

function applyFilters(q, { filter, search, unit }) {
  if (filter) FILTERS[filter](q);
  if (unit) q.where('u.division_code', unit);
  if (search) {
    const like = `%${search}%`;
    q.where(function match() { this.where('u.full_name', 'like', like).orWhere('u.email', 'like', like); });
  }
  return q;
}

/** Counts over every active user, whatever the filters. */
async function summary() {
  const since = new Date(Date.now() - RECENT_DAYS * 86400000);
  const [row] = await baseQuery().select(
    db.raw('COUNT(*) as users'),
    db.raw('SUM(u.last_login_at IS NULL) as never_signed_in'),
    db.raw('SUM(u.last_login_at >= ?) as signed_in_recently', [since]),
    db.raw('SUM(u.tour_version_seen IS NOT NULL) as tour_taken'),
    db.raw('SUM(u.tour_outcome = ?) as tour_skipped', [TOUR_OUTCOMES.SKIPPED]),
    db.raw('SUM(s.user_id IS NULL AND a.user_id IS NULL AND i.user_id IS NULL) as never_submitted'),
  );
  return Object.fromEntries(Object.entries(row || {}).map(([k, v]) => [k, Number(v) || 0]));
}

const latest = (...dates) => dates.filter(Boolean).map((d) => new Date(d)).sort((x, y) => y - x)[0] || null;

/** Role codes of the listed users, by user id. */
async function rolesOf(ids) {
  if (!ids.length) return {};
  const rows = await db('user_roles as ur').join('roles as r', 'r.id', 'ur.role_id').whereIn('ur.user_id', ids).select('ur.user_id', 'r.code');
  return rows.reduce((acc, r) => ({ ...acc, [r.user_id]: [...(acc[r.user_id] || []), r.code] }), {});
}

/**
 * One page of the adoption list and the summary.
 *
 * @param {{ filter?: string, search?: string, unit?: string, page?: number }} opts
 * @returns {Promise<{ summary: object, rows: object[], total: number, page: number, page_size: number, recent_days: number }>}
 * @example await adoptionReport({ filter: 'NEVER_SIGNED_IN', page: 1 });
 */
async function adoptionReport({ filter = null, search = '', unit = '', page = 1 } = {}) {
  const opts = { filter, search, unit };
  const [{ total }] = await applyFilters(baseQuery(), opts).count({ total: '*' });
  const rows = await applyFilters(baseQuery(), opts)
    .select('u.id', 'u.full_name', 'u.email', 'u.division_code', 'u.last_login_at', 'u.tour_version_seen', 'u.tour_outcome',
      's.n as specifics', 's.at as specifics_at', 'a.n as activity_reports', 'a.at as activity_reports_at',
      'i.n as indicator_reports', 'i.at as indicator_reports_at')
    .orderBy('u.full_name')
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const roles = await rolesOf(rows.map((r) => r.id));
  return {
    summary: await summary(),
    total: Number(total) || 0,
    page,
    page_size: PAGE_SIZE,
    recent_days: RECENT_DAYS,
    rows: rows.map((r) => ({
      id: r.id, full_name: r.full_name, email: r.email, unit_code: r.division_code, roles: roles[r.id] || [],
      last_login_at: r.last_login_at, tour_version_seen: r.tour_version_seen, tour_outcome: r.tour_outcome,
      submitted: { specifics: Number(r.specifics) || 0, activity_reports: Number(r.activity_reports) || 0, indicator_reports: Number(r.indicator_reports) || 0 },
      last_submitted_at: latest(r.specifics_at, r.activity_reports_at, r.indicator_reports_at),
    })),
  };
}

module.exports = { adoptionReport, PAGE_SIZE };
