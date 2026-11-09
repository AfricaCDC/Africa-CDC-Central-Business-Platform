/**
 * Scheduler: enqueues draft-report reminder emails on a fixed cadence.
 *
 * Configuration is ADMIN-MANAGED via `app_settings` (D-20260707-01) — no env
 * vars, no redeploy. Editable on /admin/settings:
 *   reminders.draft.enabled    — '1' to enable (seeded '0').
 *   reminders.draft.hour_utc   — hour of day (0-23 UTC) to fire at (seeded '6').
 *
 * The timer always runs; each tick re-reads the settings, so toggling the
 * flag in the admin UI takes effect within one poll interval (≤15 min).
 * Idempotent-per-day: tracks the last run date and only fires once per
 * UTC day. Scans reports in draft status whose reporting window (quarter +
 * fiscal year) is OPEN, groups by
 * reporter user, enqueues one `notification_outbox` row per user.
 *
 * Called from `src/index.js` after the server is listening.
 */
'use strict';

const db = require('../config/db');
const { STATUSES } = require('@rbm/lib/enums');
const { createLogger } = require('@rbm/lib/logger');
const settings = require('../services/settingsService');
const { whereOpenPeriod } = require('../services/reportingWindowService');

const log = createLogger('api-server').child({ module: 'draftRemindersCron' });

const CHECK_INTERVAL_MS = 15 * 60 * 1000;  // 15 min — cheap check for "is it time yet"
const PORTAL_URL = process.env.PORTAL_URL || 'https://pra.africacdc.org/report';
let lastRunDate = null;
let timer = null;

function todayUtcISO() {
  return new Date().toISOString().slice(0, 10);
}

async function collectAndEnqueue() {
  // Only drafts whose reporting window (quarter + year) is OPEN: a closed window cannot be acted on.
  const rows = await whereOpenPeriod(db('indicator_division_reports as r'), 'r')
    .leftJoin('users as u', 'u.id', db.raw('COALESCE(r.submitted_by, r.created_by)'))
    .leftJoin('plan_nodes as p', 'p.id', 'r.plan_node_id')
    .leftJoin('division_codes as dc', 'dc.code', 'r.division_code')
    .where('r.status', STATUSES.DRAFT)
    .whereNotNull('u.id')
    .where(function () { this.where('u.status', 'ACTIVE').orWhereNull('u.status'); })
    .select(
      'u.id as user_id', 'u.email', 'u.first_name', 'u.last_name',
      'r.fiscal_year', 'r.quarter', 'r.division_code',
      'p.code as indicator_code', 'p.title as indicator_title',
      'dc.division_name',
    );

  const byUser = new Map();
  for (const r of rows) {
    if (!r.email) continue;
    if (!byUser.has(r.user_id)) {
      byUser.set(r.user_id, {
        user: { id: r.user_id, email: r.email, first_name: r.first_name, last_name: r.last_name },
        drafts: [],
      });
    }
    byUser.get(r.user_id).drafts.push({
      indicator_code: r.indicator_code,
      indicator_title: r.indicator_title,
      fiscal_year: r.fiscal_year,
      quarter: r.quarter,
      division_name: r.division_name || r.division_code,
    });
  }
  if (!byUser.size) return { enqueued: 0, total_drafts: 0 };

  const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const correlationId = `draft-reminder-cron-${Date.now()}`;
  let enqueued = 0;
  for (const { user, drafts } of byUser.values()) {
    const payload = { user, count: drafts.length, drafts, portalUrl: PORTAL_URL };
    await db('notification_outbox').insert({
      event_key: 'report-draft-reminder',
      recipient: user.email,
      recipient_user_id: user.id,
      channel: 'email',
      subject: `[RBM] You have ${drafts.length} draft report${drafts.length > 1 ? 's' : ''} pending`,
      payload: JSON.stringify(payload),
      status: 'queued',
      correlation_id: correlationId,
      created_at: nowIso,
      updated_at: nowIso,
    });
    enqueued += 1;
  }
  return { enqueued, total_drafts: rows.length, correlationId };
}

async function tick() {
  try {
    if (!(await settings.getBool('reminders.draft.enabled', false))) return;
    if (lastRunDate === todayUtcISO()) return;
    const targetHour = await settings.getInt('reminders.draft.hour_utc', 6);
    if (new Date().getUTCHours() < targetHour) return;
    lastRunDate = todayUtcISO();
    const result = await collectAndEnqueue();
    log.info(result, 'draft reminders enqueued (cron)');
  } catch (err) {
    log.error({ err: err && err.message }, 'draft reminders cron failed');
  }
}

function start() {
  if (timer) return;
  log.info({ intervalMs: CHECK_INTERVAL_MS },
    'draft reminders cron started (enable via app_settings reminders.draft.enabled)');
  // Fire a check soon after startup (if today's target hour has already passed).
  setTimeout(tick, 30 * 1000).unref();
  timer = setInterval(tick, CHECK_INTERVAL_MS);
  timer.unref();
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop };
