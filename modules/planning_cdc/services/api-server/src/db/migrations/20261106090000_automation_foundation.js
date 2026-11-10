/**
 * Automation roadmap, lot 0 (D-20261105-08):
 *   · table `reminder_log` — one row per reminder sent (kind, entity,
 *     recipient, period); its unique key stops a job from sending the same
 *     reminder twice (restart, second instance);
 *   · template `automation-notice`, the generic email of the scheduled alerts.
 * Idempotent; `down` drops what it added.
 */
'use strict';

const TEMPLATE = 'automation-notice';

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('reminder_log'))) {
    await knex.schema.createTable('reminder_log', (t) => {
      t.bigIncrements('id').primary();
      t.string('kind', 64).notNullable();
      t.string('entity_type', 40).notNullable();
      t.bigInteger('entity_id').notNullable().defaultTo(0);
      t.bigInteger('recipient_user_id').notNullable().defaultTo(0);
      t.string('period_key', 40).notNullable();
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      t.unique(['kind', 'entity_type', 'entity_id', 'recipient_user_id', 'period_key'], 'reminder_log_once');
    });
  }
  if ((await knex.schema.hasTable('notification_templates'))
    && !(await knex('notification_templates').where({ template_key: TEMPLATE }).first())) {
    await knex('notification_templates').insert({
      template_key: TEMPLATE,
      channel: 'email',
      subject: '{subject}',
      body_key: TEMPLATE,
      description: 'Generic notice of the scheduled alerts: escalated approvals, overdue reports, high-risk activities, data health, budget alerts, monthly digest.',
      is_active: 1,
    });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('notification_templates')) {
    await knex('notification_templates').where({ template_key: TEMPLATE }).del();
  }
  await knex.schema.dropTableIfExists('reminder_log');
};
