/**
 * Big Ticket quarterly reporting (D-20261015-05): who may report, and the
 * notifications.
 *
 * RBAC (`big_ticket:submit`, editable on /admin/rbac afterwards):
 *   · ME_OFFICER at scope `all`: M&E reports on behalf of any business unit;
 *   · HEAD_OF_DIVISION at scope `division`: the head of the lead business
 *     unit reports, like its focal person (scope `own`).
 * Only added when the role has no `submit` grant on the module yet.
 *
 * Wired through the notification tables so they stay admin-managed on
 * /admin/notifications:
 *   · big_ticket_report.submitted → every active M&E officer (PR&A
 *     validates), template report-submitted-details;
 *   · big_ticket_report.approved / .rejected → the author (`entity_owner`),
 *     the focal person (`focal_of_main`) and the head (`entity_main_hod`) of
 *     the lead business unit, template report-reviewed.
 *
 * Templates already exist. Idempotent. down() removes the rows it added.
 */

'use strict';

const { RECIPIENT_SCOPES: S } = require('@rbm/lib/events');
const { ROLES } = require('@rbm/lib/roles');
const { RBAC_MODULES, RBAC_ACTIONS, RBAC_SCOPES } = require('@rbm/lib/rbac');

const ENTITY = 'BIG_TICKET_REPORT';
const EVENTS = [
  ['big_ticket_report.submitted', 'submitted', 'Big Ticket report submitted', 'The lead business unit submitted its quarterly Big Ticket report.'],
  ['big_ticket_report.approved', 'approved', 'Big Ticket report approved', 'M&E approved a quarterly Big Ticket report.'],
  ['big_ticket_report.rejected', 'rejected', 'Big Ticket report returned', 'M&E returned a quarterly Big Ticket report to the business unit.'],
];

const SUBSCRIPTIONS = [
  ['big_ticket_report.submitted', ROLES.ME_OFFICER, S.ROLE_ALL_ACTIVE, 'report-submitted-details', 100],
  ...['big_ticket_report.approved', 'big_ticket_report.rejected'].flatMap((e) => [
    [e, null, S.ENTITY_OWNER, 'report-reviewed', 100],
    [e, null, S.FOCAL_OF_MAIN, 'report-reviewed', 110],
    [e, null, S.ENTITY_MAIN_HOD, 'report-reviewed', 120],
  ]),
];

const SUBMIT_GRANTS = [[ROLES.ME_OFFICER, RBAC_SCOPES.ALL], [ROLES.HEAD_OF_DIVISION, RBAC_SCOPES.DIVISION]];

async function grantIds(knex) {
  const mod = await knex('rbac_modules').where('code', RBAC_MODULES.BIG_TICKET).first('id');
  const action = await knex('rbac_actions').where('code', RBAC_ACTIONS.SUBMIT).first('id');
  if (!mod || !action) return [];
  const out = [];
  for (const [code, scope] of SUBMIT_GRANTS) {
    const role = await knex('roles').where('code', code).first('id');
    if (role) out.push({ where: { role_id: role.id, module_id: mod.id, action_id: action.id }, scope });
  }
  return out;
}

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('rbac_permissions')) {
    for (const g of await grantIds(knex)) {
      if (!(await knex('rbac_permissions').where(g.where).first())) await knex('rbac_permissions').insert({ ...g.where, scope: g.scope });
    }
  }
  if (!(await knex.schema.hasTable('notification_subscriptions'))) return;
  for (const [key, action, label, description] of EVENTS) {
    if (await knex('notification_events').where('event_key', key).first()) continue;
    await knex('notification_events').insert({
      event_key: key, entity_type: ENTITY, action, label, description, default_enabled: 1, is_active: 1,
    });
  }
  for (const [eventKey, role, scope, templateKey, priority] of SUBSCRIPTIONS) {
    const where = { event_key: eventKey, recipient_scope: scope, template_key: templateKey };
    if (await knex('notification_subscriptions').where(where).first()) continue;
    await knex('notification_subscriptions').insert({
      ...where, recipient_role: role, channel: 'email', priority, is_active: 1, throttle_window_sec: 0, metadata: '{}',
    });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('rbac_permissions')) {
    for (const g of await grantIds(knex)) await knex('rbac_permissions').where({ ...g.where, scope: g.scope }).del();
  }
  if (!(await knex.schema.hasTable('notification_subscriptions'))) return;
  const keys = EVENTS.map((e) => e[0]);
  await knex('notification_subscriptions').whereIn('event_key', keys).del();
  await knex('notification_events').whereIn('event_key', keys).del();
};
