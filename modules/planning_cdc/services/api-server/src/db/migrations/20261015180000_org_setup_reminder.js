/**
 * Weekly org structure set-up reminder (D-20261015-07): event
 * `org_setup.incomplete`, template `org-setup-incomplete`, sent to every
 * active system administrator and RBM administrator (role_all_active), and
 * its `app_settings` keys. Inserted only when missing; `down` removes them.
 */
'use strict';

const { RECIPIENT_SCOPES: S } = require('@rbm/lib/events');
const { ROLES } = require('@rbm/lib/roles');

const EVENT = 'org_setup.incomplete';
const TEMPLATE = 'org-setup-incomplete';
const RECIPIENTS = [[ROLES.SYSTEM_ADMIN, 100], [ROLES.RBM_ADMIN, 110]];
const SETTINGS = [
  ['reminders.org_setup.enabled', '1', 'Weekly email to the administrators listing the business units without a responsible person, an M&E officer or a focal person (1 = on).'],
  ['reminders.org_setup.weekday', '1', 'Day of the week (0 = Sunday … 6 = Saturday, UTC) the org set-up reminder is sent.'],
  ['reminders.org_setup.hour_utc', '7', 'Hour of day (0-23, UTC) the org set-up reminder is sent.'],
];

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('notification_subscriptions')) {
    if (!(await knex('notification_templates').where('template_key', TEMPLATE).first())) {
      await knex('notification_templates').insert({
        template_key: TEMPLATE, channel: 'email', subject: 'Org structure: {count} business units to complete', body_key: TEMPLATE,
        description: 'Business units without a responsible person, an M&E officer or a focal person.', is_active: 1,
      });
    }
    if (!(await knex('notification_events').where('event_key', EVENT).first())) {
      await knex('notification_events').insert({
        event_key: EVENT, entity_type: 'ORG_SETUP', action: 'incomplete', label: 'Org structure incomplete',
        description: 'Weekly: business units that miss a responsible person, an M&E officer or a focal person.', default_enabled: 1, is_active: 1,
      });
    }
    for (const [role, priority] of RECIPIENTS) {
      const where = { event_key: EVENT, recipient_scope: S.ROLE_ALL_ACTIVE, recipient_role: role, template_key: TEMPLATE };
      if (await knex('notification_subscriptions').where(where).first()) continue;
      await knex('notification_subscriptions').insert({ ...where, channel: 'email', priority, is_active: 1, throttle_window_sec: 0, metadata: '{}' });
    }
  }
  if (await knex.schema.hasTable('app_settings')) {
    for (const [key, value, description] of SETTINGS) {
      if (!(await knex('app_settings').where({ key }).first())) await knex('app_settings').insert({ key, value, description });
    }
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('notification_subscriptions')) {
    await knex('notification_subscriptions').where('event_key', EVENT).del();
    await knex('notification_events').where('event_key', EVENT).del();
    await knex('notification_templates').where('template_key', TEMPLATE).del();
  }
  if (await knex.schema.hasTable('app_settings')) await knex('app_settings').whereIn('key', SETTINGS.map((x) => x[0])).del();
};
