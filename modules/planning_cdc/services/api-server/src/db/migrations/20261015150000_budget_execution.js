/**
 * Budget execution from the MIS export (D-20261015-04).
 *
 *   · budget_execution_imports — one row per uploaded MIS export (snapshot,
 *     dated `as_of_date`, for a fiscal year);
 *   · budget_execution_lines — the rows of that export: one budget row per
 *     (fund center, fund) block (`gl_account` NULL: original / released
 *     budget, brought-forward budget) and one row per GL account
 *     (commitment, actual expenditure, expenditure on brought-forward).
 *   · RBAC module `budget_execution`: grants copied from `budget` (BUs read
 *     their division, directors their directorate, M&E / admins everything
 *     and import). Editable on /admin/rbac.
 *   · notification event `budget_execution.imported` → focal person and
 *     head of each business unit, template budget-execution-summary;
 *   · weekly import reminder: `budget_execution.import_due` (no import yet
 *     this week) and `budget_execution.import_done` (import made) → focal
 *     person and head of the importing unit (setting
 *     budget_execution.import_division, FMG) and every active system
 *     administrator, template budget-import-status;
 *   · app_settings reminders.budget_import.enabled ('1'), .weekday ('1' =
 *     Monday), .hour_utc ('6'), budget_execution.import_division ('FMG').
 *
 * A fund center links to its activity through budget_codes.budget_code.
 * Tables use the collation of budget_codes (joins on the code).
 * Idempotent. down() drops the tables and removes the rows it added.
 */

'use strict';

const { RECIPIENT_SCOPES: S } = require('@rbm/lib/events');
const { ROLES } = require('@rbm/lib/roles');

const MODULE = { code: 'budget_execution', name: 'Budget Execution', category: 'planning', sort_order: 19 };
const SOURCE_MODULE = 'budget';
const EVENT = 'budget_execution.imported';
const TEMPLATE = 'budget-execution-summary';
const STATUS_TEMPLATE = 'budget-import-status';
const IMPORT_EVENTS = [
  ['budget_execution.import_due', 'import_due', 'Budget execution import due', 'Weekly reminder: no MIS export imported yet this week.'],
  ['budget_execution.import_done', 'import_done', 'Budget execution imported', 'The MIS export of the week was imported.'],
];
const IMPORT_RECIPIENTS = [[S.FOCAL_OF_MAIN, null, 100], [S.ENTITY_MAIN_HOD, null, 110], [S.ROLE_ALL_ACTIVE, ROLES.SYSTEM_ADMIN, 120]];
const SETTINGS = [
  ['reminders.budget_import.enabled', '1', 'Weekly email asking the finance team to import the MIS budget execution export (1 = on).'],
  ['reminders.budget_import.weekday', '1', 'Day of the week (0 = Sunday … 6 = Saturday, UTC) the MIS import reminder is sent.'],
  ['reminders.budget_import.hour_utc', '6', 'Hour of day (0-23, UTC) the MIS import reminder is sent.'],
  ['budget_execution.import_division', 'FMG', 'Business unit that imports the MIS export: its focal person and head get the weekly reminder.'],
];
const MONEY = ['original_budget', 'released_budget', 'committed', 'spent', 'bbf_budget', 'bbf_spent'];

async function tableCollation(knex, table) {
  try {
    const [rows] = await knex.raw(
      'SELECT TABLE_COLLATION AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
      [table],
    );
    return rows[0] && /^[a-z0-9]+_[a-z0-9_]+$/.test(rows[0].c) ? rows[0].c : null;
  } catch {
    return null; // not MySQL (tests): keep the defaults
  }
}

async function createTables(knex) {
  const collation = await tableCollation(knex, 'budget_codes');
  const fit = (t) => {
    if (!collation) return;
    t.charset(collation.split('_')[0]);
    t.collate(collation);
  };
  if (!(await knex.schema.hasTable('budget_execution_imports'))) {
    await knex.schema.createTable('budget_execution_imports', (t) => {
      fit(t);
      t.increments('id').primary();
      t.string('fiscal_year', 4).notNullable();
      t.date('as_of_date').notNullable();
      t.string('file_name', 255).nullable();
      t.integer('fund_center_count').notNullable().defaultTo(0);
      t.integer('line_count').notNullable().defaultTo(0);
      t.integer('imported_by').unsigned().nullable();
      t.timestamps(true, true);
      t.index(['fiscal_year', 'as_of_date']);
    });
  }
  if (!(await knex.schema.hasTable('budget_execution_lines'))) {
    await knex.schema.createTable('budget_execution_lines', (t) => {
      fit(t);
      t.increments('id').primary();
      t.integer('import_id').unsigned().notNullable().references('id').inTable('budget_execution_imports').onDelete('CASCADE');
      t.string('fund_center', 30).notNullable();
      t.string('fund', 30).nullable();
      t.string('fund_center_text', 255).nullable();
      t.string('cost_center', 20).nullable();
      t.string('gl_account', 20).nullable();
      t.string('gl_description', 255).nullable();
      for (const col of MONEY) t.decimal(col, 18, 2).notNullable().defaultTo(0);
      t.index(['import_id', 'fund_center']);
    });
  }
}

