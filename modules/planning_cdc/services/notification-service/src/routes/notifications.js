/**
 * notification-service / routes/notifications.js — durable enqueue path.
 *
 * Endpoints:
 *   POST /send       — enqueue one or more outbox rows (validated by Zod).
 *   GET  /templates  — list available template keys (admin/dev utility).
 *
 * In-app notifications are owned by api-server's `governance/notifications`
 * table, not this service. The legacy `/pending` and `/mark-read` endpoints
 * backed the old in-memory queue — removed with D-05 / F-026.
 */

const express = require('express');
const { notificationRequestSchema } = require('@rbm/schemas/notification');
const {
  asyncHandler,
  buildSuccess,
  ForbiddenError,
  ValidationError,
} = require('@rbm/lib/errors');
const { createLogger } = require('@rbm/lib/logger');
const outbox = require('../outbox');
const { TEMPLATES } = require('../templates');

const router = express.Router();
const log = createLogger('notification-service', { component: 'routes' });

/**
 * Normalize the two accepted request shapes into a flat `{ recipients: string[] }`.
 *
 * @param {object} body — already Zod-parsed.
 * @returns {string[]}
 */
function collectRecipients(body) {
  if (Array.isArray(body.to)) return body.to;
  if (typeof body.to === 'string') return [body.to];
  if (Array.isArray(body.recipients)) {
    return body.recipients.map((r) => r.email).filter(Boolean);
  }
  return [];
}

/**
 * POST /send — validate, enqueue, return the inserted ids.
 *
 * @example
 *   POST /send
 *   {
 *     "type": "REPORT_SUBMITTED",
 *     "to": "user@africacdc.org",
 *     "data": { "report_url": "https://pra.africacdc.org/review-submissions" }
 *   }
 */
router.post('/send', asyncHandler(async (req, res) => {
  // Sending mail from the official mailbox is for services only: a signed-in
  // user's token must not choose recipients, subject and links (D-20261108-02).
  if (!req.service) throw new ForbiddenError('A service token is required to send email');
  const parsed = notificationRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid notification request', parsed.error.flatten());
  }
  const body = parsed.data;

  const recipients = collectRecipients(body);
  if (recipients.length === 0) {
    throw new ValidationError('At least one recipient is required');
  }

  const channels = body.channels || ['email'];
  if (!channels.includes('email')) {
    // No email work to do. Pure in-app sends aren't owned by this service.
    return res.status(202).json(buildSuccess({ enqueued: 0, ids: [], skipped: 'email_channel_not_requested' }));
  }

  const result = await outbox.enqueue({
    eventKey:      body.type,
    recipients,
    subject:       body.subject,
    data:          body.data,
    correlationId: body.correlationId,
  });

  log.info('send.enqueued', {
    eventKey: body.type,
    count: result.ids.length,
    correlationId: result.correlationId,
    actor: req.service ? `svc:${req.service.name}` : `user:${req.user && req.user.id}`,
  });

  return res.status(201).json(buildSuccess({
    enqueued: result.ids.length,
    ids: result.ids,
    correlationId: result.correlationId,
  }));
}));

/**
 * GET /templates — list registered template keys. Admin/dev utility.
 *
 * @example
 *   GET /templates -> { success: true, data: { templates: ['ACTIVITY_UPDATED', ...] } }
 */
router.get('/templates', (req, res) => {
  res.json(buildSuccess({ templates: Object.keys(TEMPLATES) }));
});

module.exports = router;
