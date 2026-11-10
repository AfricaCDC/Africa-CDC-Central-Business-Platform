/**
 * eventBusService — emit workflow events into the notification wizard.
 *
 * Replaces hardcoded `notifyService.notify(...)` call-sites. Each emit:
 *   1. Selects active subscriptions for the given event key.
 *   2. Resolves recipient user IDs per subscription via the resolver
 *      registry (notificationResolvers.js).
 *   3. Dedupes `(user_id, channel, template_key)` across subscriptions.
 *   4. Inserts `notification_outbox` rows. The notification-service
 *      worker drains the outbox and delivers via SMTP / in-app.
 *   5. Writes an `audit_events` row (`WORKFLOW_EVENT_EMITTED`).
 *
 * Never throws: resolver failures are swallowed and logged so a notify
 * bug can't fail the originating route.
 *
 * Spec: docs/specs/notification-wizard.md §6.1
 * Decision: D-20260417-01
 */

const { createLogger } = require('@rbm/lib/logger');
const db = require('../config/db');
const { resolveRecipients } = require('./notificationResolvers');

const log = createLogger('api-server').child({ module: 'eventBusService' });

async function fetchActiveSubscriptions(knex, eventKey) {
  try {
    return await knex('notification_subscriptions')
      .join('notification_events', 'notification_events.event_key', 'notification_subscriptions.event_key')
      .where('notification_subscriptions.event_key', eventKey)
      .where('notification_subscriptions.is_active', true)
      .where('notification_events.is_active', true)
      .select(
        'notification_subscriptions.id as id',
        'notification_subscriptions.event_key',
        'notification_subscriptions.recipient_role',
        'notification_subscriptions.recipient_scope',
        'notification_subscriptions.channel',
        'notification_subscriptions.template_key',
        'notification_subscriptions.priority',
      )
      .orderBy('notification_subscriptions.priority');
  } catch (err) {
    log.error({ eventKey, err: err?.message }, 'subscription lookup failed');
    return [];
  }
}

async function writeResolverFailureAudit(knex, { eventKey, subscription, actor, error }) {
  try {
    await knex('audit_events').insert({
      actor_user_id: actor?.id || null,
      action: 'WORKFLOW_EVENT_RESOLVER_FAILED',
      entity_type: 'NOTIFICATION_SUBSCRIPTION',
      entity_id: subscription.id,
      metadata: JSON.stringify({ eventKey, error, scope: subscription.recipient_scope }),
    });
  } catch { /* audit is best-effort */ }
}

function expandSubscriptionChannels(subscription) {
  return subscription.channel === 'both' ? ['email', 'in_app'] : [subscription.channel];
}

/**
 * Walk subscriptions → resolve recipients → dedupe.
 * @returns {Promise<{ sent: Map<string, object>, matchedSubIds: number[] }>}
 */
async function fanOutSubscriptions(subs, { entity, actor, knex, eventKey }) {
  const sent = new Map();
  const matchedSubIds = [];

  for (const sub of subs) {
    const { userIds, error } = await resolveRecipients(sub, entity, actor, knex);
    if (error) {
      log.warn({ eventKey, subId: sub.id, error }, 'resolver failed');
      await writeResolverFailureAudit(knex, { eventKey, subscription: sub, actor, error });
      continue;
    }
    if (!userIds.length) continue;
    matchedSubIds.push(sub.id);

    const channels = expandSubscriptionChannels(sub);
    for (const userId of userIds) {
      for (const channel of channels) {
        const key = `${userId}:${channel}:${sub.template_key}`;
        if (!sent.has(key)) sent.set(key, { userId, channel, subscription: sub });
      }
    }
  }

  return { sent, matchedSubIds };
}

async function loadUserMap(knex, userIds) {
  if (!userIds.length) return new Map();
  const users = await knex('users').whereIn('id', userIds).select('id', 'email', 'first_name', 'last_name');
  return new Map(users.map((u) => [u.id, u]));
}

