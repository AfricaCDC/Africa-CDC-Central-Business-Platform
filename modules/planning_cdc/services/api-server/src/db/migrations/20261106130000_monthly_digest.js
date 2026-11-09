/**
 * Automation roadmap, lot 7 (D-20261105-15): monthly digest for directors.
 * Event digest.monthly → the directorate's Responsible Person
 * (entity_owner), template automation-notice; app_settings of the job.
 * Idempotent; `down` removes what it added.
 */
'use strict';

const { RECIPIENT_SCOPES: S } = require('@rbm/lib/events');

const EVENT = 'digest.monthly';
const TEMPLATE = 'automation-notice';
const SETTINGS = [
  ['digest.monthly.enabled', '1', 'Monthly email to each director with the digest of their directorate (1 = on).'],
  ['digest.monthly.day', '1', 'Day of the month (1-28, UTC) the monthly digest is sent.'],
  ['digest.monthly.hour_utc', '6', 'Hour of day (0-23, UTC) the monthly digest is sent.'],
];

async function insertIfMissing(knex, table, where, row) {
  if (await knex(table).where(where).first()) return;
  await knex(table).insert(row);
}

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('notification_subscriptions')) {
    await insertIfMissing(knex, 'notification_events', { event_key: EVENT }, {
      event_key: EVENT, entity_type: 'DIRECTORATE', action: 'monthly', label: 'Monthly digest for directors',
      description: 'Monthly: the plan, approvals waiting, high-risk activities, reports and budget execution of a directorate.', default_enabled: 1, is_active: 1,
    });
    const where = { event_key: EVENT, recipient_scope: S.ENTITY_OWNER, recipient_role: null, template_key: TEMPLATE };
    await insertIfMissing(knex, 'notification_subscriptions', where, { ...where, channel: 'email', priority: 100, is_active: 1, throttle_window_sec: 0, metadata: '{}' });
  }
  if (await knex.schema.hasTable('app_settings')) {
    for (const [key, value, description] of SETTINGS) await insertIfMissing(knex, 'app_settings', { key }, { key, value, description });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('notification_subscriptions')) {
    await knex('notification_subscriptions').where('event_key', EVENT).del();
    await knex('notification_events').where('event_key', EVENT).del();
  }
  if (await knex.schema.hasTable('app_settings')) await knex('app_settings').whereIn('key', SETTINGS.map((x) => x[0])).del();
};
