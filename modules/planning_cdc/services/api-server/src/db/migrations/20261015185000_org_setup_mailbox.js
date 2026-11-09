/**
 * Org set-up reminder to the PR&A mailbox (D-20261015-07): one email to
 * `reminders.org_setup.to` with `reminders.org_setup.cc` in copy, instead of
 * one email per system / RBM administrator. Editable on /admin/settings;
 * clearing `to` sends through the wizard subscriptions again. Inserted only
 * when missing; `down` removes them.
 */
'use strict';

const SETTINGS = [
  ['reminders.org_setup.to', 'pra@africacdc.org', 'Org set-up reminder: addresses it is sent to (comma separated). Empty = the notification wizard subscriptions.'],
  ['reminders.org_setup.cc', 'justinm@africacdc.org', 'Org set-up reminder: addresses in copy (comma separated).'],
];

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('app_settings'))) return;
  for (const [key, value, description] of SETTINGS) {
    if (!(await knex('app_settings').where({ key }).first())) await knex('app_settings').insert({ key, value, description });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('app_settings')) await knex('app_settings').whereIn('key', SETTINGS.map((x) => x[0])).del();
};
