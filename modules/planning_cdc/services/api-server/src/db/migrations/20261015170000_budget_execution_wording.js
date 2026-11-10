/**
 * Budget execution wording (D-20261015-06): the admin texts of the wizard and
 * the settings no longer say "MIS", and the import reminder is daily until
 * the export of the week is imported. Text only; `down` restores the texts of
 * 20261015150000_budget_execution.js.
 */
'use strict';

const TEXTS = {
  notification_templates: ['template_key', {
    'budget-execution-summary': ['Budget balance and execution of the business unit after each import.', 'Budget balance and execution of the business unit after each MIS import.'],
    'budget-import-status': ['Budget execution import: daily reminder until done, confirmation when done (who imported).', 'Weekly MIS import: reminder when not done yet, confirmation when done.'],
  }],
  notification_events: ['event_key', {
    'budget_execution.imported': ['A new budget execution export was imported: each business unit receives its balance and execution.', 'A new MIS export was imported: each business unit receives its balance and execution.'],
    'budget_execution.import_due': ['Daily reminder on working days: the budget execution export of the week is not imported yet.', 'Weekly reminder: no MIS export imported yet this week.'],
    'budget_execution.import_done': ['The budget execution export of the week was imported.', 'The MIS export of the week was imported.'],
  }],
  app_settings: ['key', {
    'reminders.budget_import.enabled': ['Email asking the finance team to import the budget execution export, every working day until done (1 = on).', 'Weekly email asking the finance team to import the MIS budget execution export (1 = on).'],
    'reminders.budget_import.weekday': ['First day of the week (0 = Sunday … 6 = Saturday, UTC) the import reminder is sent; then every working day until done.', 'Day of the week (0 = Sunday … 6 = Saturday, UTC) the MIS import reminder is sent.'],
    'reminders.budget_import.hour_utc': ['Hour of day (0-23, UTC) the import reminder is sent.', 'Hour of day (0-23, UTC) the MIS import reminder is sent.'],
    'budget_execution.import_division': ['Business unit that imports the budget execution export: its focal person and head get the reminder.', 'Business unit that imports the MIS export: its focal person and head get the weekly reminder.'],
  }],
};

async function apply(knex, pick) {
  for (const [table, [keyColumn, rows]] of Object.entries(TEXTS)) {
    if (!(await knex.schema.hasTable(table))) continue;
    for (const [key, texts] of Object.entries(rows)) {
      await knex(table).where(keyColumn, key).update({ description: texts[pick] });
    }
  }
}

exports.up = (knex) => apply(knex, 0);
exports.down = (knex) => apply(knex, 1);
