/**
 * notificationAdminController — handlers for notificationAdminRoutes.
 *
 * Pure controller layer: each function takes (req, res), uses Knex, and
 * returns canonical envelopes via @rbm/lib/errors helpers. Audit writes are
 * fire-and-forget; route gating is the caller's responsibility.
 *
 * Spec: docs/specs/notification-wizard.md §6.2
 */

const { buildSuccess, buildError } = require('@rbm/lib/errors');
const { STATUSES } = require('@rbm/lib/enums');
const db = require('../config/db');
const { audit } = require('../middleware/auditLog');
const { emitEvent } = require('../services/eventBusService');
const { RESOLVER_SCOPES } = require('./_notificationAdminSchemas');

function notFound(res, what) {
  return res.status(404).json(buildError('NOT_FOUND', `${what} not found`));
}

function parseMetadata(val) {
  if (val == null) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
}

function rowToDto(row) {
  if (!row) return row;
  return { ...row, metadata: parseMetadata(row.metadata) };
}

async function loadSubscriptionWithJoins(id) {
  const row = await db('notification_subscriptions as s')
    .leftJoin('notification_events as e',    'e.event_key',     's.event_key')
    .leftJoin('notification_templates as t', 't.template_key',  's.template_key')
    .where('s.id', id)
    .select(
      's.*',
      'e.label as event_label',
      'e.entity_type as event_entity_type',
      't.subject as template_subject',
      't.channel as template_channel',
    )
    .first();
  return rowToDto(row);
}

async function listEvents(_req, res) {
  const rows = await db('notification_events')
    .where({ is_active: true })
    .orderBy(['entity_type', 'action'])
    .select('event_key', 'entity_type', 'action', 'label', 'description', 'default_enabled', 'is_active');
  res.json(buildSuccess(rows));
}

async function listTemplates(_req, res) {
  const rows = await db('notification_templates')
    .where({ is_active: true })
    .orderBy('template_key')
    .select('template_key', 'channel', 'subject', 'body_key', 'description', 'is_active');
  res.json(buildSuccess(rows));
}

function listResolvers(_req, res) {
  res.json(buildSuccess(RESOLVER_SCOPES.map((code) => ({ code }))));
}

async function listSubscriptions(req, res) {
  const { event_key, is_active } = req.query;
  const q = db('notification_subscriptions as s')
    .leftJoin('notification_events as e',    'e.event_key',    's.event_key')
    .leftJoin('notification_templates as t', 't.template_key', 's.template_key')
    .select(
      's.*',
      'e.label as event_label',
      'e.entity_type as event_entity_type',
      't.subject as template_subject',
      't.channel as template_channel',
    )
    .orderBy(['s.event_key', 's.priority']);
  if (event_key) q.where('s.event_key', String(event_key));
  if (is_active !== undefined) q.where('s.is_active', is_active === 'true' || is_active === '1');
  const rows = await q;
  res.json(buildSuccess(rows.map(rowToDto)));
}

async function getSubscription(req, res) {
  const row = await loadSubscriptionWithJoins(req.params.id);
  if (!row) return notFound(res, 'Subscription');
  return res.json(buildSuccess(row));
}

async function validateFKs(body, res) {
  const eventRow = await db('notification_events').where({ event_key: body.event_key }).first();
  if (!eventRow) {
    res.status(400).json(buildError('VALIDATION_FAILED', `Unknown event_key '${body.event_key}'`));
    return false;
  }
  const tplRow = await db('notification_templates').where({ template_key: body.template_key }).first();
  if (!tplRow) {
    res.status(400).json(buildError('VALIDATION_FAILED', `Unknown template_key '${body.template_key}'`));
    return false;
  }
  return true;
}

async function createSubscription(req, res) {
  const body = req.body;
  if (!(await validateFKs(body, res))) return undefined;
  const insertRow = {
    event_key:           body.event_key,
    recipient_role:      body.recipient_role || null,
    recipient_scope:     body.recipient_scope,
    channel:             body.channel,
    template_key:        body.template_key,
    priority:            body.priority,
    is_active:           body.is_active,
    throttle_window_sec: body.throttle_window_sec,
    metadata:            JSON.stringify(body.metadata || {}),
    created_by_user_id:  req.user.id,
    updated_by_user_id:  req.user.id,
  };
  const [id] = await db('notification_subscriptions').insert(insertRow);
  await audit(req, 'CREATE_NOTIFICATION_SUBSCRIPTION', 'notification_subscription', id, {
    event_key: body.event_key, template_key: body.template_key, scope: body.recipient_scope,
  });
  const created = await loadSubscriptionWithJoins(id);
  return res.status(201).json(buildSuccess(created));
}

