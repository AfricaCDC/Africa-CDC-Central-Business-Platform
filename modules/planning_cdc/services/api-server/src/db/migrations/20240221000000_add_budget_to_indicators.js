/**
 * Add budget columns to indicators table
 * Matches AMERT budget structure: Main Budget, Pass Through, TA, Special Projects, Total, 2027, 2028, Source of Fund
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('indicators', (t) => {
    t.decimal('budget_main', 15, 2).defaultTo(0).after('contributing_divisions');
    t.decimal('budget_pass_through', 15, 2).defaultTo(0).after('budget_main');
    t.decimal('budget_technical_assistance', 15, 2).defaultTo(0).after('budget_pass_through');
    t.decimal('budget_special_projects', 15, 2).defaultTo(0).after('budget_technical_assistance');
    t.decimal('budget_total', 15, 2).defaultTo(0).after('budget_special_projects');
    t.decimal('budget_2027', 15, 2).defaultTo(0).after('budget_total');
    t.decimal('budget_2028', 15, 2).defaultTo(0).after('budget_2027');
    t.string('budget_source_fund', 100).nullable().after('budget_2028');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('indicators', (t) => {
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
