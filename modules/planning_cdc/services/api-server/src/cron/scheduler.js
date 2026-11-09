/**
 * Shared scheduler for the automation jobs (automation roadmap, lot 0).
 *
 * Same behaviour as the hand-written cron files: a check every 15 minutes
 * (unref'd timers, so tests and shutdown are not held), errors logged and
 * swallowed, and no overlapping run of the same job. Each job decides in
 * its own `tick` whether something is due (see `isDue`) and uses
 * `reminderLog.claim` so it never sends the same reminder twice.
 */
'use strict';

const { createLogger } = require('@rbm/lib/logger');

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_FIRST_DELAY_MS = 45 * 1000;
const WEEKEND = [0, 6];

/**
 * Define a background job.
 *
 * @param {{ name: string, tick: (now: Date) => Promise<*>, intervalMs?: number, firstDelayMs?: number }} spec
 * @returns {{ start: () => void, stop: () => void, tick: (now?: Date) => Promise<*> }}
 * @throws {never} tick errors are logged, never thrown
 * @example const job = defineJob({ name: 'approvalEscalation', tick: escalate }); job.start();
 */
function defineJob({ name, tick, intervalMs = DEFAULT_INTERVAL_MS, firstDelayMs = DEFAULT_FIRST_DELAY_MS }) {
  const log = createLogger('api-server').child({ module: name });
  let timer = null;
  let running = false;

  async function guardedTick(now = new Date()) {
    if (running) return null;
    running = true;
    try {
      return await tick(now);
    } catch (err) {
      log.error({ err: err && err.message }, `${name} failed`);
      return null;
    } finally {
      running = false;
    }
  }

  return {
    tick: guardedTick,
    start() {
      if (timer) return;
      log.info({ intervalMs }, `${name} started`);
      setTimeout(() => guardedTick(), firstDelayMs).unref();
      timer = setInterval(() => guardedTick(), intervalMs);
      timer.unref();
    },
    stop() {
      if (timer) { clearInterval(timer); timer = null; }
    },
  };
}

/**
 * Whether a daily or weekly job is due at `now` (UTC): past the hour, on a
 * weekday unless `weekends`, and on `weekday` when given (0 = Sunday).
 *
 * @param {Date} now
 * @param {{ hour: number, weekday?: number|null, weekends?: boolean }} when
 * @returns {boolean}
 * @example isDue(new Date('2026-11-09T07:00:00Z'), { hour: 6, weekday: 1 }) // true (Monday)
 */
function isDue(now, { hour, weekday = null, weekends = false }) {
  const day = now.getUTCDay();
  if (weekday !== null && weekday !== undefined) {
    if (day !== weekday) return false;
  } else if (!weekends && WEEKEND.includes(day)) {
    return false;
  }
  return now.getUTCHours() >= hour;
}

/** ISO date (YYYY-MM-DD, UTC). */
const isoDay = (d) => d.toISOString().slice(0, 10);

/**
 * ISO week key, e.g. '2026-W45', used as a reminder_log period.
 *
 * @param {Date} d
 * @returns {string}
 * @example isoWeek(new Date('2026-11-05T00:00:00Z')) // '2026-W45'
 */
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

module.exports = { defineJob, isDue, isoDay, isoWeek };
