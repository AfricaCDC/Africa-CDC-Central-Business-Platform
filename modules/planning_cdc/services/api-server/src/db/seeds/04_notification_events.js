/**
 * Notification Wizard — events + templates + default subscriptions seed.
 *
 * Idempotent: every upsert checks existence by PK. Safe to re-run after
 * the migration 20260417000000_notification_wizard.js.
 *
 * Order:
 *   1. notification_events    (~95 rows, static catalog per spec §4)
 *   2. notification_templates (~30 rows keyed by body_key → JS module)
 *   3. notification_subscriptions (default rules reproducing today's
 *      hardcoded notify behaviour — spec §10 migration map)
 *
 * Event keys follow `<entity_type>.<action>` lowercase snake_case.
 * Action verbs align with EVENT_ACTIONS in packages/lib/events.js.
 *
 * Spec: docs/specs/notification-wizard.md §4-§5
 * Decision: D-20260417-01
 */

/* eslint-disable max-lines */

/**
 * Canonical event catalog. Columns: event_key, entity_type, action, label,
 * default_enabled (boolean — controls whether a default subscription is
 * active at insert).
 */
const EVENTS = [
  // ─── 4.2.1 Auth / account ─────────────────────────────────────
  ['user.created',                     'USER',             'created',               'User account created', false],
  ['user.updated',                     'USER',             'updated',               'User account updated', false],
  ['user.deleted',                     'USER',             'deleted',               'User account deleted', false],
  ['user.role_assigned',               'USER',             'role_assigned',         'Role assigned to user', false],
  ['user.role_unassigned',             'USER',             'role_unassigned',       'Role removed from user', false],
  ['user.sso_denied',                  'USER',             'sso_denied',            'SSO access denied', false],
  ['user.deadline_approaching',        'USER',             'deadline_approaching',  'User account expiry approaching', false],

  // ─── 4.2.2 Organisation ───────────────────────────────────────
  ['division.created',                 'DIVISION',         'created',               'Division created', false],
  ['division.updated',                 'DIVISION',         'updated',               'Division updated', false],
  ['division.deleted',                 'DIVISION',         'deleted',               'Division deleted', false],
  ['division.hod_changed',             'DIVISION',         'hod_changed',           'Division HoD changed', false],
  ['division.me_officer_changed',      'DIVISION',         'me_officer_changed',    'Division M&E officer changed', false],
  ['division.focal_changed',           'DIVISION',         'focal_changed',         'Division focal person changed', false],
  ['team.created',                     'TEAM',             'created',               'Team created', false],

  // ─── 4.2.3 RBAC ───────────────────────────────────────────────
  ['rbac_permission.updated',          'RBAC_PERMISSION',  'updated',               'RBAC permission updated', false],
  ['rbac_permission.deleted',          'RBAC_PERMISSION',  'deleted',               'RBAC permission deleted', false],

  // ─── 4.2.4 Strategic plan / program / project / result ────────
  ['strategic_plan.created',           'STRATEGIC_PLAN',   'created',               'Strategic plan created', false],
  ['strategic_plan.updated',           'STRATEGIC_PLAN',   'updated',               'Strategic plan updated', false],
  ['strategic_plan.deleted',           'STRATEGIC_PLAN',   'deleted',               'Strategic plan deleted', false],
  ['program.created',                  'PROGRAM',          'created',               'Program created', false],
  ['program.updated',                  'PROGRAM',          'updated',               'Program updated', false],
  ['program.deleted',                  'PROGRAM',          'deleted',               'Program deleted', false],
  ['project.created',                  'PROJECT',          'created',               'Project created', false],
  ['project.updated',                  'PROJECT',          'updated',               'Project updated', false],
  ['project.deleted',                  'PROJECT',          'deleted',               'Project deleted', false],
  ['result.created',                   'RESULT',           'created',               'Result created', false],
  ['result.updated',                   'RESULT',           'updated',               'Result updated', false],
  ['result.deleted',                   'RESULT',           'deleted',               'Result deleted', false],

  // ─── 4.2.5 Workplan / items / milestones ──────────────────────
  ['workplan.created',                 'WORKPLAN',         'created',               'Workplan created', false],
  ['workplan.updated',                 'WORKPLAN',         'updated',               'Workplan updated', false],
  ['workplan.archived',                'WORKPLAN',         'archived',              'Workplan archived', false],
  ['workplan_item.created',            'WORKPLAN_ITEM',    'created',               'Workplan item created', false],
  ['workplan_item.updated',            'WORKPLAN_ITEM',    'updated',               'Workplan item updated', false],
  ['workplan_item.deleted',            'WORKPLAN_ITEM',    'deleted',               'Workplan item deleted', false],
  ['workplan_item.restored',           'WORKPLAN_ITEM',    'restored',              'Workplan item restored', false],
  ['workplan_item.status_changed',     'WORKPLAN_ITEM',    'status_changed',        'Workplan item status changed', false],
  ['workplan_item.deadline_approaching', 'WORKPLAN_ITEM',  'deadline_approaching',  'Workplan item deadline approaching', false],
  ['workplan_item.overdue',            'WORKPLAN_ITEM',    'overdue',               'Workplan item overdue', false],
  ['milestone.created',                'MILESTONE',        'created',               'Milestone created', false],

  // ─── 4.2.6 Plan-node (unified tree) ───────────────────────────
  ['plan_node.created',                'PLAN_NODE',        'created',               'Plan node created', false],
  ['plan_node.edited',                 'PLAN_NODE',        'edited',                'Plan node edited', true],
  ['plan_node.submitted',              'PLAN_NODE',        'submitted',             'Plan node submitted for approval', true],
  ['plan_node.approved',               'PLAN_NODE',        'approved',              'Plan node approved', true],
  ['plan_node.rejected',               'PLAN_NODE',        'rejected',              'Plan node rejected', true],
  ['plan_node.cancelled',              'PLAN_NODE',        'cancelled',             'Plan node cancelled', false],
  ['plan_node.deleted',                'PLAN_NODE',        'deleted',               'Plan node deleted', false],
  ['plan_node.assigned',               'PLAN_NODE',        'assigned',              'Plan node owner assigned', false],
  ['plan_node.unassigned',             'PLAN_NODE',        'unassigned',            'Plan node owner unassigned', false],
  ['plan_node.status_changed',         'PLAN_NODE',        'status_changed',        'Plan node status changed', false],
  ['plan_node.ownership_patched',      'PLAN_NODE',        'ownership_patched',     'Plan node ownership patched', false],

  // ─── 4.2.7 Indicator ──────────────────────────────────────────
  ['indicator.created',                'INDICATOR',        'created',               'Indicator created', false],
  ['indicator.updated',                'INDICATOR',        'updated',               'Indicator updated', false],
  ['indicator.deleted',                'INDICATOR',        'deleted',               'Indicator deleted', false],

  // ─── 4.2.8 AMERT hierarchy ────────────────────────────────────
  ['amert_project.created',            'AMERT_PROJECT',    'created',               'AMERT project created', false],
  ['amert_project.updated',            'AMERT_PROJECT',    'updated',               'AMERT project updated', false],
  ['amert_project.deleted',            'AMERT_PROJECT',    'deleted',               'AMERT project deleted', false],
  ['amert_outcome_indicator.created',  'AMERT_OUTCOME_INDICATOR', 'created',        'AMERT outcome indicator created', false],
  ['amert_outcome_indicator.updated',  'AMERT_OUTCOME_INDICATOR', 'updated',        'AMERT outcome indicator updated', false],
  ['amert_outcome_indicator.deleted',  'AMERT_OUTCOME_INDICATOR', 'deleted',        'AMERT outcome indicator deleted', false],
  ['amert_output_indicator.created',   'AMERT_OUTPUT_INDICATOR', 'created',         'AMERT output indicator created', false],
  ['amert_output_indicator.updated',   'AMERT_OUTPUT_INDICATOR', 'updated',         'AMERT output indicator updated', false],
  ['amert_output_indicator.deleted',   'AMERT_OUTPUT_INDICATOR', 'deleted',         'AMERT output indicator deleted', false],
  ['amert_output_risk.created',        'AMERT_OUTPUT_RISK', 'created',              'AMERT output risk created', false],
  ['amert_activity.created',           'AMERT_ACTIVITY',   'created',               'AMERT activity created', false],

  // ─── 4.2.9 Monitoring ─────────────────────────────────────────
  ['achievement.created',              'ACHIEVEMENT',      'created',               'Achievement recorded', false],
  ['achievement.updated',              'ACHIEVEMENT',      'updated',               'Achievement updated', false],
  ['dqa.created',                      'DQA',              'created',               'DQA opened', false],
  ['dqa_finding.created',              'DQA_FINDING',      'created',               'DQA finding recorded', false],
  ['evaluation.created',               'EVALUATION',       'created',               'Evaluation created', false],
  ['lesson.created',                   'LESSON',           'created',               'Lesson recorded', false],
  ['adjustment.created',               'ADJUSTMENT',       'created',               'Adjustment recorded', false],

  // ─── 4.2.10 Reporting period / actuals / reports ──────────────
  ['reporting_period.opened',          'REPORTING_PERIOD', 'opened',                'Reporting period opened', false],
  ['reporting_period.updated',         'REPORTING_PERIOD', 'updated',               'Reporting period updated', false],
  ['reporting_period.deadline_approaching', 'REPORTING_PERIOD', 'deadline_approaching', 'Reporting period deadline approaching', false],
  ['indicator_actual.upserted',        'INDICATOR_ACTUAL', 'upserted',              'Indicator actual saved', false],
  ['indicator_actual.submitted',       'INDICATOR_ACTUAL', 'submitted',             'Indicator actual submitted', true],
  ['indicator_actual.validated',       'INDICATOR_ACTUAL', 'validated',             'Indicator actual validated', true],
  ['indicator_actual.rejected',        'INDICATOR_ACTUAL', 'rejected',              'Indicator actual rejected', true],
  ['division_report.upserted',         'DIVISION_REPORT',  'upserted',              'Division report saved', false],
  ['division_report.submitted',        'DIVISION_REPORT',  'submitted',             'Division report submitted', true],
  ['division_report.approved',         'DIVISION_REPORT',  'approved',              'Division report approved', true],
  ['division_report.rejected',         'DIVISION_REPORT',  'rejected',              'Division report rejected', true],
  ['activity_report.upserted',         'ACTIVITY_REPORT',  'upserted',              'Activity report saved', false],
  ['activity_report.submitted',        'ACTIVITY_REPORT',  'submitted',             'Activity report submitted', true],
  ['activity_report.preparer_changed', 'ACTIVITY_REPORT',  'preparer_changed',      'Activity report preparer changed', true],
  ['activity_report.draft_deleted',    'ACTIVITY_REPORT',  'draft_deleted',         'Activity report draft deleted', true],
  ['activity_report.approved',         'ACTIVITY_REPORT',  'approved',              'Activity report approved', true],
  ['activity_report.rejected',         'ACTIVITY_REPORT',  'rejected',              'Activity report rejected', true],
  ['activity_report.ownership_disputed', 'ACTIVITY_REPORT', 'ownership_disputed',   'Activity report ownership disputed', true],
  ['activity_report.deadline_approaching', 'ACTIVITY_REPORT', 'deadline_approaching', 'Activity report deadline approaching', false],
  ['activity_report.overdue',          'ACTIVITY_REPORT',  'overdue',               'Activity report overdue', false],
  ['indicator_report.upserted',        'INDICATOR_REPORT', 'upserted',              'Indicator report saved', false],
  ['indicator_report.submitted',       'INDICATOR_REPORT', 'submitted',             'Indicator report submitted', true],
  ['indicator_report.validated',       'INDICATOR_REPORT', 'validated',             'Indicator report validated', true],
  ['indicator_report.rejected',        'INDICATOR_REPORT', 'rejected',              'Indicator report rejected', true],
  ['indicator_report.not_applicable',  'INDICATOR_REPORT', 'not_applicable',        'Indicator marked not applicable by its main division', true],
  ['review_queue.pending',             'APPROVAL_STEP',    'pending',               'Reports waiting for review (weekday reminder)', true],
  ['big_ticket_report.submitted',      'BIG_TICKET_REPORT', 'submitted',            'Big Ticket report submitted', true],
  ['big_ticket_report.approved',       'BIG_TICKET_REPORT', 'approved',             'Big Ticket report approved', true],
  ['big_ticket_report.rejected',       'BIG_TICKET_REPORT', 'rejected',             'Big Ticket report returned', true],
  ['evidence.uploaded',                'EVIDENCE',         'uploaded',              'Evidence uploaded', false],
  ['evidence.deleted',                 'EVIDENCE',         'deleted',               'Evidence deleted', false],
  ['mov.uploaded_via_power_automate',  'MOV',              'uploaded_via_power_automate', 'Means of verification uploaded via Power Automate', false],

  // ─── 4.2.11 Governance ────────────────────────────────────────
  ['approval_instance.created',        'APPROVAL_INSTANCE', 'created',              'Approval instance created', false],
  ['approval_instance.cancelled',      'APPROVAL_INSTANCE', 'cancelled',            'Approval instance cancelled', false],
  ['approval_step.created',            'APPROVAL_STEP',    'created',               'Approval step created', true],
  ['approval_step.decided',            'APPROVAL_STEP',    'decided',               'Approval step decided', true],
  ['approval_step.blocked_no_approver', 'APPROVAL_STEP',   'blocked_no_approver',   'Approval step blocked — no approver', true],
  ['comment.added',                    'COMMENT',          'added',                 'Comment added', false],

  // ─── 4.2.12 Contributor approval chain ────────────────────────
  ['activity_report.contrib_submitted',       'ACTIVITY_REPORT', 'contrib_submitted',       'Contributor activity report submitted', true],
  ['activity_report.contrib_step1_decided',   'ACTIVITY_REPORT', 'contrib_step1_decided',   'Contributor chain step 1 decided', true],
  ['activity_report.contrib_step2_decided',   'ACTIVITY_REPORT', 'contrib_step2_decided',   'Contributor chain step 2 decided', true],
  ['activity_report.contrib_step3_decided',   'ACTIVITY_REPORT', 'contrib_step3_decided',   'Contributor chain step 3 decided', true],
  ['activity_report.contrib_admin_bypass',    'ACTIVITY_REPORT', 'contrib_admin_bypass',    'Contributor chain admin bypass', true],
  ['activity_report.contrib_blocked_no_approver', 'ACTIVITY_REPORT', 'contrib_blocked_no_approver', 'Contributor chain blocked — no approver', true],

  // ─── 4.2.13 Workflow engine ───────────────────────────────────
  ['workflow.started',                 'WORKFLOW',         'started',               'Workflow started', false],
  ['workflow.cancelled',               'WORKFLOW',         'cancelled',             'Workflow cancelled', false],
  ['workflow.step_decided',            'WORKFLOW',         'step_decided',          'Workflow step decided', false],

  // ─── 4.2.14 Budget ────────────────────────────────────────────
  ['budget_line.created',              'BUDGET_LINE',      'created',               'Budget line created', false],
  ['budget_line.updated',              'BUDGET_LINE',      'updated',               'Budget line updated', false],
  ['budget_line.deleted',              'BUDGET_LINE',      'deleted',               'Budget line deleted', false],
  ['budget_line.approved',             'BUDGET_LINE',      'approved',              'Budget line approved', true],
  ['budget_code.created',              'BUDGET_CODE',      'created',               'Budget code created', false],
  ['budget_code.updated',              'BUDGET_CODE',      'updated',               'Budget code updated', false],
  ['budget_code.deleted',              'BUDGET_CODE',      'deleted',               'Budget code deleted', false],

  // ─── 4.2.15 Activity tracking ─────────────────────────────────
  ['activity_log.created',             'ACTIVITY_LOG',     'created',               'Activity log created', false],
  ['activity_log.deleted',             'ACTIVITY_LOG',     'deleted',               'Activity log deleted', false],
  ['activity_checkin.upserted',        'ACTIVITY_CHECKIN', 'upserted',              'Activity check-in saved', false],
  ['activity_checkin.overdue',         'ACTIVITY_CHECKIN', 'overdue',               'Activity check-in overdue', false],

  // ─── 4.2.16 Sync ──────────────────────────────────────────────
  ['sync_job.started',                 'SYNC_JOB',         'started',               'Sync job started', false],
  ['sync_job.succeeded',               'SYNC_JOB',         'succeeded',             'Sync job succeeded', false],
  ['sync_job.failed',                  'SYNC_JOB',         'failed',                'Sync job failed', false],

  // ─── 4.2.17 Self-observing ────────────────────────────────────
  ['notification_subscription.created', 'NOTIFICATION_SUBSCRIPTION', 'created',     'Notification subscription created', false],
  ['notification_subscription.updated', 'NOTIFICATION_SUBSCRIPTION', 'updated',     'Notification subscription updated', false],
  ['notification_subscription.deleted', 'NOTIFICATION_SUBSCRIPTION', 'deleted',     'Notification subscription deleted', false],
  ['notification.test_sent',           'NOTIFICATION',     'test_sent',             'Test notification sent', false],
];