async function updateSubscription(req, res) {
  const id = req.params.id;
  const existing = await db('notification_subscriptions').where({ id }).first();
  if (!existing) return notFound(res, 'Subscription');
  const patch = { ...req.body, updated_by_user_id: req.user.id };
  if (patch.metadata !== undefined) patch.metadata = JSON.stringify(patch.metadata || {});
  await db('notification_subscriptions').where({ id }).update(patch);
  await audit(req, 'UPDATE_NOTIFICATION_SUBSCRIPTION', 'notification_subscription', id, {
    changed: Object.keys(req.body),
  });
  const updated = await loadSubscriptionWithJoins(id);
  return res.json(buildSuccess(updated));
}

async function toggleSubscription(req, res) {
  const id = req.params.id;
  const existing = await db('notification_subscriptions').where({ id }).first();
  if (!existing) return notFound(res, 'Subscription');
  await db('notification_subscriptions').where({ id }).update({
    is_active: req.body.is_active,
    updated_by_user_id: req.user.id,
  });
  await audit(req, 'TOGGLE_NOTIFICATION_SUBSCRIPTION', 'notification_subscription', id, {
    is_active: req.body.is_active,
  });
  const updated = await loadSubscriptionWithJoins(id);
  return res.json(buildSuccess(updated));
}

async function deleteSubscription(req, res) {
  const id = req.params.id;
  const existing = await db('notification_subscriptions').where({ id }).first();
  if (!existing) return notFound(res, 'Subscription');
  await db('notification_subscriptions').where({ id }).del();
  await audit(req, 'DELETE_NOTIFICATION_SUBSCRIPTION', 'notification_subscription', id, {
    event_key: existing.event_key, template_key: existing.template_key,
  });
  return res.json(buildSuccess({ id, deleted: true }));
}

async function testSend(req, res) {
  const { event_key, entity, metadata } = req.body;
  const eventRow = await db('notification_events').where({ event_key }).first();
  if (!eventRow) {
    return res.status(400).json(buildError('VALIDATION_FAILED', `Unknown event_key '${event_key}'`));
  }
  const result = await emitEvent({
    eventKey: event_key,
    entity,
    actor: req.user,
    metadata: { ...metadata, _test: true },
  });
  await audit(req, 'TEST_NOTIFICATION_SEND', 'notification_event', null, {
    event_key, ...result,
  });
  return res.json(buildSuccess({ event_key, ...result }));
}

/* eslint-disable max-lines -- controller aggregates all notification-wizard CRUD; splitting would fragment a cohesive admin surface */
/**
 * GET /api/admin/notifications/outbox
 * Lists recent `notification_outbox` rows (the email queue) so admins can
 * audit delivery status (queued / sent / failed) and the reason for any
 * failure. Supports `status`, `recipient` (partial match), `event_key`,
 * and `limit` (default 100, max 500).
 */
/**
 * GET /api/admin/notifications/outbox/:id/preview
 * Renders the HTML body that was (or would be) sent for this outbox
 * row. Re-runs the template against the stored payload so admins can
 * audit "what did the user actually see?" without digging through logs.
 */
