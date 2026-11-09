/**
 * Scheduler: every weekday, reminds each approver (M&E officers, HODs) of the
 * reports waiting for their decision on /review-submissions (D-20261015-01).
 *
 * Delivery goes through the notification wizard: event `review_queue.pending`,
 * template `review-pending-reminder`, managed on /admin/notifications.
 *
 * ADMIN-MANAGED via `app_settings`, editable on /admin/settings:
 *   reminders.review.enabled   — '1' to enable (seeded '1').
 *   reminders.review.hour_utc  — hour of day (0-23 UTC), seeded '6'.
 *
 * At most once per UTC day, also across restarts: the day is skipped when
 * the outbox already holds today's `review_queue.pending` rows.
 *
 * Called from `src/index.js` after the server is listening.
 */
'use strict';

const db = require('../config/db');
const { createLogger } = require('@rbm/lib/logger');
const settings = require('../services/settingsService');
const { remindPendingReviews, EVENT_KEY } = require('../services/reporting/reviewQueueReminders');

const log = createLogger('api-server').child({ module: 'reviewPendingReminderCron' });

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_HOUR_UTC = 6;
const WEEKEND = [0, 6];
let timer = null;

const todayUtcISO = (now) => now.toISOString().slice(0, 10);

async function alreadySentToday(now) {
  const row = await db('notification_outbox')
    .where('event_key', EVENT_KEY)
    .where('created_at', '>=', `${todayUtcISO(now)} 00:00:00`)
    .first('id');
  return Boolean(row);
}

/**
 * One scheduler check: sends today's reminders when enabled, on a weekday,
 * past the configured hour, and not yet sent today.
 *
 * @param {Date} [now]
 * @returns {Promise<{ approvers: number, items: number }|null>} null when nothing was due
 * @throws {never} errors are logged
 * @example await tick(new Date('2026-10-15T07:00:00Z'));
 */
async function tick(now = new Date()) {
  try {
    if (!(await settings.getBool('reminders.review.enabled', true))) return null;
    if (WEEKEND.includes(now.getUTCDay())) return null;
    const targetHour = await settings.getInt('reminders.review.hour_utc', DEFAULT_HOUR_UTC);
    if (now.getUTCHours() < targetHour) return null;
    if (await alreadySentToday(now)) return null;
    const result = await remindPendingReviews({ correlationId: `review-reminder-${todayUtcISO(now)}` });
    log.info(result, 'pending-review reminders enqueued (cron)');
    return result;
  } catch (err) {
    log.error({ err: err && err.message }, 'pending-review reminders cron failed');
    return null;
  }
}

function start() {
  if (timer) return;
  log.info({ intervalMs: CHECK_INTERVAL_MS }, 'pending-review reminders cron started');
  setTimeout(tick, 30 * 1000).unref();
  timer = setInterval(tick, CHECK_INTERVAL_MS);
  timer.unref();
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, tick };
