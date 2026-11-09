/**
 * Live server-error alert email (D-20261009-04).
 *
 * Wires the alert through the notification tables so it stays admin-managed
 * (the sending code is services/errorAlertService.js, called by requestLogger
 * on every 5xx):
 *   · role TECH_ALERTS — grants no permission; whoever holds it receives the
 *     alerts. Add or remove people from Admin → Users.
 *   · event system.server_error + subscription role_all_active:TECH_ALERTS
 *     on template system-server-error (editable on /admin/notifications).
 *   · app_settings alerts.server_error.enabled (1 = on) and
 *     alerts.server_error.repeat_window_min (the same error for the same user
 *     is mailed once per window, repeats are counted in the next alert).
 *
 * Idempotent. down() removes the rows it created.
 */

'use strict';

const { ROLES } = require('@rbm/lib/roles');
const { RECIPIENT_SCOPES } = require('@rbm/lib/events');

const EVENT_KEY = 'system.server_error';
const TEMPLATE_KEY = 'system-server-error';
const SETTINGS = [
  ['alerts.server_error.enabled', '1', 'Email TECH_ALERTS holders as soon as a user hits a server error (1 = on).'],
  ['alerts.server_error.repeat_window_min', '30', 'Minutes before the same error for the same user on the same page is emailed again; repeats are counted in the next alert.'],
];

async function insertIfMissing(knex, table, where, row) {
  if (!(await knex.schema.hasTable(table))) return;
  if (await knex(table).where(where).first()) return;
  await knex(table).insert(row);
}

exports.up = async function up(knex) {
  await insertIfMissing(knex, 'roles', { code: ROLES.TECH_ALERTS }, {
    code: ROLES.TECH_ALERTS,
    name: 'Technical alerts',
    description: 'Receives an email as soon as a user hits a server error. Grants no permission.',
    permissions: '[]',
  });

  await insertIfMissing(knex, 'notification_events', { event_key: EVENT_KEY }, {
    event_key: EVENT_KEY,
    entity_type: 'SYSTEM',
    action: 'server_error',
    label: 'Server error (live)',
    description: 'A user hit a server error (HTTP 5xx): who, page, what they entered, exact error.',
    default_enabled: 1,
    is_active: 1,
  });

  await insertIfMissing(knex, 'notification_templates', { template_key: TEMPLATE_KEY }, {
    template_key: TEMPLATE_KEY,
    channel: 'email',
    subject: '[RBM] Server error',
    body_key: TEMPLATE_KEY,
    description: 'Live alert for one server error: user, page, input, error.',
    is_active: 1,
  });

  await insertIfMissing(knex, 'notification_subscriptions', { event_key: EVENT_KEY, recipient_role: ROLES.TECH_ALERTS }, {
    event_key: EVENT_KEY,
    recipient_role: ROLES.TECH_ALERTS,
    recipient_scope: RECIPIENT_SCOPES.ROLE_ALL_ACTIVE,
    channel: 'email',
    template_key: TEMPLATE_KEY,
    priority: 100,
    is_active: 1,
    throttle_window_sec: 0,
    metadata: '{}',
  });

  for (const [key, value, description] of SETTINGS) {
    await insertIfMissing(knex, 'app_settings', { key }, { key, value, description });
  }
};

exports.down = async function down(knex) {
  await knex('notification_subscriptions').where({ event_key: EVENT_KEY, recipient_role: ROLES.TECH_ALERTS }).del();
  await knex('notification_templates').where('template_key', TEMPLATE_KEY).del();
  await knex('notification_events').where('event_key', EVENT_KEY).del();
  await knex('app_settings').whereIn('key', SETTINGS.map(([key]) => key)).del();
  const role = await knex('roles').where('code', ROLES.TECH_ALERTS).first();
  if (role) {
    await knex('user_roles').where('role_id', role.id).del();
    await knex('roles').where('id', role.id).del();
  }
};