// Sample payload used by `previewTemplate` to render a template without
// a real outbox row. Kept deliberately generic so any template resolves.
const SAMPLE_PAYLOAD = {
  reportType:  'Indicator Quarterly Report',
  code:        'CT.10.2-1',
  title:       'Number of safety surveillance studies conducted on the continent',
  submittedBy: 'Jane Doe',
  reviewedBy:  'M&E Officer',
  decision:    STATUSES.APPROVED,
  quarter:     'Q1',
  fiscalYear:  '2026',
  division:    'CT',
  status:      STATUSES.IN_REVIEW,
  reviewUrl:   '/quarterly-report/6154?q=Q1&division=CT',
  resetUrl:    '/reset?token=sample',
  activityName:'Sample activity',
  activityCode:'ACT-001',
  message:     'Sample notification body',
  // Nested shape read by the wizard-path templates (report-submitted-details,
  // report-preparer-changed — D-20261013-07).
  metadata: {
    reportType: 'Activity Report', code: '1.2.3.1', title: 'Sample activity', division: 'CT',
    quarter: 'Q3', fiscalYear: '2026', submittedBy: 'Jane Doe', reportUrl: '/activity-report/1/report/1',
    fields: [{ label: 'Achievements', value: 'Trained 40 lab focal points' }, { label: 'Challenges', value: 'Late venue booking' }],
    attachments: [{ name: 'Attendance list.pdf', url: 'https://example.sharepoint.com/attendance.pdf' }],
    fromName: 'John Smith', toName: 'Jane Doe', changedBy: 'M&E Officer', reason: 'Jane led the mission',
  },
};

async function previewTemplate(req, res) {
  const templateKey = String(req.params.templateKey || '').trim();
  if (!templateKey) {
    return res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'templateKey required' });
  }
  try {
    const { TEMPLATES_BY_KEY } = require('../../../notification-service/src/templates');
    const entry = TEMPLATES_BY_KEY[templateKey];
    if (!entry) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: `Template not registered: ${templateKey}` });
    }
    const html = entry.render(SAMPLE_PAYLOAD);
    return res.json(buildSuccess({ template_key: templateKey, sample_payload: SAMPLE_PAYLOAD, html }));
  } catch (err) {
    return res.status(500).json({ success: false, code: 'PREVIEW_FAILED', message: err?.message || 'Render failed' });
  }
}

// eslint-disable-next-line complexity -- orchestrates 3-branch render path (template_key / event_key / error fallback); clearer flat.
async function previewOutbox(req, res) {
  const knex = req.knex || require('../config/db');
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'invalid id' });
  }
  const row = await knex('notification_outbox').where('id', id).first();
  if (!row) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Outbox row not found' });

  let payload = {};
  try { payload = row.payload ? JSON.parse(row.payload) : {}; } catch { payload = {}; }

  let html = null;
  let templateKey = payload.template_key || null;
  let error = null;
  try {
    // Templates live in notification-service; load the registry from
    // its relative path. Ugly but avoids a cross-service HTTP hop.
    const { resolveTemplate } = require('../../../notification-service/src/templates');
    const { entry } = resolveTemplate(row);
    html = entry.render(payload);
    templateKey = templateKey || entry.key;
  } catch (err) {
    error = err?.message || 'Failed to render template';
  }

  return res.json(buildSuccess({
    id: row.id,
    event_key: row.event_key,
    recipient: row.recipient,
    subject: row.subject,
    template_key: templateKey,
    payload,
    html,
    error,
  }));
}

async function listOutbox(req, res) {
  const knex = req.knex || require('../config/db');
  const statusFilter = req.query.status ? String(req.query.status).toLowerCase() : null;
  const recipient = req.query.recipient ? String(req.query.recipient).trim() : null;
  const eventKey = req.query.event_key ? String(req.query.event_key).trim() : null;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);

  const q = knex('notification_outbox')
    .select('id', 'event_key', 'recipient', 'subject', 'status', 'attempts',
            'last_error', 'correlation_id', 'payload', 'headers',
            'created_at', 'updated_at', 'sent_at')
    .orderBy('id', 'desc')
    .limit(limit);
  if (statusFilter) q.where('status', statusFilter);
  if (recipient) q.where('recipient', 'like', `%${recipient}%`);
  if (eventKey) q.where('event_key', eventKey);

  const rows = await q;
  // Status counts help the UI show "3 queued, 42 sent, 1 failed" at a glance.
  const counts = await knex('notification_outbox').select('status').count('* as n').groupBy('status');
  return res.json(buildSuccess({ rows, counts, total: rows.length }));
}

module.exports = {
  listEvents, listTemplates, listResolvers,
  listSubscriptions, getSubscription,
  createSubscription, updateSubscription, toggleSubscription, deleteSubscription,
  testSend, listOutbox, previewOutbox, previewTemplate,
};
