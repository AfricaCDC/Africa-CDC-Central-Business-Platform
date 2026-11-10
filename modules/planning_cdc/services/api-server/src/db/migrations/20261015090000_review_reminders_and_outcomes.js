/**
 * Review reminders, decision outcomes and removal notices (D-20261015-01).
 *
 * All wired through the notification tables so they stay admin-managed on
 * /admin/notifications:
 *   · approved / validated / rejected: the subscriptions to
 *     `entity_responsible` resolved to nobody (report rows carry no
 *     responsible_user_id). They now go to the author (`entity_owner`), and
 *     new rows add the business unit focal person (`focal_of_main`) and head
 *     (`entity_main_hod`).
 *   · indicator_report.not_applicable → BU focal person and head, heads of
 *     the contributing divisions; activity_report.draft_deleted → author,
 *     BU focal person and head. Template report-removed.
 *   · review_queue.pending → each approver, every weekday (cron
 *     reviewPendingReminderCron). Template review-pending-reminder.
 *   · app_settings reminders.review.enabled ('1') and reminders.review.hour_utc ('6').
 *
 * Idempotent. down() removes the rows it added and restores the scopes.
 */

'use strict';

const { RECIPIENT_SCOPES: S } = require('@rbm/lib/events');

const REVIEWED = 'report-reviewed';
const REMOVED = 'report-removed';
const REMINDER = 'review-pending-reminder';
const OUTCOME_EVENTS = [
  'activity_report.approved', 'activity_report.rejected',
  'indicator_report.validated', 'indicator_report.rejected',
];

const TEMPLATES = [
  [REMOVED, '{heading}: {code} ({quarter} {fiscalYear})', 'Indicator marked not applicable, or activity report draft deleted.'],
  [REMINDER, '{count} reports waiting for your review', 'Weekday list of the reports waiting for the approver on /review-submissions.'],
];

const EVENTS = [
  ['indicator_report.not_applicable', 'INDICATOR_REPORT', 'not_applicable', 'Indicator marked not applicable', 'The main division marked an indicator not applicable for a quarter.'],
  ['activity_report.draft_deleted', 'ACTIVITY_REPORT', 'draft_deleted', 'Activity report draft deleted', 'A draft activity report was deleted by its author or an administrator.'],
  ['review_queue.pending', 'APPROVAL_STEP', 'pending', 'Reports waiting for review', 'Weekday reminder to each approver of the reports waiting for their decision.'],
];

const SUBSCRIPTIONS = [
  ...OUTCOME_EVENTS.flatMap((e) => [[e, S.FOCAL_OF_MAIN, REVIEWED, 110], [e, S.ENTITY_MAIN_HOD, REVIEWED, 120]]),
  ['indicator_report.not_applicable', S.FOCAL_OF_MAIN, REMOVED, 100],
  ['indicator_report.not_applicable', S.ENTITY_MAIN_HOD, REMOVED, 110],
  ['indicator_report.not_applicable', S.ENTITY_CONTRIB_HODS, REMOVED, 120],
  ['activity_report.draft_deleted', S.ENTITY_OWNER, REMOVED, 100],
  ['activity_report.draft_deleted', S.FOCAL_OF_MAIN, REMOVED, 110],
  ['activity_report.draft_deleted', S.ENTITY_MAIN_HOD, REMOVED, 120],
  ['review_queue.pending', S.ENTITY_OWNER, REMINDER, 100],
];

const SETTINGS = [
  ['reminders.review.enabled', '1', 'Weekday email to each approver listing the reports waiting for their review (1 = on).'],
  ['reminders.review.hour_utc', '6', 'Hour of day (0-23, UTC) the weekday review reminder is sent.'],
];

async function insertIfMissing(knex, table, where, row) {
  if (await knex(table).where(where).first()) return;
  await knex(table).insert(row);
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('notification_subscriptions'))) return;

  for (const [key, subject, description] of TEMPLATES) {
    await insertIfMissing(knex, 'notification_templates', { template_key: key }, {
      template_key: key, channel: 'email', subject, body_key: key, description, is_active: 1,
    });
  }
  for (const [key, entityType, action, label, description] of EVENTS) {
    await insertIfMissing(knex, 'notification_events', { event_key: key }, {
      event_key: key, entity_type: entityType, action, label, description, default_enabled: 1, is_active: 1,
    });
  }

  await knex('notification_subscriptions')
    .whereIn('event_key', OUTCOME_EVENTS)
    .where({ recipient_scope: S.ENTITY_RESPONSIBLE, template_key: REVIEWED })
    .update({ recipient_scope: S.ENTITY_OWNER });

  for (const [eventKey, scope, templateKey, priority] of SUBSCRIPTIONS) {
    await insertIfMissing(knex, 'notification_subscriptions', { event_key: eventKey, recipient_scope: scope, template_key: templateKey }, {
      event_key: eventKey,
      recipient_role: null,
      recipient_scope: scope,
      channel: 'email',
      template_key: templateKey,
      priority,
      is_active: 1,
      throttle_window_sec: 0,
      metadata: '{}',
    });
  }

  if (await knex.schema.hasTable('app_settings')) {
    for (const [key, value, description] of SETTINGS) {
      await insertIfMissing(knex, 'app_settings', { key }, { key, value, description });
    }
  }
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('notification_subscriptions'))) return;
  for (const [eventKey, scope, templateKey] of SUBSCRIPTIONS) {
    await knex('notification_subscriptions')
      .where({ event_key: eventKey, recipient_scope: scope, template_key: templateKey }).del();
  }
  await knex('notification_subscriptions')
    .whereIn('event_key', OUTCOME_EVENTS)
    .where({ recipient_scope: S.ENTITY_OWNER, template_key: REVIEWED })
    .update({ recipient_scope: S.ENTITY_RESPONSIBLE });
  await knex('notification_events').whereIn('event_key', EVENTS.map((e) => e[0])).del();
  await knex('notification_templates').whereIn('template_key', TEMPLATES.map((t) => t[0])).del();
  if (await knex.schema.hasTable('app_settings')) {
    await knex('app_settings').whereIn('key', SETTINGS.map((s) => s[0])).del();
  }
};
