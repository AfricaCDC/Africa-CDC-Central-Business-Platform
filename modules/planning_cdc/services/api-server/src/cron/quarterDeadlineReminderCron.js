/**
 * Scheduler: reminds APPROVERS that reports are awaiting their decision as a
 * reporting window approaches its close date.
 *
 * For every OPEN reporting period whose `end_date` is exactly N days away
 * (N ∈ `reminders.deadline.days_before`, default 7/3/1), it collects the
 * current pending approval step of every IN_REVIEW indicator report, groups
 * by the assigned approver, and enqueues one email per approver into
 * `notification_outbox`. The notification-service worker delivers them.
 *
 * Configuration is ADMIN-MANAGED via `app_settings` (D-20260707-01) — no env
 * vars, no redeploy. Editable on /admin/settings:
 *   reminders.deadline.enabled       — '1' to enable (seeded '0').
 *   reminders.deadline.days_before   — CSV of days-before, seeded '7,3,1'.
 *   reminders.deadline.hour_utc      — hour of day (0-23 UTC), seeded '6'.
 *
 * The timer always runs; each tick re-reads the settings, so toggling the
 * flag in the admin UI takes effect within one poll interval (≤15 min).
 * Idempotent-per-day: fires at most once per UTC day.
 *
 * Called from `src/index.js` after the server is listening.
 */
'use strict';

const db = require('../config/db');
const { STATUSES } = require('@rbm/lib/enums');
const { createLogger } = require('@rbm/lib/logger');
const settings = require('../services/settingsService');
const { daysUntil, remindForPeriod } = require('../services/reporting/deadlineReminders');

const log = createLogger('api-server').child({ module: 'quarterDeadlineReminderCron' });

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 min — cheap "is it time yet" check
const DEFAULT_DAYS = [7, 3, 1];
const DEFAULT_HOUR_UTC = 6;
let lastRunDate = null;
let timer = null;

function todayUtcISO() {
  return new Date().toISOString().slice(0, 10);
}

async function collectAndEnqueue(now = new Date()) {
  const days = await settings.getIntList('reminders.deadline.days_before', DEFAULT_DAYS);
  const openPeriods = await db('reporting_periods').where('status', STATUSES.OPEN);

  let totalEnqueued = 0;
  const periodsHit = [];
  for (const period of openPeriods) {
    const left = daysUntil(period.end_date, now);
    if (!days.includes(left)) continue;
    const correlationId = `deadline-reminder-cron-${period.id}-${todayUtcISO()}`;
    const res = await remindForPeriod({ period, dryRun: false, correlationId, now });
    totalEnqueued += res.enqueued;
    periodsHit.push({ period: `${period.quarter} ${period.fiscal_year}`, days_left: left, enqueued: res.enqueued });
  }
  return { enqueued: totalEnqueued, periods: periodsHit };
}

async function tick() {
  try {
    if (!(await settings.getBool('reminders.deadline.enabled', false))) return;
    if (lastRunDate === todayUtcISO()) return;
    const targetHour = await settings.getInt('reminders.deadline.hour_utc', DEFAULT_HOUR_UTC);
    if (new Date().getUTCHours() < targetHour) return;
    lastRunDate = todayUtcISO();
    const result = await collectAndEnqueue();
    if (result.periods.length) {
      log.info(result, 'quarter-deadline reminders enqueued (cron)');
    }
  } catch (err) {
    log.error({ err: err && err.message }, 'quarter-deadline reminders cron failed');
  }
}

function start() {
  if (timer) return;
  log.info({ intervalMs: CHECK_INTERVAL_MS },
    'quarter-deadline reminders cron started (enable via app_settings reminders.deadline.enabled)');
  // Fire a check soon after startup (if today's target hour has already passed).
  setTimeout(tick, 30 * 1000).unref();
  timer = setInterval(tick, CHECK_INTERVAL_MS);
  timer.unref();
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, collectAndEnqueue };
