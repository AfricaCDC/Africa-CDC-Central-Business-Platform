const db = require('../config/db');
const { STATUSES } = require('@rbm/lib/enums');

// ── Inbox (items pending current user's approval) ──
/**
 * List approval instances waiting on a specific user's action (inbox view).
 *
 * @param {number|string} userId — current user id
 * @returns {Promise<Array<object>>} distinct approval instance rows
 * @throws {Error} when the DB query fails
 * @example
 * const inbox = await getInbox(7);
 */
const getInbox = (userId) =>
  db('approval_instances')
    .join('approval_steps', 'approval_steps.approval_instance_id', 'approval_instances.id')
    .leftJoin('users as initiator', 'approval_instances.initiated_by_id', 'initiator.id')
    .leftJoin('workflow_templates', 'approval_instances.workflow_template_id', 'workflow_templates.id')
    .where('approval_steps.approver_id', userId)
    .where('approval_steps.decision', 'PENDING')
    .where('approval_instances.status', STATUSES.IN_REVIEW)
    .select(
      'approval_instances.id as instance_id',
      'approval_instances.entity_type',
      'approval_instances.entity_id',
      'approval_instances.division_code',
      'approval_instances.status as instance_status',
      'approval_instances.created_at',
      // Selected because it orders the rows: MySQL 8 rejects ORDER BY on a
      // column outside a DISTINCT select list (ER_FIELD_IN_ORDER_NOT_SELECT).
      'approval_instances.updated_at',
      'approval_steps.id as step_id',
      'approval_steps.step_order',
      'approval_steps.step_label',
      'approval_steps.role_code',
      'workflow_templates.name as template_name',
      'initiator.full_name as submitted_by_name',
      'initiator.email as submitted_by_email'
    )
    .orderBy('approval_instances.created_at', 'desc')
    .distinct()
    .orderBy('approval_instances.updated_at', 'desc');

// ── My Drafts (approval instances I created, still in DRAFT) ──
/**
 * List approval instances authored by a user that are still in DRAFT state.
 *
 * @param {number|string} userId — current user id
 * @returns {Promise<Array<object>>} draft instance rows
 * @throws {Error} when the DB query fails
 * @example
 * const drafts = await getMyDrafts(7);
 */
const getMyDrafts = (userId) =>
  db('approval_instances')
    .where({ initiated_by_id: userId, status: STATUSES.DRAFT })
    .select(
      'id', 'entity_type', 'entity_id',
      'status as governance_status', 'created_at', 'updated_at'
    )
    .orderBy('updated_at', 'desc');

// ── Audit Events ──
/**
 * List audit events joined with the actor name, filtered and capped.
 *
 * @param {object} [filters] — `entity_type`, `entity_id`, `actor_id`, `limit` (default 100)
 * @returns {Promise<Array<object>>} audit event rows
 * @throws {Error} when the DB query fails
 * @example
 * const { data, pagination } = await getAuditEvents({ entity_type: 'user', page: 1, limit: 25 });
 */
const getAuditEvents = async (filters = {}) => {
  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 25));
  const offset = (page - 1) * limit;

  const applyFilters = (q) => {
    if (filters.entity_type) q.where('audit_events.entity_type', filters.entity_type);
    if (filters.entity_id) q.where('audit_events.entity_id', parseInt(filters.entity_id));
    if (filters.actor_id) q.where('audit_events.actor_id', parseInt(filters.actor_id));
    if (filters.action) {
      if (filters.action.includes(',')) {
        q.whereIn('audit_events.action', filters.action.split(',').map(a => a.trim()));
      } else {
        q.where('audit_events.action', filters.action);
      }
    }
    if (filters.startDate) q.where('audit_events.timestamp', '>=', filters.startDate);
    if (filters.endDate) q.where('audit_events.timestamp', '<=', filters.endDate + ' 23:59:59');
    if (filters.userSearch) {
      const s = `%${filters.userSearch}%`;
      q.where(function () {
        this.where('users.full_name', 'like', s)
          .orWhere('users.email', 'like', s);
      });
    }
    return q;
  };

  const countQ = applyFilters(
    db('audit_events').leftJoin('users', 'audit_events.actor_id', 'users.id')
  ).count('audit_events.id as cnt').first();

  const dataQ = applyFilters(
    db('audit_events').leftJoin('users', 'audit_events.actor_id', 'users.id')
  ).select(
    'audit_events.id', 'audit_events.entity_type', 'audit_events.entity_id',
    'audit_events.action', 'audit_events.actor_id', 'audit_events.details',
    'audit_events.timestamp', 'audit_events.ip_address', 'audit_events.user_agent',
    'users.full_name as actor_name', 'users.email as actor_email'
  ).orderBy('audit_events.timestamp', 'desc').limit(limit).offset(offset);

  const [countResult, rows] = await Promise.all([countQ, dataQ]);
  const total = parseInt(countResult?.cnt || 0);

  return {
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
};

// ── Notifications ──
/**
 * List the 50 most recent notifications for a user.
 *
 * @param {number|string} userId — user id
 * @returns {Promise<Array<object>>} notification rows
 * @throws {Error} when the DB query fails
 * @example
 * const notes = await getNotifications(7);
 */
const getNotifications = (userId) => db('notifications').where('user_id', userId).orderBy('created_at', 'desc').limit(50);
/**
 * Mark one of the user's notifications as read. Another user's notification
 * is left untouched (update count 0).
 *
 * @param {number|string} id — notification id
 * @param {number} userId — owner of the notification
 * @returns {Promise<number>} knex update count
 * @throws {Error} when the update fails
 * @example
 * await markRead(99, req.user.id);
 */
const markRead = (id, userId) => db('notifications').where({ id, user_id: userId }).update({ is_read: true });
/**
 * Mark every unread notification for a user as read.
 *
 * @param {number|string} userId — user id
 * @returns {Promise<number>} knex update count
 * @throws {Error} when the update fails
 * @example
 * await markAllRead(7);
 */
const markAllRead = (userId) => db('notifications').where({ user_id: userId, is_read: false }).update({ is_read: true });

module.exports = {
  getInbox, getMyDrafts,
  getAuditEvents,
  getNotifications, markRead, markAllRead,
};
