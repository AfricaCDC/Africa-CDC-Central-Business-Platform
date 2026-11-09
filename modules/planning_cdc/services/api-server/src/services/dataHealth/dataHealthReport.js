// ── Data health report and weekly email (automation roadmap, lot 2) ──
//
// D-20261105-11. GET /api/admin/data-health runs every check for one plan
// year. Each Monday the M&E officers and RBM administrators receive the
// checks that are not empty (event data_health.weekly), for the current
// year and, once its plan exists, the next one.

'use strict';

const db = require('../../config/db');
const { emitEvent } = require('../eventBusService');
const { claim } = require('../reminderLog');
const { APP_URL } = require('../reporting/reportEmailDetails');
const { isoWeek } = require('../../cron/scheduler');
const { CHECKS } = require('./dataHealthChecks');

const EVENT_KEY = 'data_health.weekly';
const ROW_LIMIT = 200;
const EMAIL_ROWS = 10;

const summary = (check, rows) => ({
  key: check.key, label: check.label, hint: check.hint, per_year: check.perYear, count: rows.length, rows: rows.slice(0, ROW_LIMIT),
});

/**
 * Every check for one plan year, with a count and up to 200 rows each.
 *
 * @param {string} fiscalYear
 * @param {{ perYearOnly?: boolean }} [opts] - skip the checks that do not depend on the year
 * @returns {Promise<{ fiscal_year: string, checks: Array<{ key: string, label: string, hint: string, per_year: boolean, count: number, rows: object[] }> }>}
 * @throws {Error} on DB failure
 * @example await buildReport('2027');
 */
async function buildReport(fiscalYear, { perYearOnly = false } = {}) {
  const checks = CHECKS.filter((c) => c.perYear || !perYearOnly);
  const results = await Promise.all(checks.map((c) => c.run(fiscalYear)));
  return { fiscal_year: fiscalYear, checks: checks.map((c, i) => summary(c, results[i])) };
}

/** The current year, and the next one once its plan has items. */
async function yearsInPlay(now) {
  const year = now.getUTCFullYear();
  const next = String(year + 1);
  const hasNext = await db('plan_nodes').where('fiscal_year', next).first('id');
  return hasNext ? [String(year), next] : [String(year)];
}

function sectionFor(check, fiscalYear) {
  const more = check.count > EMAIL_ROWS ? ` The first ${EMAIL_ROWS} are listed.` : '';
  return {
    heading: `${check.label}${check.per_year ? ` (${fiscalYear})` : ''}: ${check.count}`,
    intro: `${check.hint}${more}`,
    items: check.rows.slice(0, EMAIL_ROWS).map((r) => ({ code: r.code, title: r.name, meta: [r.detail].filter(Boolean) })),
  };
}

/**
 * Sections of the weekly email: the non-empty checks of each year in play,
 * the year-independent checks once.
 *
 * @param {Date} now
 * @returns {Promise<{ sections: object[], total: number, years: string[] }>}
 */
async function weeklySections(now) {
  const years = await yearsInPlay(now);
  const reports = await Promise.all(years.map((y, i) => buildReport(y, { perYearOnly: i > 0 })));
  const pairs = reports.flatMap((r) => r.checks.filter((c) => c.count > 0).map((c) => [c, r.fiscal_year]));
  return {
    sections: pairs.map(([c, y]) => sectionFor(c, y)),
    total: pairs.reduce((sum, [c]) => sum + c.count, 0),
    years,
  };
}

/**
 * Send this week's data health email, once per ISO week, when a check is
 * not empty.
 *
 * @param {Date} [now]
 * @returns {Promise<{ sent: boolean, total: number }>}
 * @throws {Error} on DB failure (the job logs it)
 * @example await sendWeeklyDataHealth(new Date('2026-11-09T07:00:00Z'));
 */
async function sendWeeklyDataHealth(now = new Date()) {
  const { sections, total, years } = await weeklySections(now);
  if (!total) return { sent: false, total: 0 };
  const period = isoWeek(now);
  if (!(await claim({ kind: EVENT_KEY, entityType: 'DATA_HEALTH', entityId: 0, recipientId: 0, period }))) return { sent: false, total };
  await emitEvent({
    eventKey: EVENT_KEY,
    entity: { id: 0, title: 'Data health' },
    metadata: {
      subject: `Data health: ${total} records to complete`,
      heading: 'Data to complete this week',
      intro: 'These records hold up approvals, reports or the budget follow-up until they are completed.',
      sections,
      ctaLabel: 'Open Data health',
      ctaUrl: `${APP_URL}/admin/data-health?fy=${years[years.length - 1]}`,
      footer: 'Sent every week while a check is not empty.',
    },
    correlationId: `data-health-${period}`,
  });
  return { sent: true, total };
}

module.exports = { buildReport, sendWeeklyDataHealth, EVENT_KEY };
