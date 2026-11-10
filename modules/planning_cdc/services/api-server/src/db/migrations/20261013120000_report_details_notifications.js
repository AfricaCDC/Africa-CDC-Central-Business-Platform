/**
 * Report notifications that carry the report itself (D-20261013-07).
 *
 * Wired through the notification tables so they stay admin-managed on
 * /admin/notifications:
 *   · templates report-submitted-details (report fields + attachment links)
 *     and report-preparer-changed (bodies in notification-service/src/templates).
 *   · the existing activity_report.submitted / indicator_report.submitted
 *     subscriptions to the responsible person (entity_main_hod) switch from
 *     report-submitted, whose email rendered with empty fields, to
 *     report-submitted-details.
 *   · event activity_report.preparer_changed, mailed to the new preparer
 *     (entity_owner) and the previous one (entity_previous_owner).
 *
 * Idempotent. down() restores the previous template and removes its rows.
 */

'use strict';

const { RECIPIENT_SCOPES } = require('@rbm/lib/events');

const DETAILS = 'report-submitted-details';
const PREPARER = 'report-preparer-changed';
const PREPARER_EVENT = 'activity_report.preparer_changed';
const SUBMIT_EVENTS = ['activity_report.submitted', 'indicator_report.submitted'];
const PREPARER_SCOPES = [RECIPIENT_SCOPES.ENTITY_OWNER, RECIPIENT_SCOPES.ENTITY_PREVIOUS_OWNER];

async function insertIfMissing(knex, table, where, row) {
  if (await knex(table).where(where).first()) return;
  await knex(table).insert(row);
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('notification_subscriptions'))) return;

  await insertIfMissing(knex, 'notification_templates', { template_key: DETAILS }, {
    template_key: DETAILS,
    channel: 'email',
    subject: '{reportType} submitted: {code} ({quarter} {fiscalYear})',
    body_key: DETAILS,
    description: 'Submitted report with its content (fields, achievement, narration) and attachment links, for the responsible person of the business unit.',
    is_active: 1,
  });
  await insertIfMissing(knex, 'notification_templates', { template_key: PREPARER }, {
    template_key: PREPARER,
    channel: 'email',
    subject: 'Activity report {code} now prepared by {toName}',
    body_key: PREPARER,
    description: 'Who prepared an activity report was changed: previous and new preparer, who changed it, reason.',
    is_active: 1,
  });

  await knex('notification_subscriptions')
    .whereIn('event_key', SUBMIT_EVENTS)
    .where({ recipient_scope: RECIPIENT_SCOPES.ENTITY_MAIN_HOD, template_key: 'report-submitted' })
    .update({ template_key: DETAILS });

  await insertIfMissing(knex, 'notification_events', { event_key: PREPARER_EVENT }, {
    event_key: PREPARER_EVENT,
    entity_type: 'ACTIVITY_REPORT',
    action: 'preparer_changed',
    label: 'Activity report preparer changed',
    description: 'An administrator or M&E officer gave an activity report to another preparer.',
    default_enabled: 1,
    is_active: 1,
  });
  for (const scope of PREPARER_SCOPES) {
    await insertIfMissing(knex, 'notification_subscriptions', { event_key: PREPARER_EVENT, recipient_scope: scope }, {
      event_key: PREPARER_EVENT,
      recipient_role: null,
      recipient_scope: scope,
      channel: 'email',
      template_key: PREPARER,
      priority: 100,
      is_active: 1,
      throttle_window_sec: 0,
      metadata: '{}',
    });
  }
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('notification_subscriptions'))) return;
  await knex('notification_subscriptions').where('event_key', PREPARER_EVENT).del();
  await knex('notification_events').where('event_key', PREPARER_EVENT).del();
  await knex('notification_subscriptions')
    .whereIn('event_key', SUBMIT_EVENTS)
    .where('template_key', DETAILS)
    .update({ template_key: 'report-submitted' });
  await knex('notification_templates').whereIn('template_key', [DETAILS, PREPARER]).del();
};
