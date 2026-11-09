// ── Monthly digest for directors (automation roadmap, lot 7) ──
//
// D-20261105-15. One digest per directorate with a Responsible Person: its
// plan, what waits for a decision, the high-risk activities, the reports of
// the quarter and the budget execution of its units. The page /digest shows
// it (printable); on `digest.monthly.day` each director is emailed a summary
// with the link (event digest.monthly).

'use strict';

const db = require('../../config/db');
const { emitEvent } = require('../eventBusService');
const { claim } = require('../reminderLog');
const { APP_URL } = require('../reporting/reportEmailDetails');
const { getDirectorateChildren } = require('../divisionAliasService');
const { latestReportableYear, reportingQuarter } = require('../reportingWindowService');
const { ORG_LEVEL_TYPES, STATUS_LABELS } = require('@rbm/lib/enums');
const sections = require('./digestSections');

const EVENT_KEY = 'digest.monthly';
const WAITING_DAYS = 7;
const DAY_MS = 86400000;
const EMAIL_ROWS = 5;

/**
 * Directorates with a Responsible Person, optionally limited to some codes.
 *
 * @param {string[]|null} [codes] - null = every directorate
 * @returns {Promise<Array<{ code: string, name: string, responsible_user_id: number }>>}
 * @example await directorates(['DSI']);
 */
async function directorates(codes = null) {
  const q = db('division_codes').where('level_type', ORG_LEVEL_TYPES.DIRECTORATE).whereNull('alias_of')
    .whereNotNull('responsible_user_id').orderBy('code')
    .select('code', 'division_name as name', 'responsible_user_id');
  if (codes) q.whereIn('code', codes.length ? codes : ['']);
  return q;
}

/**
 * The digest of one directorate.
 *
 * @param {{ code: string, name: string }} directorate
 * @param {Date} [now]
 * @returns {Promise<object>} the sections, with the year, quarter and units read
 * @throws {Error} on DB failure
 * @example await buildDigest({ code: 'DSI', name: 'Science and Innovation' });
 */
async function buildDigest(directorate, now = new Date()) {
  const units = (await getDirectorateChildren(directorate.code)).map((c) => String(c).toUpperCase());
  const fiscalYear = String(latestReportableYear());
  const quarter = await reportingQuarter(db, fiscalYear);
  const [specifics, waiting, highRisk, activityReports, indicatorReports, budget] = await Promise.all([
    sections.specificsByStatus(units, fiscalYear),
    sections.waitingApprovals(units, new Date(now.getTime() - WAITING_DAYS * DAY_MS)),
    sections.highRisk(units, fiscalYear),
    sections.activityReports(units, fiscalYear, quarter),
    sections.indicatorReports(units, fiscalYear, quarter),
    sections.budget(units, fiscalYear),
  ]);
  return {
    directorate: { code: directorate.code, name: directorate.name }, units, fiscal_year: fiscalYear, quarter,
    waiting_days: WAITING_DAYS, specifics, waiting, high_risk: highRisk, activity_reports: activityReports,
    indicator_reports: indicatorReports, budget,
  };
}

const countsLine = (rows) => rows.map((r) => `${STATUS_LABELS[r.status] || r.status} ${r.count}`).join(' · ') || 'None';

function budgetSection(b) {
  if (!b) return null;
  return {
    heading: `Budget execution (figures as at ${b.as_of})`,
    items: b.units.map((u) => ({ code: u.code, title: u.name, meta: [`execution ${u.execution_pct ?? 0} %`, u.flagged ? `${u.flagged} to look at` : null] })),
  };
}

/**
 * The email of a digest (template automation-notice).
 *
 * @param {object} d - from buildDigest
 * @param {string} month - e.g. 'November 2026'
 * @returns {object} automation-notice metadata
 * @example noticeFor(await buildDigest(dir), 'November 2026');
 */
function noticeFor(d, month) {
  const list = (items, meta) => items.slice(0, EMAIL_ROWS).map((i) => ({ code: i.code, title: i.title, meta: meta(i) }));
  return {
    subject: `Monthly digest ${d.directorate.code}: ${month}`,
    heading: `${d.directorate.name}: monthly digest`,
    intro: `The situation of the ${d.units.length} units of the directorate for ${d.fiscal_year}, ${d.quarter} reporting.`,
    sections: [
      { heading: `Specific activities ${d.fiscal_year}`, intro: countsLine(d.specifics) },
      { heading: `Waiting more than ${d.waiting_days} days for a decision: ${d.waiting.count}`, items: list(d.waiting.items, (i) => [i.type_label, i.unit_code, `since ${i.since}`]) },
      { heading: `High-risk activities: ${d.high_risk.count}`, items: list(d.high_risk.items, (i) => [i.unit_code, i.start_day ? `starts ${i.start_day}` : null]) },
      { heading: `Activity reports ${d.quarter}`, intro: `${countsLine(d.activity_reports.by_status)}. Not started: ${d.activity_reports.not_started}.` },
      { heading: `Indicator reports ${d.quarter}`, intro: `${d.indicator_reports.owned} T3/T4 indicators owned. ${countsLine(d.indicator_reports.by_status)}.` },
      budgetSection(d.budget),
    ].filter(Boolean),
    ctaLabel: 'Open the full digest',
    ctaUrl: `${APP_URL}/digest?code=${encodeURIComponent(d.directorate.code)}`,
    footer: 'Sent once a month. The page can be printed or saved as PDF.',
  };
}

/**
 * Email each director the digest of their directorate, once per month.
 *
 * @param {Date} [now]
 * @returns {Promise<{ sent: number }>}
 * @throws {Error} on DB failure (the job logs it)
 * @example await sendMonthlyDigests(new Date('2026-12-01T06:00:00Z'));
 */
async function sendMonthlyDigests(now = new Date()) {
  const period = now.toISOString().slice(0, 7);
  const month = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  let sent = 0;
  for (const dir of await directorates()) {
    if (!(await claim({ kind: EVENT_KEY, entityType: 'DIGEST', entityId: 0, recipientId: dir.responsible_user_id, period: `${period}-${dir.code}` }))) continue;
    await emitEvent({
      eventKey: EVENT_KEY,
      entity: { id: 0, title: `Monthly digest ${dir.code}`, owner_user_id: dir.responsible_user_id },
      metadata: noticeFor(await buildDigest(dir, now), month),
      correlationId: `digest-${period}-${dir.code}`,
    });
    sent += 1;
  }
  return { sent };
}

module.exports = { directorates, buildDigest, noticeFor, sendMonthlyDigests, EVENT_KEY };
