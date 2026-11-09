const express = require('express');
const router = express.Router();
const s = require('../services/governanceService');
const workflowEngine = require('../services/workflowEngine');
const { canDecideStep } = require('../services/approvals/approverIdentity');
const asyncHandler = require('../middleware/asyncHandler');
const { buildSuccess } = require('@rbm/lib/errors');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const { audit } = require('../middleware/auditLog');

router.use(authenticateToken);

/**
 * Record a decision on an approval step (cascades instance status + auto-snapshot).
 * @name PUT /api/governance/steps/:id/decide
 * @param {express.Request} req — body `{ decision, comments }`
 * @param {express.Response} res — 200 JSON with the updated step
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example PUT /api/governance/steps/5/decide { decision: 'approved', comments: 'LGTM' }
 */
router.put('/steps/:id/decide', asyncHandler(async (req, res) => {
  const stepId = parseInt(req.params.id, 10);
  // The step's acting approver (approver, delegate, escalation target), or a
  // user who approves every step of that entity type at scope « all » (M&E
  // picking up an unassigned step). The module follows the entity type
  // (D-20261108-02), not always the quarterly report.
  if (!(await canDecideStep(req.user.id, stepId))) {
    res.status(403).json({ success: false, message: 'You cannot act on this step', code: 'FORBIDDEN' });
    return;
  }
  // Delegate to workflowEngine so every step decision is recorded in
  // indicator_report_history (not only the final one), keeping the
  // quarterly-report workflow timeline accurate across the 3-step contributor
  // chain. See D-20260418-31.
  const result = await workflowEngine.decideWorkflowStep(
    stepId, req.body.decision, req.body.comments, req.user.id, req,
  );
  res.json(result);
}));

// Audit
/**
 * List audit events joined with actor name (filterable, capped).
 * @name GET /api/governance/audit
 * @param {express.Request} req — query `entity_type`, `entity_id`, `actor_id`, `limit`
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/governance/audit?entity_type=user&limit=50
 */
router.get('/audit', authorize({ module: RBAC_MODULES.AUDIT_LOG, action: RBAC_ACTIONS.READ }), asyncHandler(async (req, res) => { res.json(await s.getAuditEvents(req.query)); }));

// Inbox & Drafts
/**
 * Approval instances awaiting the current user's action.
 * @name GET /api/governance/inbox
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/governance/inbox
 */
router.get('/inbox', asyncHandler(async (req, res) => { res.json(await s.getInbox(req.user.id)); }));
/**
 * Approval instances the current user authored that are still DRAFT.
 * @name GET /api/governance/my-drafts
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/governance/my-drafts
 */
router.get('/my-drafts', asyncHandler(async (req, res) => { res.json(await s.getMyDrafts(req.user.id)); }));

// Notifications
/**
 * 50 most recent notifications for the current user.
 * @name GET /api/governance/notifications
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON array
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/governance/notifications
 */
router.get('/notifications', asyncHandler(async (req, res) => { res.json(await s.getNotifications(req.user.id)); }));
/**
 * Mark a single notification as read.
 * @name PUT /api/governance/notifications/:id/read
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON `{ ok: true }`
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example PUT /api/governance/notifications/99/read
 */
router.put('/notifications/:id/read', asyncHandler(async (req, res) => { await s.markRead(req.params.id, req.user.id); res.json(buildSuccess(null)); }));
/**
 * Mark every unread notification for the current user as read.
 * @name PUT /api/governance/notifications/read-all
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON `{ ok: true }`
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example PUT /api/governance/notifications/read-all
 */
router.put('/notifications/read-all', asyncHandler(async (req, res) => { await s.markAllRead(req.user.id); res.json(buildSuccess(null)); }));

// Page-view tracking (frontend navigation audit)
/**
 * Record a page navigation event from the frontend SPA.
 * Fire-and-forget on the client side — audit should never disrupt UX.
 *
 * @name POST /api/governance/page-view
 * @param {express.Request} req — body `{ path, search, timestamp }`
 * @param {express.Response} res — 200 JSON `{ success: true }`
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example POST /api/governance/page-view { path: '/dashboard', search: '' }
 */
router.post('/page-view', asyncHandler(async (req, res) => {
  const { path: pagePath, search } = req.body || {};
  await audit(req, 'PAGE_VIEW', 'navigation', null, {
    path: String(pagePath || '/').slice(0, 500),
    search: String(search || '').slice(0, 500),
  });
  res.json(buildSuccess(null));
}));

module.exports = router;
