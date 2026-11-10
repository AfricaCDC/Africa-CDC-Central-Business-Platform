/* eslint-disable max-lines --
 * Cohesive caller-scoped /api/me router: task inbox + division scope + the
 * HOD division-team endpoints (D-20260804-01). ~216 L of thin handlers that
 * share the same auth + helpers; splitting produces a multi-file shuffle for
 * no clarity gain. Pragma is a ceiling — do not grow the file further.
 */
/**
 * /api/me — per-user actionable data.
 *
 * - GET /me/tasks      → notification-bell inbox (review queues, rejections,
 *                         unread notifications, …) — see ./me/taskBuilders.js
 * - GET /me/divisions  → every division/directorate code the caller can
 *                         act on, with assignment metadata — see
 *                         ./me/divisionBuilders.js
 * - {GET,POST,DELETE} /me/divisions/:code/members → HOD-managed reporting
 *                         team (user_divisions MEMBER rows), D-20260804-01
 *
 * Review-queue visibility is driven exclusively by the dynamic RBAC
 * matrix: a user sees *all* queues when they hold `reports.approve`
 * with scope `all`, otherwise they only see queues scoped to divisions
 * where they are the assigned HOD (legacy role-group check replaced per
 * D-20260415-12).
 */

const express = require('express');
const knex = require('../config/db');
const { authenticateToken } = require('../middleware/authMiddleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const { asyncHandler, buildSuccess, buildError, UnauthorizedError } = require('@rbm/lib/errors');
const rbacService = require('../services/rbacService');
const divisionAssignmentService = require('../services/divisionAssignmentService');
const { audit } = require('../middleware/auditLog');
const { isHodFor, isAdmin } = require('./plan-nodes/_helpers');
const tasks = require('./me/taskBuilders');
const divisions = require('./me/divisionBuilders');

const router = express.Router();
router.use(authenticateToken);

/**
 * A user can see cross-division review queues when they hold the
 * `reports.approve` permission with scope `all`.
 *
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
async function canSeeAllReviewQueues(userId) {
  const { scope } = await rbacService.checkPermission(
    userId,
    RBAC_MODULES.REPORTS,
    RBAC_ACTIONS.APPROVE,
  );
  return scope === 'all';
}

// Units where the caller is the Responsible Person, plus those of the users
// who delegated to them (D-20261105-09).
const { getResponsibleDivisions } = require('../services/approvals/approverIdentity');

async function gatherReviewQueueTasks(scope) {
  const out = [];
  if (!scope.seeAll && scope.respDivs.length === 0) return out;
  const pending = await tasks.fetchPendingSpecificActivities(scope);
  const saTask = tasks.buildSaReviewTask(pending);
  if (saTask) out.push(saTask);
  return out;
}

async function gatherAdminOnlyTasks(seeAll) {
  const out = [];
  if (!seeAll) return out;
  const disputeTask = await tasks.buildOwnershipDisputesTask();
  if (disputeTask) out.push(disputeTask);
  return out;
}

router.get('/tasks', asyncHandler(async (req, res) => {
  const userId = req.user && req.user.id;
  if (!userId) throw new UnauthorizedError('Not authenticated');

  const seeAll = await canSeeAllReviewQueues(userId);
  const respDivs = await getResponsibleDivisions(userId);
  const scope = { seeAll, respDivs };

  const out = [];
  out.push(...(await gatherReviewQueueTasks(scope)));
  const reportTask = await tasks.buildReportReviewTask(userId);
  if (reportTask) out.push(reportTask);
  out.push(...(await tasks.buildSaRejectedTasks(userId)));
  out.push(...(await gatherAdminOnlyTasks(seeAll)));
  out.push(...(await tasks.buildNotificationTasks(userId)));
  tasks.sortTasks(out);

  res.json(buildSuccess({ tasks: out, total: out.length }));
}));

router.get('/divisions', asyncHandler(async (req, res) => {
  const userId = req.user && req.user.id;
  if (!userId) throw new UnauthorizedError('Not authenticated');

  const { reasons, junctionData } = await divisions.buildReasonMap(req.user);
  if (reasons.size === 0) {
    return res.json(buildSuccess({ divisions: [], directorates: [] }));
  }

  const rows = await divisions.fetchDivisionRows(Array.from(reasons.keys()));
  const byCode = new Map(rows.map((r) => [r.code.toUpperCase(), r]));
  const primaryCode = (req.user.division_code || '').toUpperCase();
  const hydrated = await Promise.all(
    rows.map((r) => divisions.hydrateDivisionRow(r, { byCode, reasons, primaryCode, junctionData })),
  );
  divisions.sortDivisions(hydrated);

  const { getDirectoratesForUser } = require('../services/divisionAliasService');
  const directorates = await getDirectoratesForUser(userId);

  res.json(buildSuccess({ divisions: hydrated, directorates }));
}));

// ── Division team (HOD-managed reporting members) ──────────────
// A Head of Division enrols staff as user_divisions MEMBER so they pass
// the existing activity-report guard. No admin permission required.
// Spec: docs/superpowers/specs/2026-08-04-open-activity-reporting-to-division-team-design.md

/** True when the caller is the HOD of `code` (alias-aware) or a system admin. */
async function requireHodOrAdmin(req, code) {
  if (await isAdmin(req.user)) return true;
  return isHodFor(req.user.id, code);
}

// 'MEMBER' is a user_divisions.role column-enum value (not an ENTITY_TYPES
// identifier). The file is P-31-allowlisted for these column-enum literals.
const MEMBER_ROLE = 'MEMBER';

/**
 * List the division's user_divisions members (HOD of the division, or admin).
 *
 * @name GET /api/me/divisions/:code/members
 * @param {express.Request} req — path param `code` = division code
 * @param {express.Response} res — 200 `{success,data:[...]}`, 403 when not HOD/admin
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/me/divisions/DPHI/members
 */
router.get('/divisions/:code/members', asyncHandler(async (req, res) => {
  const code = req.params.code;
  if (!await requireHodOrAdmin(req, code)) {
    return res.status(403).json(buildError('FORBIDDEN', 'Only the Head of Division can manage this team'));
  }
  const rows = await knex('user_divisions as ud')
    .join('users as u', 'u.id', 'ud.user_id')
    .where('ud.division_code', code)
    .select('u.id', 'u.first_name', 'u.last_name', 'u.email', 'ud.role')
    .orderBy('u.first_name', 'asc');
  res.json(buildSuccess(rows));
}));

/**
 * Enrol an ACTIVE STAFF user as a MEMBER of the division (idempotent).
 *
 * @name POST /api/me/divisions/:code/members
 * @param {express.Request} req — path param `code`; body `{ user_id }`
 * @param {express.Response} res — 200 `{success,data:{added:true}}`, 403 not HOD/admin, 422 non-staff
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example POST /api/me/divisions/DPHI/members { user_id: 55 }
 */
router.post('/divisions/:code/members', asyncHandler(async (req, res) => {
  const code = req.params.code;
  const userId = parseInt(req.body && req.body.user_id, 10);
  if (!userId) return res.status(400).json(buildError('VALIDATION_FAILED', 'user_id is required'));
  if (!await requireHodOrAdmin(req, code)) {
    return res.status(403).json(buildError('FORBIDDEN', 'Only the Head of Division can manage this team'));
  }
  const user = await knex('users').where('id', userId).first('id', 'user_type', 'status');
  if (!user || user.user_type !== 'STAFF' || user.status !== 'ACTIVE') {
    return res.status(422).json(buildError('VALIDATION_FAILED', 'Member must be an active staff user'));
  }
  const existing = await knex('user_divisions')
    .where({ user_id: userId, division_code: code }).first();
  if (!existing) {
    // Same write path as the admin pages (divisionAssignmentService).
    await knex.transaction((trx) => divisionAssignmentService.addDivisionRole(trx, {
      userId, code, role: MEMBER_ROLE,
    }));
    await audit(req, 'DIVISION_MEMBER_ADD', 'user_division', userId, { division_code: code });
  }
  res.json(buildSuccess({ added: true }));
}));

/**
 * Remove a user's MEMBER row from the division. Never touches focal / HOD /
 * director / M&E rows — those are managed by admins on the org page.
 *
 * @name DELETE /api/me/divisions/:code/members
 * @param {express.Request} req — path param `code`; body `{ user_id }`
 * @param {express.Response} res — 200 `{success,data:{removed:true}}`, 403 not HOD/admin
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example DELETE /api/me/divisions/DPHI/members { user_id: 55 }
 */
router.delete('/divisions/:code/members', asyncHandler(async (req, res) => {
  const code = req.params.code;
  const userId = parseInt(req.body && req.body.user_id, 10);
  if (!userId) return res.status(400).json(buildError('VALIDATION_FAILED', 'user_id is required'));
  if (!await requireHodOrAdmin(req, code)) {
    return res.status(403).json(buildError('FORBIDDEN', 'Only the Head of Division can manage this team'));
  }
  // Moves users.division_code off the division when this was the last row.
  await knex.transaction((trx) => divisionAssignmentService.removeDivisionRole(trx, {
    userId, code, role: MEMBER_ROLE,
  }));
  await audit(req, 'DIVISION_MEMBER_REMOVE', 'user_division', userId, { division_code: code });
  res.json(buildSuccess({ removed: true }));
}));

module.exports = router;
