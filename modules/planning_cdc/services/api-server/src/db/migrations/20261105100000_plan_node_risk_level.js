/**
 * Risk level of a specific activity (D-20261105-05): optional HIGH / MEDIUM /
 * LOW, set by the focal person. VARCHAR so the list in @rbm/lib/enums
 * (ACTIVITY_RISK_LEVELS) can change without a schema change; the API
 * validates the value.
 */

exports.up = async function (knex) {
  if (await knex.schema.hasColumn('plan_nodes', 'risk_level')) return;
  await knex.schema.alterTable('plan_nodes', (t) => {
    t.string('risk_level', 10).nullable().after('activity_type');
  });
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasColumn('plan_nodes', 'risk_level'))) return;
  await knex.schema.alterTable('plan_nodes', (t) => {
    t.dropColumn('risk_level');
  });
};
