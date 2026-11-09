/**
 * Add contributing_divisions (JSON array of division codes) to plan_nodes.
 * Stores the list of divisions that contribute to a T3/T4 indicator
 * alongside the single responsible_division_code (MAIN).
 */
exports.up = async function (knex) {
  const has = await knex.schema.hasColumn('plan_nodes', 'contributing_divisions');
  if (!has) {
    await knex.schema.alterTable('plan_nodes', (t) => {
      t.json('contributing_divisions').nullable().defaultTo(null).after('responsible_division_code');
    });
  }
};

exports.down = async function (knex) {
  const has = await knex.schema.hasColumn('plan_nodes', 'contributing_divisions');
  if (has) {
    await knex.schema.alterTable('plan_nodes', (t) => {
      t.dropColumn('contributing_divisions');
    });
  }
};
