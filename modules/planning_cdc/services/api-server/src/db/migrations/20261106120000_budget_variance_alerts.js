/**
 * Automation roadmap, lot 5 (D-20261105-13): budget variance after a SAP
 * import. Event budget_execution.variance → focal person and Responsible
 * Person of the unit (focal_of_main, entity_main_hod), template
 * automation-notice; app_settings of the thresholds. Idempotent; `down`
 * removes what it added.
 */
'use strict';

const { RECIPIENT_SCOPES: S } = require('@rbm/lib/events');

const EVENT = 'budget_execution.variance';
const TEMPLATE = 'automation-notice';
const RECIPIENTS = [[S.FOCAL_OF_MAIN, 100], [S.ENTITY_MAIN_HOD, 110]];
const SETTINGS = [
  ['alerts.budget.enabled', '1', 'After a budget execution import sent to the units, email each unit its broad activities over budget or executing slowly (1 = on).'],
  ['alerts.budget.over_pct', '100', 'Execution (committed + spent) / released above this percentage flags an activity as over budget.'],
  ['alerts.budget.under_gap_pct', '30', 'From Q3, execution this many points below the expected pace (completed quarters x 25) flags an activity as slow.'],
];

async function insertIfMissing(knex, table, where, row) {
  if (await knex(table).where(where).first()) return;
  await knex(table).insert(row);
}

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('notification_subscriptions')) {
    await insertIfMissing(knex, 'notification_events', { event_key: EVENT }, {
      event_key: EVENT, entity_type: 'BUDGET_EXECUTION', action: 'variance', label: 'Budget execution to look at',
      description: 'After a budget execution import: the broad activities of a unit over budget or executing slowly.', default_enabled: 1, is_active: 1,
    });
    for (const [scope, priority] of RECIPIENTS) {
      const where = { event_key: EVENT, recipient_scope: scope, recipient_role: null, template_key: TEMPLATE };
      await insertIfMissing(knex, 'notification_subscriptions', where, { ...where, channel: 'email', priority, is_active: 1, throttle_window_sec: 0, metadata: '{}' });
    }
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
