exports.up = async function (knex) {
  await knex.schema.createTable('budget_lines', (t) => {
    t.increments('id').primary();
    t.integer('project_id').unsigned().nullable().references('id').inTable('projects').onDelete('CASCADE');
    t.string('fiscal_year', 10).notNullable().defaultTo('2026');

    // Identity
    t.string('bu_code', 50).nullable();          // e.g. "CHSHP", "MIS", "ADMIN"
    t.string('bu_name', 200).nullable();          // full BU name
    t.integer('seq_no').nullable();               // sequential number
    t.string('amert_code', 50).nullable();        // e.g. "1.1.1.01"
    t.string('budget_code', 50).nullable();       // e.g. "CDC100202MB"
    t.string('fund_code', 50).nullable();         // e.g. "PB-WDF01"
    t.string('fund_description', 200).nullable(); // e.g. "World Diabetes Fund"
    t.string('functional_area', 50).nullable();   // e.g. "MSHT-06"

    // Linked entities
    t.integer('workplan_item_id').unsigned().nullable().references('id').inTable('workplan_items').onDelete('SET NULL');
    t.integer('result_id').unsigned().nullable().references('id').inTable('results').onDelete('SET NULL');
    t.string('activity_title', 500).nullable();

    // Budget amounts
    t.decimal('amount', 15, 2).defaultTo(0);
    t.decimal('technical_assistance', 15, 2).defaultTo(0);
    t.decimal('main_budget', 15, 2).defaultTo(0);
    t.decimal('amert_approval', 15, 2).defaultTo(0);

    // Funding sources (implementing partners)
    t.decimal('ip_member_states', 15, 2).defaultTo(0);
    t.decimal('ip_afdb', 15, 2).defaultTo(0);
    t.decimal('ip_canada', 15, 2).defaultTo(0);
    t.decimal('ip_cepi', 15, 2).defaultTo(0);
    t.decimal('ip_ecdc', 15, 2).defaultTo(0);
    t.decimal('ip_eu_hera', 15, 2).defaultTo(0);
    t.decimal('ip_fcdo', 15, 2).defaultTo(0);
    t.decimal('ip_gavi', 15, 2).defaultTo(0);
    t.decimal('ip_indirect_cost', 15, 2).defaultTo(0);
    t.decimal('ip_korea_dca', 15, 2).defaultTo(0);
    t.decimal('ip_korea_fund', 15, 2).defaultTo(0);
    t.decimal('ip_mastercard', 15, 2).defaultTo(0);
    t.decimal('ip_sbtf', 15, 2).defaultTo(0);
    t.decimal('ip_team_europe', 15, 2).defaultTo(0);
    t.decimal('ip_unicef', 15, 2).defaultTo(0);
    t.decimal('ip_welcome_trust', 15, 2).defaultTo(0);
    t.decimal('ip_world_bank', 15, 2).defaultTo(0);
    t.decimal('ip_world_diabetic', 15, 2).defaultTo(0);
    t.decimal('total_ips', 15, 2).defaultTo(0);
    t.decimal('gap', 15, 2).defaultTo(0);

    t.string('remarks', 500).nullable();

    t.timestamp('archived_at').nullable();
    t.timestamps(true, true);
  });

  // Add the FK from expenditures → budget_lines (deferred from migration 220)
  const hasCol = await knex.schema.hasColumn('expenditures', 'budget_line_id');
  if (hasCol) {
    await knex.schema.alterTable('expenditures', (t) => {
      t.foreign('budget_line_id').references('id').inTable('budget_lines').onDelete('SET NULL');
    });
  }
};

exports.down = async function (knex) {
  const hasCol = await knex.schema.hasColumn('expenditures', 'budget_line_id');
  if (hasCol) {
    await knex.schema.alterTable('expenditures', (t) => {
      t.dropForeign('budget_line_id');
    });
  }
  await knex.schema.dropTableIfExists('budget_lines');
};