async function seedRbac(knex) {
  let mod = await knex('rbac_modules').where('code', MODULE.code).first();
  if (!mod) {
    const [id] = await knex('rbac_modules').insert(MODULE);
    mod = { id };
  }
  const source = await knex('rbac_modules').where('code', SOURCE_MODULE).first();
  if (!source) return;
  const grants = await knex('rbac_permissions').where('module_id', source.id).select('role_id', 'action_id', 'scope');
  for (const g of grants) {
    const where = { role_id: g.role_id, module_id: mod.id, action_id: g.action_id };
    if (!(await knex('rbac_permissions').where(where).first())) await knex('rbac_permissions').insert({ ...where, scope: g.scope });
  }
}

async function seedNotifications(knex) {
  if (!(await knex.schema.hasTable('notification_subscriptions'))) return;
  if (!(await knex('notification_templates').where('template_key', TEMPLATE).first())) {
    await knex('notification_templates').insert({
      template_key: TEMPLATE, channel: 'email', subject: 'Budget execution of {division} as at {asOf}', body_key: TEMPLATE,
      description: 'Budget balance and execution of the business unit after each MIS import.', is_active: 1,
    });
  }
  if (!(await knex('notification_events').where('event_key', EVENT).first())) {
    await knex('notification_events').insert({
      event_key: EVENT, entity_type: 'BUDGET_EXECUTION', action: 'imported', label: 'Budget execution updated',
      description: 'A new MIS export was imported: each business unit receives its balance and execution.', default_enabled: 1, is_active: 1,
    });
  }
  const subs = [
    [EVENT, S.FOCAL_OF_MAIN, null, TEMPLATE, 100],
    [EVENT, S.ENTITY_MAIN_HOD, null, TEMPLATE, 110],
    ...IMPORT_EVENTS.flatMap(([key]) => IMPORT_RECIPIENTS.map(([scope, role, priority]) => [key, scope, role, STATUS_TEMPLATE, priority])),
  ];
  for (const [eventKey, scope, role, templateKey, priority] of subs) {
    const where = { event_key: eventKey, recipient_scope: scope, template_key: templateKey };
    if (await knex('notification_subscriptions').where(where).first()) continue;
    await knex('notification_subscriptions').insert({
      ...where, recipient_role: role, channel: 'email', priority, is_active: 1, throttle_window_sec: 0, metadata: '{}',
    });
  }
}

async function seedImportReminder(knex) {
  if (!(await knex.schema.hasTable('notification_subscriptions'))) return;
  if (!(await knex('notification_templates').where('template_key', STATUS_TEMPLATE).first())) {
    await knex('notification_templates').insert({
      template_key: STATUS_TEMPLATE, channel: 'email', subject: 'Budget execution import — week of {weekStart}', body_key: STATUS_TEMPLATE,
      description: 'Weekly MIS import: reminder when not done yet, confirmation when done.', is_active: 1,
    });
  }
  for (const [key, action, label, description] of IMPORT_EVENTS) {
    if (await knex('notification_events').where('event_key', key).first()) continue;
    await knex('notification_events').insert({
      event_key: key, entity_type: 'BUDGET_EXECUTION', action, label, description, default_enabled: 1, is_active: 1,
    });
  }
  if (await knex.schema.hasTable('app_settings')) {
    for (const [key, value, description] of SETTINGS) {
      if (!(await knex('app_settings').where({ key }).first())) await knex('app_settings').insert({ key, value, description });
    }
  }
}

exports.up = async function up(knex) {
  await createTables(knex);
  if (await knex.schema.hasTable('rbac_modules')) await seedRbac(knex);
  await seedImportReminder(knex);
  await seedNotifications(knex);
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('notification_subscriptions')) {
    const events = [EVENT, ...IMPORT_EVENTS.map((e) => e[0])];
    await knex('notification_subscriptions').whereIn('event_key', events).del();
    await knex('notification_events').whereIn('event_key', events).del();
    await knex('notification_templates').whereIn('template_key', [TEMPLATE, STATUS_TEMPLATE]).del();
  }
  if (await knex.schema.hasTable('app_settings')) await knex('app_settings').whereIn('key', SETTINGS.map((x) => x[0])).del();
  if (await knex.schema.hasTable('rbac_modules')) {
    const mod = await knex('rbac_modules').where('code', MODULE.code).first();
    if (mod) {
      await knex('rbac_permissions').where('module_id', mod.id).del();
      await knex('rbac_modules').where('id', mod.id).del();
    }
  }
  await knex.schema.dropTableIfExists('budget_execution_lines');
  await knex.schema.dropTableIfExists('budget_execution_imports');
};
