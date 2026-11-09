exports.up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'password_hash');
  if (!hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.string('password_hash', 255);
    });
  }
};

exports.down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn('users', 'password_hash');
  if (hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('password_hash');
    });
  }
};
