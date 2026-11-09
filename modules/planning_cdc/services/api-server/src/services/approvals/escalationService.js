// ── Escalation of approval steps that wait too long (automation roadmap, lot 1) ──
//
// D-20261105-09. A Responsible Person step (head of division or director)
// that has waited more than `approvals.escalation.days` is opened to the
// Responsible Person one level above: `escalated_to_id` is set once, both
// people are emailed (event approval_step.escalated), and either may decide
// (approverIdentity). Steps that became pending before
// `approvals.escalation.since` are never escalated, so the backlog that
// existed when the feature shipped does not flood the directors.

'use strict';

const db = require('../../config/db');
const settings = require('../settingsService');
const { emitEvent } = require('../eventBusService');
const { summarize, decideUrl } = require('./stepSummary');
const { STATUSES, APPROVAL_STEP_DECISIONS } = require('@rbm/lib/enums');
const { ROLES } = require('@rbm/lib/roles');

const EVENT_KEY = 'approval_step.escalated';
const DAY_MS = 86400000;
const ESCALATED_ROLES = [ROLES.HEAD_OF_DIVISION, ROLES.DIRECTOR];
const CONTRIB_SCOPE = 'CONTRIB_DIVISION';

/** Current Responsible Person steps never escalated, with the date they became pending. */
async function currentSteps() {
  return db('approval_steps as s')
    .join('approval_instances as ai', 'ai.id', 's.approval_instance_id')
    .where('ai.status', STATUSES.IN_REVIEW)
    .where('s.decision', APPROVAL_STEP_DECISIONS.PENDING)
    .whereIn('s.role_code', ESCALATED_ROLES)
    .whereNull('s.escalated_at')
    .whereNotNull('s.approver_id')
    .whereNotExists(function earlierPending() {
      this.from('approval_steps as s2')
        .whereRaw('s2.approval_instance_id = s.approval_instance_id')
        .where('s2.decision', APPROVAL_STEP_DECISIONS.PENDING)
        .whereRaw('s2.step_order < s.step_order');
    })
    .select(
      's.id', 's.approver_id', 's.scope', 'ai.division_code', 'ai.main_org_code', 'ai.contrib_org_code',
      db.raw(`COALESCE((SELECT MAX(p.completed_date) FROM approval_steps p
        WHERE p.approval_instance_id = s.approval_instance_id AND p.step_order < s.step_order), ai.created_at) AS pending_since`),
    );
}

/** Unit the step belongs to: the contributing unit on a contributor step, else the main unit. */
const unitOf = (s) => (s.scope === CONTRIB_SCOPE ? s.contrib_org_code : (s.main_org_code || s.division_code));

/** Parent code of a unit, through its alias when it is one. */
async function parentOf(unitCode) {
  if (!unitCode) return null;
  let row = await db('division_codes').where('code', unitCode).first('code', 'alias_of', 'parent_code');
  if (row && row.alias_of) row = await db('division_codes').where('code', row.alias_of).first('code', 'alias_of', 'parent_code');
  return row ? row.parent_code : null;
}

/**
 * Responsible Person of the first level above `unitCode` who is not
 * `excludeUserId` (the current approver), following aliases.
 *
 * @param {string} unitCode
 * @param {number} excludeUserId
 * @returns {Promise<number|null>}
 * @example await holderAbove('CLDS', 14) // the CLSN director
 */
async function holderAbove(unitCode, excludeUserId) {
  const seen = new Set();
  let cur = await parentOf(unitCode);
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const up = await db('division_codes').where('code', cur).first('code', 'alias_of', 'parent_code', 'responsible_user_id');
    if (!up) return null;
    if (up.alias_of) { cur = up.alias_of; continue; }
    if (up.responsible_user_id && Number(up.responsible_user_id) !== Number(excludeUserId)) return Number(up.responsible_user_id);
    cur = up.parent_code;
  }
  return null;
}

function noticeFor(summary, days, sinceDay) {
  const who = summary.approver_name || 'the approver';
  return {
    subject: `Approval waiting ${days} days: ${summary.code || summary.type_label}`,
    heading: 'An approval is waiting',
    intro: `This ${summary.type_label.toLowerCase()} has waited ${days} days for the decision of ${who}. It is now also open to the Responsible Person one level above. Either of them can decide it.`,
    items: [{ code: summary.code, title: summary.title, meta: [summary.type_label, summary.unit_code, summary.step_label, `waiting since ${sinceDay}`] }],
    ctaLabel: 'Open and decide',
    ctaUrl: decideUrl(summary.step_id),
    footer: 'This message is sent once per approval step.',
  };
}

/**
 * Escalate every step that has waited long enough.
 *
 * @param {Date} [now]
 * @returns {Promise<{ escalated: number, skipped: number }>} skipped = no Responsible Person above
 * @throws {Error} on DB failure
 * @example await escalateDueSteps(new Date())
 */
async function escalateDueSteps(now = new Date()) {
  const days = await settings.getInt('approvals.escalation.days', 7);
  const since = await settings.getSetting('approvals.escalation.since', null);
  const cutoff = now.getTime() - days * DAY_MS;
  const steps = (await currentSteps()).filter((s) => {
    const t = new Date(s.pending_since).getTime();
    return t <= cutoff && (!since || t >= Date.parse(`${since}T00:00:00Z`));
  });
  let escalated = 0;
  let skipped = 0;
  for (const s of steps) {
    const target = await holderAbove(unitOf(s), s.approver_id);
    if (!target) { skipped += 1; continue; }
    await db('approval_steps').where('id', s.id).whereNull('escalated_at')
      .update({ escalated_to_id: target, escalated_at: db.fn.now() });
    const summary = await summarize(s.id);
    const waited = Math.floor((now.getTime() - new Date(s.pending_since).getTime()) / DAY_MS);
    await emitEvent({
      eventKey: EVENT_KEY,
      entity: { id: s.id, owner_user_id: target, previous_owner_user_id: s.approver_id },
      metadata: noticeFor(summary, waited, new Date(s.pending_since).toISOString().slice(0, 10)),
      correlationId: `escalation-${s.id}`,
    });
    escalated += 1;
  }
  return { escalated, skipped };
}

module.exports = { escalateDueSteps, holderAbove, unitOf, EVENT_KEY };
