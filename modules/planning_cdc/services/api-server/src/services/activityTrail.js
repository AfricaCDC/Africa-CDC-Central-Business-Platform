/**
 * Approval trail of a specific activity (D-20261103-02): who created, edited,
 * submitted, approved or rejected it and when, read from `audit_events`, and
 * whom it waits for while in review (the pending workflow step, else the
 * Responsible Person of its Business Unit).
 */

'use strict';

const db = require('../config/db');
const { STATUSES, ENTITY_TYPES, APPROVAL_STEP_DECISIONS } = require('@rbm/lib/enums');
const { resolveHolderUpChain } = require('./divisionAliasService');

const EDITED = 'Edited';
// One save of the form writes the activity, its cost lines and its screening:
// edits by the same person this close to the previous line are one entry.
const MERGE_WINDOW_MS = 15 * 60_000;

/** audit action -> trail entry; actions outside this map are not shown. */
const ENTRIES = {
  SPECIFIC_ACTIVITY_CREATE: (d) => (d.admin_bypass
    ? { label: 'Created and approved (administrator)', decision: STATUSES.APPROVED, absorbsEdits: true }
    : { label: 'Created as draft', absorbsEdits: true }),
  SPECIFIC_ACTIVITY_UPDATE: (d) => (d.bumped_to_review
    ? { label: 'Edited, sent back for approval' }
    : { label: EDITED, edit: true, absorbsEdits: true }),
  ACTIVITY_COST_LINES_UPDATED: () => ({ label: EDITED, edit: true, absorbsEdits: true }),
  ACTIVITY_COMPLEXITY_SCREENED: () => ({ label: EDITED, edit: true, absorbsEdits: true }),
  SPECIFIC_ACTIVITY_SUBMIT: () => ({ label: 'Submitted for approval' }),
  SPECIFIC_ACTIVITY_APPROVE: () => ({ label: 'Approved', decision: STATUSES.APPROVED }),
  SPECIFIC_ACTIVITY_REJECT: (d) => ({ label: 'Rejected', decision: STATUSES.REJECTED, comment: d.reason || null }),
  SPECIFIC_ACTIVITY_CANCEL: () => ({ label: 'Cancelled', decision: STATUSES.CANCELLED }),
};

const details = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
};

/**
 * Turn audit rows (oldest first) into trail entries, merging the edits a
 * person makes right after creating or editing the activity.
 *
 * @param {Array<{ id: number, action: string, actor_id: number|null, actor_name: string|null, details: string|object|null, timestamp: Date|string }>} rows
 * @returns {Array<{ id: number, at: string, actor: string|null, label: string, decision: string|null, comment: string|null }>}
 * @throws {never}
 * @example buildTrail([{ action: 'SPECIFIC_ACTIVITY_SUBMIT', actor_id: 7, actor_name: 'Ada', details: null, timestamp: new Date() }]);
 */
function buildTrail(rows) {
  const out = [];
  let prev = null;
  for (const row of rows) {
    const make = ENTRIES[row.action];
    if (!make) continue;
    const entry = make(details(row.details));
    const at = new Date(row.timestamp);
    const merges = entry.edit && prev && prev.absorbsEdits && prev.actorId === row.actor_id
      && at - prev.lastAt < MERGE_WINDOW_MS;
    if (merges) { prev.lastAt = at; continue; }
    prev = { ...entry, id: row.id, actorId: row.actor_id, at, lastAt: at, actor: row.actor_name || null };
    out.push(prev);
  }
  return out.map((e) => ({
    id: e.id, at: e.at.toISOString(), actor: e.actor, label: e.label, decision: e.decision || null, comment: e.comment || null,
  }));
}

const userName = (id) => db('users').where('id', id).first(db.raw('COALESCE(full_name, email) as name'));

/** The pending workflow step, else the Responsible Person of the unit. */
async function waitingFor(node) {
  if (node.status !== STATUSES.IN_REVIEW) return null;
  const step = await db('approval_steps as s')
    .join('approval_instances as i', 'i.id', 's.approval_instance_id')
    .leftJoin('users as u', 'u.id', 's.approver_id')
    .where({ 'i.entity_type': ENTITY_TYPES.PLAN_NODE, 'i.entity_id': node.id, 's.decision': APPROVAL_STEP_DECISIONS.PENDING })
    .whereNotIn('i.status', [STATUSES.APPROVED, STATUSES.REJECTED, STATUSES.CANCELLED])
    .orderBy('s.step_order')
    .first('s.step_label', db.raw('COALESCE(u.full_name, u.email) as name'));
  if (step) return { step: step.step_label || null, name: step.name || null };
  const holderId = node.responsible_division_code
    ? await resolveHolderUpChain(db, node.responsible_division_code, 'responsible_user_id') : null;
  const holder = holderId ? await userName(holderId) : null;
  return { step: 'Responsible Person of the Business Unit', name: holder ? holder.name : null };
}

/**
 * Trail and current wait of a specific activity.
 *
 * @param {{ id: number, status: string, responsible_division_code: string|null }} node
 * @returns {Promise<{ events: object[], waiting_for: { step: string|null, name: string|null }|null }>}
 * @throws {Error} on DB failure
 * @example const { events } = await getTrail(row);
 */
async function getTrail(node) {
  const rows = await db('audit_events as a')
    .leftJoin('users as u', 'u.id', 'a.actor_id')
    .where({ 'a.entity_type': ENTITY_TYPES.PLAN_NODE, 'a.entity_id': node.id })
    .whereIn('a.action', Object.keys(ENTRIES))
    .orderBy([{ column: 'a.timestamp' }, { column: 'a.id' }])
    .limit(1000)
    .select('a.id', 'a.action', 'a.actor_id', 'a.details', 'a.timestamp', db.raw('COALESCE(u.full_name, u.email) as actor_name'));
  return { events: buildTrail(rows), waiting_for: await waitingFor(node) };
}

module.exports = { buildTrail, getTrail };