/**
 * Template catalog. Columns: template_key, channel, subject, body_key,
 * description. `body_key` resolves to
 *   services/notification-service/src/templates/<body_key>.js
 * at dispatch time.
 */
const TEMPLATES = [
  // Existing templates (already shipped — migrated into the registry)
  ['activity-updated',           'email', 'Activity updated: {{entity_title}}',           'activity-updated',    'Fires when plan_node edited'],
  ['report-submitted',           'email', 'Report submitted: {{entity_title}}',           'report-submitted',    'Fires on activity_report.submitted'],
  ['report-reviewed',            'email', 'Report {{decision}}: {{entity_title}}',        'report-reviewed',     'Fires on report approved/rejected'],
  // Report content + attachment links, and preparer change (D-20261013-07)
  ['report-submitted-details',   'email', '{reportType} submitted: {code} ({quarter} {fiscalYear})', 'report-submitted-details', 'Submitted report with its content and attachment links'],
  ['report-preparer-changed',    'email', 'Activity report {code} now prepared by {toName}', 'report-preparer-changed', 'Fires on activity_report.preparer_changed'],
  ['review-pending-reminder',    'email', '{count} reports waiting for your review', 'review-pending-reminder', 'Weekday list of the reports waiting for the approver'],
  ['report-removed',             'email', '{heading}: {code} ({quarter} {fiscalYear})', 'report-removed', 'Indicator marked not applicable, or activity report draft deleted'],
  // Contributor-chain templates (shipped by feature-contributor-approval-chain; migrated here)
  ['report-contrib-submitted',   'email', 'Contributor report submitted: {{entity_title}}', 'report-contrib-submitted', 'Fires on activity_report.contrib_submitted'],
  ['report-contrib-step1-decided', 'email', 'Step 1 {{decision}}: {{entity_title}}',       'report-contrib-step1-decided', 'Step 1 decided'],
  ['report-contrib-step2-decided', 'email', 'Step 2 {{decision}}: {{entity_title}}',       'report-contrib-step2-decided', 'Step 2 decided'],
  ['report-contrib-step3-decided', 'email', 'Step 3 {{decision}}: {{entity_title}}',       'report-contrib-step3-decided', 'Step 3 decided'],
  ['report-contrib-admin-bypass', 'email', 'Admin bypass: {{entity_title}}',               'report-contrib-admin-bypass',  'Admin-bypass at any step'],
  ['report-contrib-blocked',     'email', 'Approval blocked — no approver: {{entity_title}}', 'report-contrib-blocked', 'Fan-out on blocked_no_approver'],
  // Governance / workflow
  ['approval-step-created',      'email', 'Approval needed: {{entity_title}}',            'approval-step-created', 'Fires on approval_step.created'],
  ['approval-step-decided',      'email', 'Approval {{decision}}: {{entity_title}}',      'approval-step-decided', 'Fires on approval_step.decided'],
];

