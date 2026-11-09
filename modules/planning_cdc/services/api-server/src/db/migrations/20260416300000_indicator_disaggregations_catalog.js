/**
 * Add category + sort_order to indicator_disaggregations and seed the catalog.
 * Supports the PIRS form disaggregation multi-select (D-20260416-17).
 */
exports.up = async function up(knex) {
  const hasCategory = await knex.schema.hasColumn('indicator_disaggregations', 'category');
  if (!hasCategory) {
    await knex.schema.alterTable('indicator_disaggregations', (t) => {
      t.string('category', 50).defaultTo('General');
      t.integer('sort_order').defaultTo(0);
    });
  }

  const existing = await knex('indicator_disaggregations').count('* as c').first();
  if (Number(existing.c) === 0) {
    await knex('indicator_disaggregations').insert([
      { name: 'Sex', description: 'Breakdown by biological sex', category: 'Demographics', sort_order: 1 },
      { name: 'Age by Group', description: 'Standard WHO age brackets', category: 'Demographics', sort_order: 2 },
      { name: 'Member States', description: 'Multi-select from the 55 AU member states + total count', category: 'Geography', sort_order: 1 },
      { name: 'AU Region', description: 'AU geographic regions', category: 'Geography', sort_order: 2 },
    ]);
  }
};

exports.down = async function down(knex) {
  await knex('indicator_disaggregations').whereIn('name', ['Sex', 'Age by Group', 'Member States', 'AU Region']).del();
  const hasCategory = await knex.schema.hasColumn('indicator_disaggregations', 'category');
  if (hasCategory) {
    await knex.schema.alterTable('indicator_disaggregations', (t) => {
      t.dropColumn('category');
      t.dropColumn('sort_order');
    });
  }
};
