/**
 * notificationAdminRoutes — admin CRUD over the Notification Wizard model.
 *
 * Endpoints (mounted under `/api/admin/notifications`):
 *   GET    /events                   — catalog
 *   GET    /templates                — registered templates
 *   GET    /resolvers                — registered recipient resolvers
 *   GET    /subscriptions            — list with joins
 *   GET    /subscriptions/:id        — single subscription
 *   POST   /subscriptions            — create
 *   PUT    /subscriptions/:id        — update
 *   PATCH  /subscriptions/:id/toggle — flip is_active
 *   DELETE /subscriptions/:id        — delete
 *   POST   /test-send                — fire `emitEvent` with synthetic payload
 *
 * RBAC — every route is gated by `authorize({ module: 'notifications', action })`
 * (matrix seeded by 20260417000000_notification_wizard.js step 5).
 *
 * Envelope — canonical `{ success, data }` / `{ success, message, code }` only.
 *
 * Spec: docs/specs/notification-wizard.md §6.2
 * Decision: D-20260417-01
 */

const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const { validate } = require('../middleware/validate');
const c = require('./_notificationAdminController');
const {
  subscriptionCreateSchema,
  subscriptionUpdateSchema,
  toggleSchema,
  testSendSchema,
  idParamSchema,
} = require('./_notificationAdminSchemas');

const router = express.Router();
router.use(authenticateToken);

const canRead     = authorize({ module: 'notifications', action: 'read' });
const canCreate   = authorize({ module: 'notifications', action: 'create' });
const canUpdate   = authorize({ module: 'notifications', action: 'update' });
const canDelete   = authorize({ module: 'notifications', action: 'delete' });
const canToggle   = authorize({ module: 'notifications', action: 'toggle' });
const canSendTest = authorize({ module: 'notifications', action: 'send_test' });

router.get('/events',     canRead, asyncHandler(c.listEvents));
router.get('/templates',  canRead, asyncHandler(c.listTemplates));
router.get('/resolvers',  canRead, c.listResolvers);

router.get('/subscriptions',     canRead, asyncHandler(c.listSubscriptions));
router.get('/subscriptions/:id', canRead,
  validate(idParamSchema, 'params'),
  asyncHandler(c.getSubscription));

router.post('/subscriptions', canCreate,
  validate(subscriptionCreateSchema),
  asyncHandler(c.createSubscription));

router.put('/subscriptions/:id', canUpdate,
  validate(idParamSchema, 'params'),
  validate(subscriptionUpdateSchema),
  asyncHandler(c.updateSubscription));

router.patch('/subscriptions/:id/toggle', canToggle,
  validate(idParamSchema, 'params'),
  validate(toggleSchema),
  asyncHandler(c.toggleSubscription));

router.delete('/subscriptions/:id', canDelete,
  validate(idParamSchema, 'params'),
  asyncHandler(c.deleteSubscription));

router.post('/test-send', canSendTest,
  validate(testSendSchema),
  asyncHandler(c.testSend));

router.get('/outbox', canRead, asyncHandler(c.listOutbox));
router.get('/outbox/:id/preview', canRead, asyncHandler(c.previewOutbox));
router.get('/templates/:templateKey/preview', canRead, asyncHandler(c.previewTemplate));

module.exports = router;
