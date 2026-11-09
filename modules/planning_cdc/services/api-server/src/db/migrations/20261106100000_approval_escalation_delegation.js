/**
 * Automation roadmap, lot 1 (D-20261105-09): approvals that do not stall.
 *   · approval_steps.escalated_to_id / escalated_at — the Responsible Person
 *     one level above, who may decide a step that waited too long;
 *   · approval_steps.decided_by_id — who actually decided (a delegate or an
 *     escalation target decides on behalf of the step's approver);
 *   · table approval_delegations — out-of-office delegation;
 *   · event approval_step.escalated → escalation target (entity_owner) and
 *     original approver (entity_previous_owner), template automation-notice;
 *   · app_settings for both features. `approvals.escalation.since` is the
 *     day this migration runs, so steps already waiting are not escalated.
 * Idempotent; `down` removes what it added.
 */
'use strict';

const { RECIPIENT_SCOPES: S } = require('@rbm/lib/events');

const EVENT = 'approval_step.escalated';
const TEMPLATE = 'automation-notice';
const SUBSCRIPTIONS = [[S.ENTITY_OWNER, 100], [S.ENTITY_PREVIOUS_OWNER, 110]];
const today = () => new Date().toISOString().slice(0, 10);
const settings = () => [
  ['approvals.escalation.enabled', '1', 'Escalate an approval step to the Responsible Person one level above when it waits too long (1 = on).'],
  ['approvals.escalation.days', '7', 'Days an approval step may wait before it is escalated.'],
  ['approvals.escalation.since', today(), 'Only steps that became pending on or after this date (YYYY-MM-DD) are escalated.'],
  ['approvals.escalation.hour_utc', '6', 'Hour of day (0-23, UTC) the escalation check runs on working days.'],
  ['approvals.delegation.max_days', '60', 'Longest out-of-office delegation, in days.'],
];

async function insertIfMissing(knex, table, where, row) {
  if (await knex(table).where(where).first()) return;
  await knex(table).insert(row);
}

async function addStepColumns(knex) {
  const cols = [
    ['escalated_to_id', (t) => t.integer('escalated_to_id').unsigned().nullable()],
    ['escalated_at', (t) => t.timestamp('escalated_at').nullable()],
    ['decided_by_id', (t) => t.integer('decided_by_id').unsigned().nullable()],
  ];
  for (const [name, add] of cols) {
    if (!(await knex.schema.hasColumn('approval_steps', name))) {
      await knex.schema.alterTable('approval_steps', add);
    }
  }
}

async function createDelegations(knex) {
  if (await knex.schema.hasTable('approval_delegations')) return;
  await knex.schema.createTable('approval_delegations', (t) => {
    t.increments('id').primary();
    t.integer('delegator_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('delegate_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.date('starts_on').notNullable();
    t.date('ends_on').notNullable();
    t.string('reason', 255).nullable();
    t.integer('created_by').unsigned().nullable();
    t.timestamp('revoked_at').nullable();
    t.timestamps(true, true);
    t.index(['delegator_id', 'starts_on', 'ends_on'], 'approval_delegations_active');
    t.index(['delegate_id'], 'approval_delegations_delegate');
  });
}

exports.up = async function up(knex) {
  await addStepColumns(knex);
  await createDelegations(knex);
  if (await knex.schema.hasTable('notification_subscriptions')) {
    await insertIfMissing(knex, 'notification_events', { event_key: EVENT }, {
      event_key: EVENT, entity_type: 'APPROVAL_STEP', action: 'escalated',
      label: 'Approval step escalated',
      description: 'A step waited too long: the Responsible Person one level above may now decide it.',
      default_enabled: 1, is_active: 1,
    });
    for (const [scope, priority] of SUBSCRIPTIONS) {
      await insertIfMissing(knex, 'notification_subscriptions', { event_key: EVENT, recipient_scope: scope, template_key: TEMPLATE }, {
        event_key: EVENT, recipient_role: null, recipient_scope: scope, channel: 'email',
        template_key: TEMPLATE, priority, is_active: 1, throttle_window_sec: 0, metadata: '{}',
      });
    }
  }
  if (await knex.schema.hasTable('app_settings')) {
    for (const [key, value, description] of settings()) {
      await insertIfMissing(knex, 'app_settings', { key }, { key, value, description });
    }
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('notification_subscriptions')) {
    await knex('notification_subscriptions').where({ event_key: EVENT }).del();
    await knex('notification_events').where({ event_key: EVENT }).del();
  }
  if (await knex.schema.hasTable('app_settings')) {
    await knex('app_settings').whereIn('key', settings().map((s) => s[0])).del();
  }
  await knex.schema.dropTableIfExists('approval_delegations');
  for (const name of ['escalated_to_id', 'escalated_at', 'decided_by_id']) {
    if (await knex.schema.hasColumn('approval_steps', name)) {
      await knex.schema.alterTable('approval_steps', (t) => t.dropColumn(name));
    }
  }
};
