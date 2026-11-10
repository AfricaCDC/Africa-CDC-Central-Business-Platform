// ── Budget execution — weekly MIS import: status, reminder, confirmation (D-20261015-04) ──
//
// The finance unit (setting budget_execution.import_division, FMG) imports
// the MIS export once a week. The week runs Monday 00:00 → Sunday (UTC).
//   · import_due  — sent by the weekly cron when nothing was imported yet;
//   · import_done — sent when an import is made.
// Recipients are managed in the notification wizard (focal person and head of
// the unit, every active system administrator by default).

'use strict';

const db = require('../../config/db');
const { createLogger } = require('@rbm/lib/logger');
const settings = require('../settingsService');
const { emitEvent } = require('../eventBusService');
const { APP_URL } = require('../reporting/reportEmailDetails');

const log = createLogger('api-server').child({ module: 'budgetImportReminder' });

const EVENTS = Object.freeze({ DUE: 'budget_execution.import_due', DONE: 'budget_execution.import_done' });
const DIVISION_SETTING = 'budget_execution.import_division';
const DEFAULT_DIVISION = 'FMG';
const IMPORT_URL = `${APP_URL}/budget-execution/imports`;

/**
 * The finance business unit: it imports the export and sees every unit's execution.
 *
 * @returns {Promise<string>} division code (setting budget_execution.import_division)
 * @throws {Error} on DB failure
 * @example await financeDivision(); // 'FMG'
 */
async function financeDivision() {
  return (await settings.getSetting(DIVISION_SETTING, DEFAULT_DIVISION)) || DEFAULT_DIVISION;
}

/**
 * Monday 00:00 UTC of the week of `now`.
 *
 * @param {Date} now
 * @returns {Date}
 * @example weekStart(new Date('2026-10-15T10:00:00Z')); // 2026-10-12T00:00:00Z
 */
function weekStart(now) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const SHORT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const LONG = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * ISO week of a Monday and its label, e.g. "Week 43 (19 Oct – 25 Oct 2026)".
 *
 * @param {Date} start - Monday 00:00 UTC (from weekStart)
 * @returns {{ number: number, label: string }}
 * @example weekLabel(new Date('2026-10-19T00:00:00Z')); // { number: 43, label: 'Week 43 (19 Oct – 25 Oct 2026)' }
 */
function weekLabel(start) {
  // ISO week: the week holding the year's first Thursday is week 1.
  const thursday = new Date(start.getTime() + 3 * 86400000);
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const number = Math.floor((thursday.getTime() - jan1) / (7 * 86400000)) + 1;
  const end = new Date(start.getTime() + 6 * 86400000);
  const from = start.getUTCFullYear() === end.getUTCFullYear() ? SHORT.format(start) : LONG.format(start);
  return { number, label: `Week ${number} (${from} – ${LONG.format(end)})` };
}

/**
 * Was the MIS export imported this week? With the latest import.
 *
 * @param {Date} [now]
 * @returns {Promise<{ week_start: string, week_number: number, week_label: string, done: boolean, last_import: object|null }>}
 * @throws {Error} on DB failure
 * @example await importStatus();
 */
async function importStatus(now = new Date()) {
  const start = weekStart(now);
  const last = await db('budget_execution_imports as i').leftJoin('users as u', 'u.id', 'i.imported_by')
    .orderBy('i.created_at', 'desc').orderBy('i.id', 'desc')
    .first('i.id', 'i.fiscal_year', 'i.as_of_date', 'i.created_at', 'i.file_name',
      db.raw("TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) as imported_by_name"));
  const done = Boolean(last && new Date(last.created_at) >= start);
  const week = weekLabel(start);
  return { week_start: day(start), week_number: week.number, week_label: week.label, done, last_import: last || null };
}

async function entity(importId) {
  const division = await financeDivision();
  return { id: importId || 0, title: 'Budget execution import', main_division_code: String(division).toUpperCase() };
}

/**
 * Weekly reminder: emails the import team when nothing was imported this week.
 *
 * @param {Date} [now]
 * @returns {Promise<{ sent: boolean, done: boolean }>}
 * @throws {never} errors are logged
 * @example await remindImportDue();
 */
async function remindImportDue(now = new Date()) {
  try {
    const status = await importStatus(now);
    if (status.done) return { sent: false, done: true };
    await emitEvent({
      eventKey: EVENTS.DUE,
      entity: await entity(null),
      correlationId: `budget-import-due-${status.week_start}`,
      metadata: {
        status: 'due', weekStart: status.week_start, weekLabel: status.week_label, url: IMPORT_URL,
        lastAsOf: day(status.last_import?.as_of_date), lastImportedBy: status.last_import?.imported_by_name || null,
      },
    });
    return { sent: true, done: false };
  } catch (err) {
    log.error({ err }, 'budget import reminder failed');
    return { sent: false, done: false };
  }
}

/**
 * Confirmation that this week's MIS export was imported.
 *
 * @param {{ importRow: object, created: object, notifiedDivisions: number, actor: object }} p
 * @returns {Promise<void>}
 * @throws {never} errors are logged
 * @example await notifyImportDone({ importRow, created, notifiedDivisions: 12, actor: req.user });
 */
async function notifyImportDone({ importRow, created, notifiedDivisions, actor }) {
  try {
    const name = `${actor.first_name || ''} ${actor.last_name || ''}`.trim() || actor.email || '';
    await emitEvent({
      eventKey: EVENTS.DONE,
      entity: await entity(importRow.id),
      actor,
      correlationId: `budget-import-done-${importRow.id}`,
      metadata: {
        status: 'done', weekStart: day(weekStart(new Date())), weekLabel: weekLabel(weekStart(new Date())).label,
        url: `${APP_URL}/`,
        asOf: day(importRow.as_of_date), fiscalYear: importRow.fiscal_year, importedBy: name,
        fundCenters: created.fund_center_count, lines: created.line_count, notifiedDivisions,
      },
    });
  } catch (err) {
    log.error({ err, importId: importRow.id }, 'budget import confirmation failed');
  }
}

module.exports = { financeDivision, importStatus, remindImportDue, notifyImportDone, weekStart, weekLabel, EVENTS };
