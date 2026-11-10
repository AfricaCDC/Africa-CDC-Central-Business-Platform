// ── Country workplan (D-20261028-01) ──
//
// The specific activities planned in a country: every activity located in the
// country, whichever unit carries it. Only countries with a country office
// have a workplan (D-20261103-03). Seen by the members of that country office
// (division_codes.is_country_office + country_code) and by whoever reads the
// workplan at scope « all ».

'use strict';

const db = require('../config/db');
const { countryByCode } = require('@rbm/lib/countries');
const { NODE_TYPES, STATUSES, RBAC_SCOPES } = require('@rbm/lib/enums');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const rbacService = require('./rbacService');
const { PUBLIC_STATUSES } = require('../routes/plan-nodes/_helpers');

// Planned work a country director may see: published plus submitted, never drafts.
const VISIBLE_STATUSES = [...PUBLIC_STATUSES, STATUSES.IN_REVIEW];

// Locations that carry at least one visible activity of the year.
const plannedLocations = (fiscalYear) => db('plan_nodes')
  .where('node_type', NODE_TYPES.SPECIFIC_ACTIVITY)
  .where('fiscal_year', fiscalYear)
  .whereIn('status', VISIBLE_STATUSES)
  .whereNotNull('location')
  .distinct('location')
  .pluck('location');

// Countries that have a country office; with a user id, only the offices they belong to.
const countryOfficeCountries = (userId) => {
  const q = db('division_codes as d').where('d.is_country_office', true);
  if (userId) q.join('user_divisions as ud', 'ud.division_code', 'd.code').where('ud.user_id', userId);
  return q.distinct('d.country_code').pluck('d.country_code');
};

const toCountries = (codes) => codes.map(countryByCode).filter(Boolean).map(({ code, name }) => ({ code, name }));

/**
 * Countries whose workplan the user may open (ISO 27001 A.5.15): only countries
 * with a country office (D-20261103-03); all of them for a workplan reader at
 * scope « all », else those of the country offices the user belongs to. With a
 * fiscal year, a scope « all » reader only gets the countries that have
 * activities that year, so the picker never offers an empty country; a country
 * office member keeps their country.
 *
 * @param {number} userId
 * @param {string} [fiscalYear] - 4-digit year; omit for the full access list
 * @returns {Promise<Array<{ code: string, name: string }>>}
 * @throws {Error} on DB failure
 * @example await viewableCountries(12, '2026') // [{ code: 'KEN', name: 'Kenya' }]
 */
async function viewableCountries(userId, fiscalYear) {
  const { allowed, scope } = await rbacService.checkPermission(userId, RBAC_MODULES.WORKPLAN, RBAC_ACTIONS.READ);
  if (allowed && scope === RBAC_SCOPES.ALL) {
    const all = toCountries(await countryOfficeCountries());
    if (!fiscalYear) return all;
    const planned = new Set(await plannedLocations(fiscalYear));
    return all.filter((c) => planned.has(c.name));
  }
  return toCountries(await countryOfficeCountries(userId));
}

/**
 * Specific activities of a fiscal year located in the country.
 *
 * @param {{ countryName: string, fiscalYear: string }} p
 * @returns {Promise<object[]>} id, code, title, status, division, location, dates, budget, focal person
 * @throws {Error} on DB failure
 * @example await countryActivities({ countryName: 'Kenya', fiscalYear: '2027' });
 */
async function countryActivities({ countryName, fiscalYear }) {
  const rows = await db('plan_nodes as p')
    .leftJoin('division_codes as d', 'd.code', 'p.responsible_division_code')
    .leftJoin('users as u', 'u.id', 'p.focal_user_id')
    .where('p.node_type', NODE_TYPES.SPECIFIC_ACTIVITY)
    .where('p.fiscal_year', fiscalYear)
    .whereIn('p.status', VISIBLE_STATUSES)
    // One place per activity: the location is the country name.
    .where('p.location', countryName)
    .orderBy('p.code')
    .select(
      'p.id', 'p.code', 'p.title', 'p.status', 'p.location', 'p.start_date', 'p.end_date', 'p.budget_main',
      'p.responsible_division_code', 'd.division_name', 'u.full_name as focal_name',
    );
  return rows.map((r) => ({ ...r, budget_main: Number(r.budget_main) || 0 }));
}

module.exports = { viewableCountries, countryActivities, VISIBLE_STATUSES };