/**
 * Default subscriptions — reproduce today's hardcoded notifyService
 * call-sites. Columns: event_key, recipient_role, recipient_scope,
 * channel, template_key, priority, is_active.
 *
 * Scope resolver names from spec §7.
 */
const DEFAULT_SUBSCRIPTIONS = [
  // plan_node edits → owner + main HoD
  ['plan_node.edited',              null, 'entity_responsible', 'email', 'activity-updated', 100, true],
  ['plan_node.edited',              null, 'entity_main_hod',    'email', 'activity-updated', 110, true],

  // plan_node submissions → main HoD (approver)
  ['plan_node.submitted',           null, 'entity_main_hod',    'email', 'approval-step-created', 100, true],

  // plan_node approvals/rejections → owner
  ['plan_node.approved',            null, 'entity_responsible', 'email', 'approval-step-decided', 100, true],
  ['plan_node.rejected',            null, 'entity_responsible', 'email', 'approval-step-decided', 100, true],

  // Activity report lifecycle → owner + main HoD
  ['activity_report.submitted',     null, 'entity_main_hod',    'email', 'report-submitted-details', 100, true],
  ['activity_report.preparer_changed', null, 'entity_owner',          'email', 'report-preparer-changed', 100, true],
  ['activity_report.preparer_changed', null, 'entity_previous_owner', 'email', 'report-preparer-changed', 110, true],
  // Outcome → author, BU focal person, BU head (D-20261015-01)
  ['activity_report.approved',      null, 'entity_owner',       'email', 'report-reviewed',  100, true],
  ['activity_report.approved',      null, 'focal_of_main',      'email', 'report-reviewed',  110, true],
  ['activity_report.approved',      null, 'entity_main_hod',    'email', 'report-reviewed',  120, true],
  ['activity_report.rejected',      null, 'entity_owner',       'email', 'report-reviewed',  100, true],
  ['activity_report.rejected',      null, 'focal_of_main',      'email', 'report-reviewed',  110, true],
  ['activity_report.rejected',      null, 'entity_main_hod',    'email', 'report-reviewed',  120, true],
  ['activity_report.draft_deleted', null, 'entity_owner',       'email', 'report-removed',   100, true],
  ['activity_report.draft_deleted', null, 'focal_of_main',      'email', 'report-removed',   110, true],
  ['activity_report.draft_deleted', null, 'entity_main_hod',    'email', 'report-removed',   120, true],
  ['activity_report.ownership_disputed', null, 'entity_main_hod', 'email', 'report-reviewed', 110, true],

  // Indicator actual lifecycle
  ['indicator_actual.submitted',    null, 'entity_main_hod',    'email', 'report-submitted', 100, true],
  ['indicator_actual.validated',    null, 'entity_responsible', 'email', 'report-reviewed',  100, true],
  ['indicator_actual.rejected',     null, 'entity_responsible', 'email', 'report-reviewed',  100, true],

  // Division report lifecycle (the quarterly division report). On submit,
  // notify HoD + the division's own M&E officer + all directors (H-6).
  ['division_report.submitted',     null,       'entity_main_hod',            'email', 'report-submitted', 100, true],
  ['division_report.submitted',     null,       'entity_division_me_officer', 'email', 'report-submitted', 110, true],
  ['division_report.submitted',     'DIRECTOR', 'role_all_active',            'email', 'report-submitted', 120, true],
  ['division_report.approved',      null, 'entity_responsible', 'email', 'report-reviewed',  100, true],
  ['division_report.rejected',      null, 'entity_responsible', 'email', 'report-reviewed',  100, true],

  // Indicator report lifecycle
  ['indicator_report.submitted',    null, 'entity_main_hod',    'email', 'report-submitted-details', 100, true],
  ['indicator_report.validated',      null, 'entity_owner',       'email', 'report-reviewed',  100, true],
  ['indicator_report.validated',      null, 'focal_of_main',      'email', 'report-reviewed',  110, true],
  ['indicator_report.validated',      null, 'entity_main_hod',    'email', 'report-reviewed',  120, true],
  ['indicator_report.rejected',      null, 'entity_owner',       'email', 'report-reviewed',  100, true],
  ['indicator_report.rejected',      null, 'focal_of_main',      'email', 'report-reviewed',  110, true],
  ['indicator_report.rejected',      null, 'entity_main_hod',    'email', 'report-reviewed',  120, true],
  ['indicator_report.not_applicable', null, 'focal_of_main',     'email', 'report-removed',   100, true],
  ['indicator_report.not_applicable', null, 'entity_main_hod',   'email', 'report-removed',   110, true],
  ['indicator_report.not_applicable', null, 'entity_contrib_hods', 'email', 'report-removed', 120, true],

  // Weekday reminder to each approver of what waits for them (D-20261015-01)
  ['review_queue.pending',          null, 'entity_owner',       'email', 'review-pending-reminder', 100, true],
  ['big_ticket_report.submitted',   'ME_OFFICER', 'role_all_active', 'email', 'report-submitted-details', 100, true],
  ['big_ticket_report.approved',    null, 'entity_owner',       'email', 'report-reviewed', 100, true],
  ['big_ticket_report.approved',    null, 'focal_of_main',      'email', 'report-reviewed', 110, true],
  ['big_ticket_report.approved',    null, 'entity_main_hod',    'email', 'report-reviewed', 120, true],
  ['big_ticket_report.rejected',    null, 'entity_owner',       'email', 'report-reviewed', 100, true],
  ['big_ticket_report.rejected',    null, 'focal_of_main',      'email', 'report-reviewed', 110, true],
  ['big_ticket_report.rejected',    null, 'entity_main_hod',    'email', 'report-reviewed', 120, true],


  // Contributor chain (aligned with spec §4.2.12)
  ['activity_report.contrib_submitted',       null, 'entity_main_hod',       'email', 'report-contrib-submitted',   100, true],
  ['activity_report.contrib_step1_decided',   null, 'entity_responsible',    'email', 'report-contrib-step1-decided', 100, true],
  ['activity_report.contrib_step2_decided',   null, 'entity_responsible',    'email', 'report-contrib-step2-decided', 100, true],
  ['activity_report.contrib_step3_decided',   null, 'entity_responsible',    'email', 'report-contrib-step3-decided', 100, true],
  ['activity_report.contrib_admin_bypass',    null, 'entity_responsible',    'email', 'report-contrib-admin-bypass', 100, true],
  ['activity_report.contrib_blocked_no_approver', 'RBM_ADMIN', 'role_all',   'email', 'report-contrib-blocked',     100, true],

  // Generic approval step
  ['approval_step.created',         null, 'entity_main_hod',    'email', 'approval-step-created', 100, true],
  ['approval_step.decided',         null, 'entity_responsible', 'email', 'approval-step-decided', 100, true],
  ['approval_step.blocked_no_approver', 'RBM_ADMIN', 'role_all', 'email', 'report-contrib-blocked', 100, true],

  // Budget approval → actor
  ['budget_line.approved',          null, 'actor',              'email', 'approval-step-decided', 100, true],
];

