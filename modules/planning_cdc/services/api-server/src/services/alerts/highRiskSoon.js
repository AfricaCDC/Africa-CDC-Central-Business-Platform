// ── High-risk activity starts soon (automation roadmap, lot 2) ──
//
// D-20261105-11. A specific activity approved or in review, marked High
// risk, whose start date falls within `alerts.high_risk.days_before` days:
// its focal person and the Responsible Person of its unit are emailed once
// per start date (event plan_node.high_risk_soon). When the start date
// moves, the activity is announced again for the new date.

'use strict';

const db = require('../../config/db');
const settings = require('../settingsService');
const { emitEvent } = require('../eventBusService');
const { claim } = require('../reminderLog');
const { APP_URL } = require('../reporting/reportEmailDetails');
const { isoDay } = require('../../cron/scheduler');
const { STATUSES, PLAN_NODE_TYPES, ACTIVITY_RISK_LEVELS, ENTITY_TYPES } = require('@rbm/lib/enums');

const EVENT_KEY = 'plan_node.high_risk_soon';
const DAY_MS = 86400000;

/** High-risk activities starting between `today` and `until` (YYYY-MM-DD, inclusive). */
function startingSoon(today, until) {
  return db('plan_nodes as p')
    .where('p.node_type', PLAN_NODE_TYPES.SPECIFIC_ACTIVITY)
    .whereIn('p.status', [STATUSES.APPROVED, STATUSES.IN_REVIEW])
    .where('p.risk_level', ACTIVITY_RISK_LEVELS.HIGH)
    .whereBetween('p.start_date', [today, until])
    .orderBy('p.start_date')
    .select('p.id', 'p.code', 'p.title', 'p.responsible_division_code', 'p.focal_user_id', 'p.created_by_user_id',
      db.raw("DATE_FORMAT(p.start_date, '%Y-%m-%d') as start_day"));
}

/**
 * The email of one activity (template automation-notice).
 *
 * @param {{ id: number, code: string, title: string, responsible_division_code: string, start_day: string }} a
 * @returns {object} automation-notice metadata
 * @example noticeFor({ id: 4, code: '1.2.3.01', title: 'Mission', responsible_division_code: 'EPR', start_day: '2026-11-20' });
 */
function noticeFor(a) {
  return {
    subject: `High-risk activity starts on ${a.start_day}: ${a.code || a.title}`,
    heading: 'A high-risk activity starts soon',
    intro: `This activity is marked High risk and starts on ${a.start_day}. Check that the risk is still managed before it starts.`,
    items: [{ code: a.code, title: a.title, meta: [a.responsible_division_code, `starts ${a.start_day}`] }],
    ctaLabel: 'Open the activity',
    ctaUrl: `${APP_URL}/plan/node/${a.id}`,
    footer: 'This message is sent once per start date.',
  };
}

/**
 * Announce the High-risk activities that start soon, once per start date.
 *
 * @param {Date} [now]
 * @returns {Promise<{ due: number, sent: number }>}
 * @throws {Error} on DB failure (the job logs it)
 * @example await alertHighRiskSoon(new Date('2026-11-06T06:00:00Z'));
 */
async function alertHighRiskSoon(now = new Date()) {
  const days = await settings.getInt('alerts.high_risk.days_before', 14);
  const rows = await startingSoon(isoDay(now), isoDay(new Date(now.getTime() + days * DAY_MS)));
  let sent = 0;
  for (const a of rows) {
    const period = `start-${a.start_day}`;
    if (!(await claim({ kind: EVENT_KEY, entityType: ENTITY_TYPES.PLAN_NODE, entityId: a.id, recipientId: 0, period }))) continue;
    await emitEvent({
      eventKey: EVENT_KEY,
      entity: {
        id: a.id,
        owner_user_id: a.focal_user_id || a.created_by_user_id,
        responsible_division_code: a.responsible_division_code,
      },
      metadata: noticeFor(a),
      correlationId: `high-risk-${a.id}-${a.start_day}`,
    });
    sent += 1;
  }
  return { due: rows.length, sent };
}

module.exports = { alertHighRiskSoon, noticeFor, EVENT_KEY };
