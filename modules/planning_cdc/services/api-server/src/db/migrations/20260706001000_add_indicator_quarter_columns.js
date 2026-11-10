/**
 * Add quarterly milestone/budget columns to `indicators` — written to by
 * src/scripts/import_tier3_tier4.js and present on the original dev server
 * but never captured in a migration (same story as plan_nodes /
 * workplan_items.amert_code). Idempotent.
 */
const COLUMNS = [
  ['q1_milestone', (t) => t.string('q1_milestone', 100).nullable()],
  ['q2_milestone', (t) => t.string('q2_milestone', 100).nullable()],
  ['q3_milestone', (t) => t.string('q3_milestone', 100).nullable()],
  ['q4_milestone', (t) => t.string('q4_milestone', 100).nullable()],
  ['budget_q1', (t) => t.decimal('budget_q1', 15, 2).nullable().defaultTo(0)],
  ['budget_q2', (t) => t.decimal('budget_q2', 15, 2).nullable().defaultTo(0)],
  ['budget_q3', (t) => t.decimal('budget_q3', 15, 2).nullable().defaultTo(0)],
  ['budget_q4', (t) => t.decimal('budget_q4', 15, 2).nullable().defaultTo(0)],
];

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('indicators'))) return;
  for (const [name, add] of COLUMNS) {
    // eslint-disable-next-line no-await-in-loop -- sequential hasColumn checks
    if (await knex.schema.hasColumn('indicators', name)) continue;
    // eslint-disable-next-line no-await-in-loop
    await knex.schema.alterTable('indicators', (t) => add(t));
  }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('indicators'))) return;
  for (const [name] of COLUMNS) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await knex.schema.hasColumn('indicators', name))) continue;
    // eslint-disable-next-line no-await-in-loop
    await knex.schema.alterTable('indicators', (t) => t.dropColumn(name));
  }
};
