// ── Reporting Periods ──
//
// Extracted from `services/api-server/src/services/reportingService.js` as the
// first commit of the task #27 split. Pure CRUD over `reporting_periods`; no
// cross-service dependencies beyond the Knex handle and the shared `STATUSES`
// enum. Callers still go through `reportingService` for the transition —
// this module is the new source of truth, re-exported there.

const db = require('../../config/db');
const { STATUSES } = require('@rbm/lib/enums');

/**
 * List reporting periods ordered by fiscal year/quarter descending, optionally filtered.
 *
 * @param {object} [filters] — `status`, `fiscal_year`
 * @returns {Promise<Array<object>>} reporting period rows
 * @throws {Error} when the DB query fails
 * @example
 * const periods = await listPeriods({ status: 'OPEN' });
 */
const listPeriods = (filters = {}) => {
  const q = db('reporting_periods');
  if (filters.status) q.where('status', filters.status);
  if (filters.fiscal_year) q.where('fiscal_year', filters.fiscal_year);
  return q.orderBy([{ column: 'fiscal_year', order: 'desc' }, { column: 'quarter', order: 'desc' }]);
};

/**
 * Fetch the currently open reporting period.
 *
 * @returns {Promise<object|undefined>} the OPEN period row or undefined
 * @throws {Error} when the DB query fails
 * @example
 * const period = await getActivePeriod();
 */
const getActivePeriod = () => db('reporting_periods').where('status', STATUSES.OPEN).first();

/**
 * Fetch a reporting period by id.
 *
 * @param {number|string} id — period id
 * @returns {Promise<object|undefined>} the period row or undefined
 * @throws {Error} when the DB query fails
 * @example
 * const period = await getPeriodById(3);
 */
const getPeriodById = (id) => db('reporting_periods').where({ id }).first();

/**
 * Insert a reporting period and return the created row.
 *
 * @param {object} data — column values
 * @returns {Promise<object|undefined>} the created period row
 * @throws {Error} when the insert fails
 * @example
 * await createPeriod({ fiscal_year: 2026, quarter: 'Q1' });
 */
const createPeriod = async (data) => {
  const [id] = await db('reporting_periods').insert(data);
  return getPeriodById(id);
};

/**
 * Update a reporting period; if the new status is OPEN, automatically closes any other OPEN period.
 *
 * @param {number|string} id — period id
 * @param {object} data — partial column values (may include `status`)
 * @returns {Promise<object|undefined>} the updated period row
 * @throws {Error} when any underlying write fails
 * @example
 * await updatePeriod(3, { status: 'OPEN' });
 */
const updatePeriod = async (id, data) => {
  if (data.status === STATUSES.OPEN) {
    await db('reporting_periods')
      .where('status', STATUSES.OPEN)
      .whereNot('id', id)
      .update({ status: STATUSES.CLOSED, updated_at: db.fn.now() });
  }
  await db('reporting_periods').where({ id }).update({ ...data, updated_at: db.fn.now() });
  return getPeriodById(id);
};

module.exports = {
  listPeriods,
  getActivePeriod,
  getPeriodById,
  createPeriod,
  updatePeriod,
};
