/**
 * Add `workplan_items.amert_code` — the AMERT activity code (e.g. "4.2.4.01")
 * used by the Excel import/link scripts to match rows across re-imports.
 *
 * Like plan_nodes (see 20260412990000_bootstrap_plan_nodes), this column was
 * added ad hoc on the original dev server and never captured in a migration,
 * so fresh installs were missing it. Idempotent.
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('workplan_items'))) return;
  if (await knex.schema.hasColumn('workplan_items', 'amert_code')) return;

  await knex.schema.alterTable('workplan_items', (t) => {
    t.string('amert_code', 50).nullable().index('idx_workplan_items_amert_code');
  });
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasColumn('workplan_items', 'amert_code'))) return;
  await knex.schema.alterTable('workplan_items', (t) => {
    t.dropIndex('amert_code', 'idx_workplan_items_amert_code');
    t.dropColumn('amert_code');
  });
};
