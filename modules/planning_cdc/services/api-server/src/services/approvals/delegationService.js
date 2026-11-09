// ── Out-of-office delegation (automation roadmap, lot 1, D-20261105-09) ──
//
// While a delegation is active, the delegate decides the approval steps of
// the delegator and receives a copy of their platform emails
// (approverIdentity, notificationResolvers). One active delegation per
// delegator; no chains; at most `approvals.delegation.max_days` long.

'use strict';

const db = require('../../config/db');
const settings = require('../settingsService');
const { ValidationError, NotFoundError, ForbiddenError, ApiError } = require('@rbm/lib/errors');

const CONFLICT = 409;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const isoDay = (d) => d.toISOString().slice(0, 10);
// Full name of the user joined as `alias`, as column `as`.
const fullName = (alias, as) => db.raw(`TRIM(CONCAT(COALESCE(${alias}.first_name,''),' ',COALESCE(${alias}.last_name,''))) as ${as}`);

/**
 * Delegations given and received by the user that are not over yet.
 *
 * @param {number} userId
 * @param {Date} [today]
 * @returns {Promise<{ given: object[], received: object[] }>}
 * @throws {Error} on DB failure
 * @example await listFor(5)
 */
async function listFor(userId, today = new Date()) {
  const base = () => db('approval_delegations as d')
    .join('users as a', 'a.id', 'd.delegator_id')
    .join('users as b', 'b.id', 'd.delegate_id')
    .whereNull('d.revoked_at')
    .where('d.ends_on', '>=', isoDay(today))
    // Dates as text: the driver turns a DATE into local midnight, which shifts the day once serialised.
    .select('d.id', 'd.delegator_id', 'd.delegate_id', 'd.reason',
      db.raw("DATE_FORMAT(d.starts_on, '%Y-%m-%d') as starts_on"), db.raw("DATE_FORMAT(d.ends_on, '%Y-%m-%d') as ends_on"),
      fullName('a', 'delegator_name'), 'a.email as delegator_email',
      fullName('b', 'delegate_name'), 'b.email as delegate_email')
    .orderBy('d.starts_on');
  const [given, received] = await Promise.all([
    base().where('d.delegator_id', userId),
    base().where('d.delegate_id', userId),
  ]);
  return { given, received };
}

async function checkDates(startsOn, endsOn, today) {
  if (!DAY_RE.test(String(startsOn)) || !DAY_RE.test(String(endsOn))) {
    throw new ValidationError('starts_on and ends_on must be dates (YYYY-MM-DD)');
  }
  if (endsOn < startsOn) throw new ValidationError('The end date must be on or after the start date');
  if (endsOn < isoDay(today)) throw new ValidationError('The delegation must not be over already');
  const maxDays = await settings.getInt('approvals.delegation.max_days', 60);
  const days = (Date.parse(endsOn) - Date.parse(startsOn)) / DAY_MS + 1;
  if (days > maxDays) throw new ValidationError(`A delegation lasts at most ${maxDays} days`);
}

/**
 * Create a delegation.
 *
 * @param {{ delegatorId: number, delegateId: number, startsOn: string, endsOn: string, reason?: string, createdBy: number }} p
 * @param {Date} [today]
 * @returns {Promise<number>} new delegation id
 * @throws {ValidationError} bad dates, self-delegation, unknown or inactive delegate
 * @throws {ApiError} 409 DELEGATION_OVERLAP when the delegator already has one on these dates
 * @example await create({ delegatorId: 5, delegateId: 12, startsOn: '2026-11-10', endsOn: '2026-11-20', createdBy: 5 })
 */
async function create({ delegatorId, delegateId, startsOn, endsOn, reason, createdBy }, today = new Date()) {
  const delegate = Number(delegateId);
  if (!delegate) throw new ValidationError('delegate_id is required');
  if (delegate === Number(delegatorId)) throw new ValidationError('You cannot delegate to yourself');
  await checkDates(startsOn, endsOn, today);
  const user = await db('users').where('id', delegate).first('id', 'status');
  if (!user || (user.status && user.status !== 'ACTIVE')) throw new ValidationError('The delegate must be an active user');
  const overlap = await db('approval_delegations')
    .where('delegator_id', delegatorId).whereNull('revoked_at')
    .where('starts_on', '<=', endsOn).where('ends_on', '>=', startsOn)
    .first('id');
  if (overlap) throw new ApiError('DELEGATION_OVERLAP', 'A delegation already covers these dates: end it first', CONFLICT);
  const [id] = await db('approval_delegations').insert({
    delegator_id: delegatorId,
    delegate_id: delegate,
    starts_on: startsOn,
    ends_on: endsOn,
    reason: reason ? String(reason).slice(0, 255) : null,
    created_by: createdBy,
  });
  return id;
}

/**
 * End a delegation (soft: revoked_at). Allowed to its delegator, its
 * creator and administrators.
 *
 * @param {number} id
 * @param {number} userId
 * @param {boolean} isAdmin
 * @returns {Promise<void>}
 * @throws {NotFoundError} unknown or already ended
 * @throws {ForbiddenError} somebody else's delegation
 * @example await revoke(3, 5, false)
 */
async function revoke(id, userId, isAdmin) {
  const row = await db('approval_delegations').where('id', id).whereNull('revoked_at').first();
  if (!row) throw new NotFoundError('Delegation not found');
  const own = [row.delegator_id, row.created_by].map(Number).includes(Number(userId));
  if (!own && !isAdmin) throw new ForbiddenError('You cannot end this delegation');
  await db('approval_delegations').where('id', id).update({ revoked_at: db.fn.now(), updated_at: db.fn.now() });
}

/**
 * Active users for the delegate picker: all of them (it filters as you
 * type), or those matching `q` (name or email).
 *
 * @param {string} [q]
 * @returns {Promise<Array<{ id: number, name: string, email: string }>>}
 * @example await candidates('ama')
 */
async function candidates(q) {
  const term = String(q || '').trim();
  const query = db('users')
    .where(function activeOnly() { this.where('status', 'ACTIVE').orWhereNull('status'); })
    .select('id', fullName('users', 'name'), 'email')
    .orderBy('first_name')
    .limit(2000);
  if (!term) return query;
  const like = `%${term}%`;
  return query.where(function matches() {
    this.where('first_name', 'like', like).orWhere('last_name', 'like', like).orWhere('email', 'like', like);
  });
}

module.exports = { listFor, create, revoke, candidates };
