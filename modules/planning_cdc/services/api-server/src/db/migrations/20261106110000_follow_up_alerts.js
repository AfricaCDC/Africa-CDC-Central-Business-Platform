/**
 * Automation roadmap, lot 2 (D-20261105-11): follow-up without chasing.
 *   · event plan_node.high_risk_soon: a High-risk specific activity starts
 *     soon → its focal person (entity_owner) and the Responsible Person of
 *     its unit (entity_division_hod);
 *   · event data_health.weekly: the data to complete → every active M&E
 *     officer and RBM administrator;
 *   · RBAC module data_health (read, scope all): RBM_ADMIN, ME_OFFICER and
 *     SYSTEM_ADMIN; editable on /admin/rbac;
 *   · app_settings of both jobs.
 * Both events use the template automation-notice. Idempotent; `down`
 * removes what it added.
 */
'use strict';

const { RECIPIENT_SCOPES: S } = require('@rbm/lib/events');
const { ROLES } = require('@rbm/lib/roles');

const TEMPLATE = 'automation-notice';
const EVENTS = [
  {
    event_key: 'plan_node.high_risk_soon', entity_type: 'PLAN_NODE', action: 'high_risk_soon',
    label: 'High-risk activity starts soon',
    description: 'A specific activity marked High risk starts within alerts.high_risk.days_before days.',
    recipients: [[S.ENTITY_OWNER, null, 100], [S.ENTITY_DIVISION_HOD, null, 110]],
  },
  {
    event_key: 'data_health.weekly', entity_type: 'DATA_HEALTH', action: 'weekly',
    label: 'Data health: weekly list',
    description: 'Weekly: the data to complete (units without people, activities without budget code or indicator, …).',
    recipients: [[S.ROLE_ALL_ACTIVE, ROLES.ME_OFFICER, 100], [S.ROLE_ALL_ACTIVE, ROLES.RBM_ADMIN, 110]],
  },
];
const SETTINGS = [
  ['alerts.high_risk.enabled', '1', 'Email the focal person and the Responsible Person before a High-risk activity starts (1 = on).'],
  ['alerts.high_risk.days_before', '14', 'Days before the start date of a High-risk activity the alert is sent.'],
  ['alerts.high_risk.hour_utc', '6', 'Hour of day (0-23, UTC) the High-risk activity check runs.'],
  ['reports.data_health.enabled', '1', 'Weekly data health email to the M&E officers and RBM administrators (1 = on).'],
  ['reports.data_health.weekday', '1', 'Day of the week (0 = Sunday … 6 = Saturday, UTC) the data health email is sent.'],
  ['reports.data_health.hour_utc', '7', 'Hour of day (0-23, UTC) the data health email is sent.'],
];
const MODULE = { code: 'data_health', name: 'Data Health', category: 'admin', sort_order: 73 };
const READERS = [ROLES.RBM_ADMIN, ROLES.ME_OFFICER, ROLES.SYSTEM_ADMIN];

async function insertIfMissing(knex, table, where, row) {
  if (await knex(table).where(where).first()) return;
  await knex(table).insert(row);
}

async function seedEvents(knex) {
  for (const { recipients, ...event } of EVENTS) {
    await insertIfMissing(knex, 'notification_events', { event_key: event.event_key }, { ...event, default_enabled: 1, is_active: 1 });
    for (const [scope, role, priority] of recipients) {
      const where = { event_key: event.event_key, recipient_scope: scope, recipient_role: role, template_key: TEMPLATE };
      await insertIfMissing(knex, 'notification_subscriptions', where, {
        ...where, channel: 'email', priority, is_active: 1, throttle_window_sec: 0, metadata: '{}',
      });
    }
  }
}

async function seedRbac(knex) {
  let mod = await knex('rbac_modules').where('code', MODULE.code).first();
  if (!mod) {
    const [id] = await knex('rbac_modules').insert(MODULE);
    mod = { id };
  }
  const action = await knex('rbac_actions').where('code', 'read').first();
  if (!action) return;
  const roles = await knex('roles').whereIn('code', READERS).select('id');
  for (const role of roles) {
    const where = { role_id: role.id, module_id: mod.id, action_id: action.id };
    await insertIfMissing(knex, 'rbac_permissions', where, { ...where, scope: 'all' });
  }
}

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('notification_subscriptions')) await seedEvents(knex);
  if (await knex.schema.hasTable('rbac_modules')) await seedRbac(knex);
  if (await knex.schema.hasTable('app_settings')) {
    for (const [key, value, description] of SETTINGS) {
      await insertIfMissing(knex, 'app_settings', { key }, { key, value, description });
    }
  }
};

exports.down = async function down(knex) {
  const keys = EVENTS.map((e) => e.event_key);
  if (await knex.schema.hasTable('notification_subscriptions')) {
    await knex('notification_subscriptions').whereIn('event_key', keys).del();
    await knex('notification_events').whereIn('event_key', keys).del();
  }
  if (await knex.schema.hasTable('rbac_modules')) {
    const mod = await knex('rbac_modules').where('code', MODULE.code).first();
    if (mod) {
      await knex('rbac_permissions').where('module_id', mod.id).del();
      await knex('rbac_modules').where('id', mod.id).del();
    }
  }
  if (await knex.schema.hasTable('app_settings')) await knex('app_settings').whereIn('key', SETTINGS.map((x) => x[0])).del();
};
