/**
 * Legacy-compat: `budget_codes` — per-broad-activity budget code lines
 * (SAP-style fund allocations) served by routes/budgetCodeRoutes.js but
 * never created by any migration (ad hoc on the original dev server).
 * Idempotent.
 */
exports.up = async function (knex) {
  if (await knex.schema.hasTable('budget_codes')) return;

  await knex.schema.createTable('budget_codes', (t) => {
    t.increments('id').primary();
    t.integer('plan_node_id').unsigned().notNullable()
      .references('id').inTable('plan_nodes').onDelete('CASCADE');
    t.string('fiscal_year', 20).notNullable().defaultTo('2026');
    t.string('budget_code', 50).nullable();
    t.string('fund_code', 50).nullable();
    t.string('fund_description', 255).nullable();
    t.string('functional_area', 255).nullable();
    t.text('description').nullable();
    t.decimal('amount', 15, 2).notNullable().defaultTo(0);
    t.decimal('main_budget', 15, 2).notNullable().defaultTo(0);
    t.decimal('technical_assistance', 15, 2).notNullable().defaultTo(0);
    t.decimal('total_ips', 15, 2).notNullable().defaultTo(0);
    t.decimal('gap', 15, 2).notNullable().defaultTo(0);
    t.integer('funding_source_id').unsigned().nullable()
      .references('id').inTable('funding_sources').onDelete('SET NULL');
    t.timestamps(true, true);

    t.index(['plan_node_id'], 'idx_bc_plan_node');
    t.index(['fund_code'], 'idx_bc_fund_code');
    t.index(['fiscal_year'], 'idx_bc_fiscal_year');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('budget_codes');
};
