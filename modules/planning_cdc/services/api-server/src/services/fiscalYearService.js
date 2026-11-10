/**
 * Single source of truth for "which fiscal year is the platform working on".
 *
 * Before this service the answer was `new Date().getFullYear()`, computed
 * independently in ~34 frontend files and 8 server sites. That made the year a
 * property of the wall clock rather than of the plan: on 1 January every page
 * would silently query a fiscal year that may hold no data, and every write
 * would stamp it. It also left three routes pinned to the literal '2026'.
 *
 * The planning year is now data: an admin flips `planning.active_fiscal_year`
 * when the next workplan goes live, with no code change and no deploy.
 *
 * NOTE — planning year is NOT the reporting period. This service answers "which
 * plan are we working on"; what a user may report on is governed by the open
 * `reporting_periods` row. Do not use this to authorise a report write.
 */

'use strict';

const settingsService = require('./settingsService');

const SETTING_KEY = 'planning.active_fiscal_year';

/** Year strings are stored as bare 4-digit strings ('2026') everywhere. */
const YEAR_RE = /^\d{4}$/;

/**
 * The fiscal year the planning module currently works on.
 *
 * Falls back to the calendar year when the setting is missing or malformed, so
 * a fresh install behaves exactly as the platform did before this service.
 *
 * @returns {Promise<string>} a 4-digit year string, e.g. `'2026'`
 * @throws {never} settings failures degrade to the calendar year
 * @example const fy = await getActivePlanningYear(); // '2026'
 */
async function getActivePlanningYear() {
  const wallClock = String(new Date().getFullYear());
  try {
    const raw = await settingsService.getSetting(SETTING_KEY, null);
    const value = raw == null ? '' : String(raw).trim();
    return YEAR_RE.test(value) ? value : wallClock;
  } catch {
    return wallClock;
  }
}

/**
 * Resolve the fiscal year for a request: an explicit value always wins, the
 * active planning year is the fallback.
 *
 * Writes must pass the year the client is actually displaying — otherwise a
 * user planning 2027 while the setting still reads 2026 would silently create
 * rows in the wrong generation.
 *
 * @param {*} explicit — a value from the request (query, body); may be undefined
 * @returns {Promise<string>} a 4-digit year string
 * @example await resolveFiscalYear(req.body.fiscal_year)
 */
async function resolveFiscalYear(explicit) {
  const value = explicit == null ? '' : String(explicit).trim();
  if (YEAR_RE.test(value)) return value;
  return getActivePlanningYear();
}

module.exports = { getActivePlanningYear, resolveFiscalYear, SETTING_KEY };
