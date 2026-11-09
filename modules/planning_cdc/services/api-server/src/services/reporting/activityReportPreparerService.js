// ── "Prepared by" changes on activity reports (D-20261013-03) ──
//
// activity_reports.user_id is the preparer shown in the template sign-off.
// An administrator or M&E officer may hand a report to another person; the
// previous preparer stays on record in activity_report_preparer_changes,
// which is append-only.

'use strict';

const db = require('../../config/db');
const { NotFoundError, ValidationError } = require('@rbm/lib/errors');

const REASON_MAX = 1000;
const ACTIVE = 'ACTIVE';

/**
 * Give a report to another preparer, keeping the previous one on record.
 *
 * @param {{ reportId: number, toUserId: number, reason: string, actorId: number }} args
 * @returns {Promise<{ report: object, change: object }>}
 * @throws {ValidationError} 400 on a missing reason, an unknown or inactive user, or no change
 * @throws {NotFoundError} 404 when the report does not exist
 * @example await changePreparer({ reportId: 12, toUserId: 7, reason: 'Wrote it for Q3', actorId: 1 });
 */
async function changePreparer({ reportId, toUserId, reason, actorId }) {
  const why = String(reason || '').trim();
  if (!why) throw new ValidationError('A reason is required to change who prepared the report');
  if (why.length > REASON_MAX) throw new ValidationError(`The reason must be at most ${REASON_MAX} characters`);
  if (!Number.isInteger(toUserId) || toUserId <= 0) throw new ValidationError('Choose the new preparer');

  return db.transaction(async (trx) => {
    const report = await trx('activity_reports').where('id', reportId).forUpdate().first('id', 'user_id');
    if (!report) throw new NotFoundError('Activity report not found');
    if (Number(report.user_id) === toUserId) throw new ValidationError('This person already prepared the report');

    const target = await trx('users').where('id', toUserId).first('id', 'status');
    if (!target || target.status !== ACTIVE) throw new ValidationError('The new preparer must be an active user');

    const change = {
      activity_report_id: reportId,
      from_user_id: report.user_id || null,
      to_user_id: toUserId,
      changed_by: actorId,
      reason: why,
    };
    const [id] = await trx('activity_report_preparer_changes').insert(change);
    await trx('activity_reports').where('id', reportId).update({ user_id: toUserId, updated_at: trx.fn.now() });
    const updated = await trx('activity_reports').where('id', reportId).first();
    return { report: updated, change: { id, ...change } };
  });
}

/**
 * The "Prepared by" history of a report, oldest first, with names.
 *
 * @param {number} reportId
 * @returns {Promise<Array<{ id: number, from_name: string|null, to_name: string|null, changed_by_name: string|null, reason: string, created_at: string }>>}
 * @throws {Error} on DB failure
 * @example await listChanges(12);
 */
async function listChanges(reportId) {
  const nameOf = (alias) => db.raw(`COALESCE(NULLIF(${alias}.full_name, ''), ${alias}.email) as ${alias}_name`);
  const rows = await db('activity_report_preparer_changes as c')
    .leftJoin('users as f', 'f.id', 'c.from_user_id')
    .leftJoin('users as t', 't.id', 'c.to_user_id')
    .leftJoin('users as b', 'b.id', 'c.changed_by')
    .where('c.activity_report_id', reportId)
    .orderBy('c.id', 'asc')
    .select('c.id', 'c.reason', 'c.created_at', nameOf('f'), nameOf('t'), nameOf('b'));
  return rows.map((r) => ({
    id: r.id,
    from_name: r.f_name || null,
    to_name: r.t_name || null,
    changed_by_name: r.b_name || null,
    reason: r.reason,
    created_at: r.created_at,
  }));
}

/**
 * Active users a report can be given to, sorted by name.
 *
 * @returns {Promise<Array<{ id: number, name: string, email: string }>>}
 * @throws {Error} on DB failure
 * @example await listCandidates(); // [{ id: 7, name: 'Jane Doe', email: 'jane@...' }]
 */
async function listCandidates() {
  const rows = await db('users')
    .where('status', ACTIVE)
    .select('id', 'full_name', 'first_name', 'last_name', 'email');
  return rows
    .map((u) => ({
      id: u.id,
      name: u.full_name || [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
      email: u.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { changePreparer, listChanges, listCandidates, REASON_MAX };
