// ── Admin Reference Data Service ──
//
// Extracted from `services/api-server/src/services/adminService.js` as the
// third service-layer commit of the task #28 split (commit 3/N,
// D-20260418-19). Pure read helpers for the reference tables that back
// admin dropdowns and hierarchy forms.
//
// Consumed via the adminService facade — existing callers
// `require('../services/adminService')` continue to resolve these names
// through the parent aggregator's spread export.
//
// Scope — 7 exports:
//   · Business units (2):   getBusinessUnits, getBusinessUnitById
//   · Reference tables (3): getTiers, getStrategicPlan, getDivisionCodes
//   · Partners / member states (2): getPartners, getMemberStates
// (teams, countries and the next-code generator went with the legacy
// strategy pages, D-20261106-14)

const db = require('../../config/db');
const { AU_MEMBER_STATES } = require('@rbm/lib/countries');

// ── Business Units ─────────────────────────────────────────────────────

/**
 * List all business units ordered by id.
 *
 * @returns {Promise<Array<object>>} business unit rows
 * @throws {Error} when the DB query fails
 * @example
 * const bus = await getBusinessUnits();
 */
const getBusinessUnits = () => db('business_units').orderBy('id');

/**
 * Fetch a business unit by id.
 *
 * @param {number|string} id — business unit id
 * @returns {Promise<object|undefined>} business unit row or undefined
 * @throws {Error} when the DB query fails
 * @example
 * const bu = await getBusinessUnitById(4);
 */
const getBusinessUnitById = (id) => db('business_units').where({ id }).first();

// ── Reference Data (read-only) ─────────────────────────────────────────

/**
 * List reference tiers ordered by tier_id.
 *
 * @returns {Promise<Array<object>>} tier rows
 * @throws {Error} when the DB query fails
 * @example
 * const tiers = await getTiers();
 */
const getTiers = () => db('tiers').orderBy('tier_id');

/**
 * List strategic plan reference rows ordered by their numeric SP index.
 *
 * @returns {Promise<Array<object>>} strategic plan rows
 * @throws {Error} when the DB query fails
 * @example
 * const rows = await getStrategicPlan();
 */
const getStrategicPlan = () => db('strategic_plan').orderBy('sp_number_int');

/**
 * List every division code row ordered by code.
 *
 * @returns {Promise<Array<object>>} division_codes rows
 * @throws {Error} when the DB query fails
 * @example
 * const codes = await getDivisionCodes();
 */
const getDivisionCodes = () => db('division_codes').orderBy('code');

// ── Partners / Member States ──────────────────────────────────────────

/**
 * List all partners ordered by name.
 *
 * @returns {Promise<Array<object>>} partner rows
 * @throws {Error} when the DB query fails
 * @example
 * const partners = await getPartners();
 */
const getPartners = () => db('partners').orderBy('partner_name');

/**
 * The 55 African Union member states with their region, ordered by name,
 * from `@rbm/lib/countries` (D-20261106-06): the legacy `member_states`
 * table was never filled.
 *
 * @returns {Promise<Array<{ code: string, name: string, region: string }>>}
 * @throws {never}
 * @example
 * const ms = await getMemberStates(); // [{ code: 'DZA', name: 'Algeria', region: 'Northern' }, ...]
 */
const getMemberStates = async () => [...AU_MEMBER_STATES].sort((a, b) => a.name.localeCompare(b.name));

module.exports = {
  getBusinessUnits,
  getBusinessUnitById,
  getTiers,
  getStrategicPlan,
  getDivisionCodes,
  getPartners,
  getMemberStates,
};
