/**
 * Server-side guard on reporting writes.
 *
 * Planning and execution are two different questions. A user may plan on a
 * future fiscal year (that is the point of loading FY2027 a year ahead), but
 * must never be able to report on it: there is nothing to report on a year
 * that has not started.
 *
 * Until now nothing enforced that. `quarter` and `fiscal_year` arrived from the
 * client as free strings and were never confronted with `reporting_periods`, so
 * `{quarter:'Q9', fiscal_year:'1999'}` was accepted, stored, routed through
 * approval and counted in aggregates. Production carries the proof: one report
 * labelled Q4 FY2026 created on 9 July 2026, for a period that never existed
 * (anomaly A-15).
 *
 * Two levels, on purpose:
 * - `assertReportableYear` / `assertReportableNode` — a HARD refusal, never
 *   configurable. A future year is not an operational choice.
 * - `assertOpenPeriod` — governed by the `reporting.enforce_open_period`
 *   setting, logging a warning by default so nothing breaks on deploy. It is
 *   switched on when the operation is ready.
 *
 * @see docs/DATA_ANOMALIES.md — A-14, A-15
 */

'use strict';

const { ApiError } = require('@rbm/lib/errors');
const { createLogger } = require('@rbm/lib/logger');
const { STATUSES } = require('@rbm/lib/enums');
const settingsService = require('./settingsService');

const logger = createLogger('reporting-window');

const ENFORCE_KEY = 'reporting.enforce_open_period';
const YEAR_RE = /^\d{4}$/;

/** Thrown when the caller aims at a fiscal year that has not started. */
const NOT_STARTED = 'FISCAL_YEAR_NOT_STARTED';
/** Thrown when no reporting period is open for the requested quarter. */
const NO_OPEN_PERIOD = 'REPORTING_PERIOD_NOT_OPEN';

/**
 * The last fiscal year a user may report on: the current calendar year.
 *
 * Deliberately the wall clock and not `planning.active_fiscal_year`. The
 * planning setting is flipped early, precisely so divisions can prepare the
 * next plan; using it here would re-open reporting on a year that has not
 * begun, which is the whole thing this service prevents.
 *
 * @returns {number}
 * @example latestReportableYear() // 2026
 */
function latestReportableYear() {
  return new Date().getFullYear();
}

/**
 * Refuse a reporting write aimed at a fiscal year that has not started.
 *
 * @param {*} fiscalYear — value from the request or from the plan node
 * @returns {void}
 * @throws {ApiError} 403 `FISCAL_YEAR_NOT_STARTED` when the year is in the future
 * @example assertReportableYear('2027') // throws while we are in 2026
 */
function assertReportableYear(fiscalYear) {
  const value = fiscalYear === null || fiscalYear === undefined ? '' : String(fiscalYear).trim();
  if (!YEAR_RE.test(value)) return; // nothing to judge; other validation owns this
  const year = Number(value);
  const latest = latestReportableYear();
  if (year > latest) {
    throw new ApiError(
      NOT_STARTED,
      `Fiscal year ${year} has not started. You can plan activities for ${year}, but reporting only opens once the year begins.`,
      403,
    );
  }
}

/**
 * Refuse a reporting write against a plan node that belongs to a future year.
 *
 * Keyed on the node rather than on the request body: the year of a report is a
 * property of what is being reported on, and a client that omits or fakes
 * `fiscal_year` must not escape the guard.
 *
 * @param {import('knex')} knex
 * @param {number} planNodeId
 * @returns {Promise<string|null>} the node's fiscal year, or null if unknown
 * @throws {ApiError} 403 `FISCAL_YEAR_NOT_STARTED`
 * @example await assertReportableNode(db, 42)
 */
async function assertReportableNode(knex, planNodeId) {
  const id = parseInt(planNodeId, 10);
  if (!Number.isFinite(id)) return null;
  const node = await knex('plan_nodes').where('id', id).first('fiscal_year');
  if (!node) return null;
  assertReportableYear(node.fiscal_year);
  return node.fiscal_year || null;
}

