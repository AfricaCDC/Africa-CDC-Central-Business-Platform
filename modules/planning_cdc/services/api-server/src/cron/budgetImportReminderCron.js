/**
 * Scheduler: every working day from the configured weekday, reminds the
 * finance unit to import the MIS budget execution export until the export of
 * the week is imported (D-20261015-04).
 *
 * Delivery goes through the notification wizard: event
 * `budget_execution.import_due`, template `budget-import-status`, managed on
 * /admin/notifications.
 *
 * ADMIN-MANAGED via `app_settings`, editable on /admin/settings:
 *   reminders.budget_import.enabled  — '1' to enable (seeded '1').
 *   reminders.budget_import.weekday  — 0 (Sunday) … 6 (Saturday), UTC; seeded '1' (Monday).
 *   reminders.budget_import.hour_utc — hour of day (0-23 UTC), seeded '6'.
 *
 * From the configured weekday to Friday (never on Saturday or Sunday), from
 * the configured hour, at most once a day, also across restarts: the day is
 * skipped when the outbox already holds today's `budget_execution.import_due`
 * rows. It stops as soon as the export of the week is imported.
 *
 * Called from `src/index.js` after the server is listening.
 */
'use strict';

const db = require('../config/db');
const { createLogger } = require('@rbm/lib/logger');
const settings = require('../services/settingsService');
const { remindImportDue, EVENTS } = require('../services/budgetExecution/budgetImportReminder');

const log = createLogger('api-server').child({ module: 'budgetImportReminderCron' });

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_WEEKDAY = 1;
const DEFAULT_HOUR_UTC = 6;
let timer = null;

const SUNDAY = 0;
const SATURDAY = 6;
// Day of the week counted from Monday (0) to Sunday (6).
const fromMonday = (utcDay) => (utcDay + 6) % 7;

function isReminderTime(now, weekday, hour) {
  const today = now.getUTCDay();
  if (today === SATURDAY || today === SUNDAY) return false;
  return fromMonday(today) >= fromMonday(weekday) && now.getUTCHours() >= hour;
}

async function alreadySentToday(now) {
  const start = `${now.toISOString().slice(0, 10)} 00:00:00`;
  const row = await db('notification_outbox').where('event_key', EVENTS.DUE).where('created_at', '>=', start).first('id');
  return Boolean(row);
}

/**
 * One scheduler check: sends the reminder when enabled, on a working day from
 * the configured weekday and hour, and not yet sent today.
 *
 * @param {Date} [now]
 * @returns {Promise<{ sent: boolean, done: boolean }|null>} null when nothing was due
 * @throws {never} errors are logged
 * @example await tick(new Date('2026-10-19T07:00:00Z'));
 */
async function tick(now = new Date()) {
  try {
    if (!(await settings.getBool('reminders.budget_import.enabled', true))) return null;
    const weekday = await settings.getInt('reminders.budget_import.weekday', DEFAULT_WEEKDAY);
    const hour = await settings.getInt('reminders.budget_import.hour_utc', DEFAULT_HOUR_UTC);
    if (!isReminderTime(now, weekday, hour)) return null;
    if (await alreadySentToday(now)) return null;
    const result = await remindImportDue(now);
    log.info(result, 'budget import reminder checked (cron)');
    return result;
  } catch (err) {
    log.error({ err: err && err.message }, 'budget import reminder cron failed');
    return null;
  }
}

function start() {
  if (timer) return;
  log.info({ intervalMs: CHECK_INTERVAL_MS }, 'budget import reminder cron started');
  setTimeout(tick, 45 * 1000).unref();
  timer = setInterval(tick, CHECK_INTERVAL_MS);
  timer.unref();
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, tick };