function buildOutboxRow({ userId, channel, subscription, user, eventKey, entity, actor, metadata, correlationId }) {
  // Dev-safety redirect: in LOCAL dev only, every outbound email is
  // rewritten to DEV_EMAIL_OVERRIDE so an engineer can wire notifications
  // without risk of spamming real HODs / focals. HARD GATED:
  //   - DEV_EMAIL_OVERRIDE must be set (the target address)
  //   - NODE_ENV must NOT be "production" or "staging"
  // Both conditions → override active. Either missing → real recipient.
  // The original recipient is preserved in the payload for audit.
  const env = String(process.env.NODE_ENV || '').toLowerCase();
  const isSensitiveEnv = env === 'production' || env === 'staging' || env === 'prod';
  const devOverride = (!isSensitiveEnv && process.env.DEV_EMAIL_OVERRIDE) || null;
  const emailTarget = channel === 'email'
    ? (devOverride || user.email)
    : `user:${userId}`;
  return {
    event_key: eventKey,
    subscription_id: subscription.id,
    recipient_user_id: userId,
    recipient: emailTarget,
    channel,
    payload: JSON.stringify({
      template_key: subscription.template_key,
      entity,
      actor: actor ? { id: actor.id, email: actor.email } : null,
      recipient: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name },
      metadata,
    }),
    status: 'queued',
    correlation_id: correlationId,
  };
}

function buildOutboxRows(sent, userMap, ctx) {
  const rows = [];
  for (const { userId, channel, subscription } of sent.values()) {
    const user = userMap.get(userId);
    if (!user) continue;
    if (channel === 'email' && !user.email) continue;
    rows.push(buildOutboxRow({ userId, channel, subscription, user, ...ctx }));
  }
  return rows;
}

async function insertOutboxRows(knex, rows, eventKey) {
  if (!rows.length) return 0;
  try {
    await knex('notification_outbox').insert(rows);
    return rows.length;
  } catch (err) {
    log.error({ eventKey, err: err?.message }, 'outbox insert failed');
    return 0;
  }
}

async function writeEmittedAudit(knex, { eventKey, entity, actor, matchedSubIds, recipientCount, outboxCount }) {
  try {
    await knex('audit_events').insert({
      actor_user_id: actor?.id || null,
      action: 'WORKFLOW_EVENT_EMITTED',
      entity_type: entity?.entity_type || 'EVENT',
      entity_id: entity?.id || null,
      metadata: JSON.stringify({
        event_key: eventKey,
        matched_subscription_ids: matchedSubIds,
        recipient_count: recipientCount,
        outbox_rows: outboxCount,
      }),
    });
  } catch { /* audit is best-effort */ }
}

/**
 * Emit a workflow event. Fire-and-forget from the caller's POV: this
 * function awaits fan-out but never re-throws.
 *
 * @param {object} params
 * @param {string} params.eventKey - e.g. 'plan_node.submitted'
 * @param {object} params.entity - row that triggered the event
 * @param {object|null} [params.actor] - req.user, or null for cron
 * @param {object} [params.metadata={}] - extra vars for the template
 * @param {string|null} [params.correlationId] - caller-provided trace id
 * @param {import('knex').Knex} [params.knex] - optional trx
 * @returns {Promise<{matched: number, recipients: number, outboxRows: number}>}
 *
 * @example
 *   await emitEvent({
 *     eventKey: 'activity_report.submitted',
 *     entity: report,
 *     actor: req.user,
 *     metadata: { period_label: 'Q2 FY26' },
 *   });
 */
function isValidEventKey(eventKey) {
  return Boolean(eventKey) && typeof eventKey === 'string';
}

async function emitEvent({
  eventKey,
  entity = {},
  actor = null,
  metadata = {},
  correlationId = null,
  knex = db,
} = {}) {
  if (!isValidEventKey(eventKey)) {
    log.warn({ eventKey }, 'emitEvent called with invalid eventKey');
    return { matched: 0, recipients: 0, outboxRows: 0 };
  }

  const subs = await fetchActiveSubscriptions(knex, eventKey);
  if (!subs.length) return { matched: 0, recipients: 0, outboxRows: 0 };

  const { sent, matchedSubIds } = await fanOutSubscriptions(subs, { entity, actor, knex, eventKey });
  if (!sent.size) return { matched: matchedSubIds.length, recipients: 0, outboxRows: 0 };

  const userIds = Array.from(new Set(Array.from(sent.values()).map((v) => v.userId)));
  const userMap = await loadUserMap(knex, userIds);
  const rows = buildOutboxRows(sent, userMap, { eventKey, entity, actor, metadata, correlationId });
  const inserted = await insertOutboxRows(knex, rows, eventKey);
  await writeEmittedAudit(knex, {
    eventKey, entity, actor,
    matchedSubIds, recipientCount: sent.size, outboxCount: inserted,
  });

  return { matched: matchedSubIds.length, recipients: sent.size, outboxRows: inserted };
}

module.exports = {
  emitEvent,
};