/**
 * True when the open-period rule is enforced rather than merely logged.
 *
 * @returns {Promise<boolean>}
 * @example if (await isOpenPeriodEnforced()) { ... }
 */
async function isOpenPeriodEnforced() {
  try {
    const raw = await settingsService.getSetting(ENFORCE_KEY, null);
    return ['1', 'true', 'yes'].includes(String(raw == null ? '' : raw).trim().toLowerCase());
  } catch {
    // A settings outage must not start refusing writes that used to pass.
    return false;
  }
}

/**
 * Require an OPEN `reporting_periods` row for the given quarter and year.
 *
 * Warns by default, refuses once `reporting.enforce_open_period` is on.
 *
 * @param {import('knex')} knex
 * @param {string} quarter — 'Q1'..'Q4'
 * @param {*} fiscalYear
 * @returns {Promise<boolean>} true when a matching open period exists
 * @throws {ApiError} 403 `REPORTING_PERIOD_NOT_OPEN` when enforced and closed
 * @example await assertOpenPeriod(db, 'Q2', '2026')
 */
async function assertOpenPeriod(knex, quarter, fiscalYear) {
  if (!quarter || !fiscalYear) return true;
  const open = await knex('reporting_periods')
    .where({ quarter: String(quarter), fiscal_year: Number(fiscalYear), status: 'OPEN' })
    .first('id');
  if (open) return true;

  if (await isOpenPeriodEnforced()) {
    throw new ApiError(
      NO_OPEN_PERIOD,
      `No reporting window is open for ${quarter} ${fiscalYear}. Ask an administrator to open the period.`,
      403,
    );
  }
  logger.warn('[reportingWindow] write accepted outside any open period', { quarter, fiscalYear });
  return false;
}

/**
 * Keep only the report rows whose quarter has an OPEN reporting period: a
 * reminder about a closed window asks for something the user cannot do.
 *
 * @param {import('knex').Knex.QueryBuilder} query - selects from a report table
 * @param {string} [alias] - alias of that table (needs `quarter`, `fiscal_year`)
 * @returns {import('knex').Knex.QueryBuilder} the same query, filtered
 * @example whereOpenPeriod(db('indicator_division_reports as r'), 'r');
 */
function whereOpenPeriod(query, alias = 'r') {
  return query.whereExists(function openPeriod() {
    this.from('reporting_periods as rp').select('rp.id')
      .whereRaw('rp.quarter = ?? AND rp.fiscal_year = ??', [`${alias}.quarter`, `${alias}.fiscal_year`])
      .where('rp.status', STATUSES.OPEN);
  });
}

const QUARTER_RE = /^Q[1-4]$/;

/**
 * Quarter a report is written for when the client did not say: the OPEN
 * reporting period of that fiscal year, else the calendar quarter. A window
 * runs past its quarter (the Q3 window closes on 30 October), so the calendar
 * alone files reports under the wrong quarter.
 *
 * @param {import('knex')} knex
 * @param {*} fiscalYear
 * @param {string} [requested] — the client's quarter, used when valid
 * @returns {Promise<string>} 'Q1'..'Q4'
 * @throws {Error} on DB failure
 * @example await reportingQuarter(db, '2026'); // 'Q3' while the Q3 window is open
 */
async function reportingQuarter(knex, fiscalYear, requested) {
  const asked = String(requested || '').toUpperCase();
  if (QUARTER_RE.test(asked)) return asked;
  const open = await knex('reporting_periods')
    .where({ fiscal_year: Number(fiscalYear), status: 'OPEN' })
    .orderBy('start_date', 'desc')
    .first('quarter');
  return (open && open.quarter) || `Q${Math.floor(new Date().getMonth() / 3) + 1}`;
}

module.exports = {
  reportingQuarter,
  whereOpenPeriod,
  assertReportableYear,
  assertReportableNode,
  assertOpenPeriod,
  isOpenPeriodEnforced,
  latestReportableYear,
  ENFORCE_KEY,
  NOT_STARTED,
  NO_OPEN_PERIOD,
};
