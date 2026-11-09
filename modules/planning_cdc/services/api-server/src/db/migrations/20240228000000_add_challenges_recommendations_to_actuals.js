exports.up = async function(knex) {
  await knex.schema.alterTable('indicator_actuals', t => {
    t.text('challenges').nullable();
    t.text('recommendations').nullable();
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('indicator_actuals', t => {
    t.dropColumn('challenges');
    t.dropColumn('recommendations');
  });
};