exports.seed = async function seed(knex) {
  // ── 1. notification_events ────────────────────────────────────
  for (const [key, entityType, action, label, defaultEnabled] of EVENTS) {
    const existing = await knex('notification_events').where('event_key', key).first();
    if (existing) continue;
    await knex('notification_events').insert({
      event_key: key,
      entity_type: entityType,
      action,
      label,
      default_enabled: defaultEnabled,
      is_active: true,
    });
  }

  // ── 2. notification_templates ─────────────────────────────────
  for (const [key, channel, subject, bodyKey, description] of TEMPLATES) {
    const existing = await knex('notification_templates').where('template_key', key).first();
    if (existing) continue;
    await knex('notification_templates').insert({
      template_key: key,
      channel,
      subject,
      body_key: bodyKey,
      description,
      is_active: true,
    });
  }

  // ── 3. Default subscriptions ──────────────────────────────────
  for (const [eventKey, role, scope, channel, templateKey, priority, isActive] of DEFAULT_SUBSCRIPTIONS) {
    // Dedupe on (event_key, recipient_role, recipient_scope, template_key)
    // so a re-seed does not create parallel rules.
    const existing = await knex('notification_subscriptions')
      .where({
        event_key: eventKey,
        recipient_role: role,
        recipient_scope: scope,
        template_key: templateKey,
      })
      .first();
    if (existing) continue;
    await knex('notification_subscriptions').insert({
      event_key: eventKey,
      recipient_role: role,
      recipient_scope: scope,
      channel,
      template_key: templateKey,
      priority,
      is_active: isActive,
      metadata: JSON.stringify({}),
    });
  }
};
