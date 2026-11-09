/**
 * Scheduler: once a week, emails the system and RBM administrators the
 * business units that miss a responsible person, an M&E officer or a focal
 * person (D-20261015-07). Nothing is sent when every unit is complete.
 *
 * Delivery goes through the notification wizard: event
 * `org_setup.incomplete`, template `org-setup-incomplete`, managed on
 * /admin/notifications.
 *
 * ADMIN-MANAGED via `app_settings`, editable on /admin/settings:
 *   reminders.org_setup.enabled  — '1' to enable (seeded '1').
 *   reminders.org_setup.weekday  — 0 (Sunday) … 6 (Saturday), UTC; seeded '1' (Monday).
 *   reminders.org_setup.hour_utc — hour of day (0-23 UTC), seeded '7'.
 *
 * From the configured weekday and hour, at most once a week, also across
 * restarts: the week is skipped when the outbox already holds this week's
 * `org_setup.incomplete` rows.
 *
 * Called from `src/index.js` after the server is listening.
 */
'use strict';

const db = require('../config/db');
const { createLogger } = require('@rbm/lib/logger');
const settings = require('../services/settingsService');
const { remindOrgSetup, EVENT_KEY } = require('../services/orgSetup/orgSetupReminder');
const { weekStart } = require('../services/budgetExecution/budgetImportReminder');

const log = createLogger('api-server').child({ module: 'orgSetupReminderCron' });

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_WEEKDAY = 1;
const DEFAULT_HOUR_UTC = 7;
// Day of the week counted from Monday (0) to Sunday (6).
const fromMonday = (utcDay) => (utcDay + 6) % 7;
let timer = null;

async function alreadySentThisWeek(now) {
  const start = weekStart(now).toISOString().replace('T', ' ').slice(0, 19);
  const row = await db('notification_outbox').where('event_key', EVENT_KEY).where('created_at', '>=', start).first('id');
  return Boolean(row);
}

/**
 * One scheduler check: sends the weekly list when enabled, from the
 * configured weekday and hour, and not yet sent this week.
 *
 * @param {Date} [now]
 * @returns {Promise<{ sent: boolean, units: number }|null>} null when nothing was due
 * @throws {never} errors are logged
 * @example await tick(new Date('2026-10-19T08:00:00Z'));
 */
async function tick(now = new Date()) {
  try {
    if (!(await settings.getBool('reminders.org_setup.enabled', true))) return null;
    const weekday = await settings.getInt('reminders.org_setup.weekday', DEFAULT_WEEKDAY);
    const hour = await settings.getInt('reminders.org_setup.hour_utc', DEFAULT_HOUR_UTC);
    const today = fromMonday(now.getUTCDay());
    if (today < fromMonday(weekday) || (today === fromMonday(weekday) && now.getUTCHours() < hour)) return null;
    if (await alreadySentThisWeek(now)) return null;
    const result = await remindOrgSetup(now);
    log.info(result, 'org set-up reminder checked (cron)');
    return result;
  } catch (err) {
    log.error({ err: err && err.message }, 'org set-up reminder cron failed');
    return null;
  }
}

function start() {
  if (timer) return;
  log.info({ intervalMs: CHECK_INTERVAL_MS }, 'org set-up reminder cron started');
  setTimeout(tick, 60 * 1000).unref();
  timer = setInterval(tick, CHECK_INTERVAL_MS);
  timer.unref();
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, tick };
