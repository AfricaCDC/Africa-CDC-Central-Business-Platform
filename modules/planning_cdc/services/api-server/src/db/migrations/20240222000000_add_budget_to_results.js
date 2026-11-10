/**
 * Add budget columns to results table (outcomes = AMERT outputs)
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('results', (t) => {
    t.decimal('budget_main', 15, 2).defaultTo(0);
    t.decimal('budget_pass_through', 15, 2).defaultTo(0);
    t.decimal('budget_technical_assistance', 15, 2).defaultTo(0);
    t.decimal('budget_special_projects', 15, 2).defaultTo(0);
    t.decimal('budget_total', 15, 2).defaultTo(0);
    t.decimal('budget_2027', 15, 2).defaultTo(0);
    t.decimal('budget_2028', 15, 2).defaultTo(0);
    t.string('budget_source_fund', 100).nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('results', (t) => {
    t.dropColumn('budget_main');
    t.dropColumn('budget_pass_through');
    t.dropColumn('budget_technical_assistance');
    t.dropColumn('budget_special_projects');
    t.dropColumn('budget_total');
    t.dropColumn('budget_2027');
    t.dropColumn('budget_2028');
    t.dropColumn('budget_source_fund');
  });
};
