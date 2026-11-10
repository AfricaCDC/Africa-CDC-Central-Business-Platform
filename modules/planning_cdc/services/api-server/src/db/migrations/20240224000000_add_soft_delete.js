exports.up = function (knex) {
  return knex.schema
    .alterTable('workplan_items', (t) => {
      t.timestamp('archived_at').nullable().defaultTo(null);
      t.integer('archived_by').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    })
    .alterTable('results', (t) => {
      t.timestamp('archived_at').nullable().defaultTo(null);
      t.integer('archived_by').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    })
    .alterTable('indicators', (t) => {
      t.timestamp('archived_at').nullable().defaultTo(null);
      t.integer('archived_by').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    });
};

exports.down = function (knex) {
  return knex.schema
    .alterTable('workplan_items', (t) => {
      t.dropColumn('archived_at');
      t.dropColumn('archived_by');
    })
    .alterTable('results', (t) => {
      t.dropColumn('archived_at');
      t.dropColumn('archived_by');
    })
    .alterTable('indicators', (t) => {
      t.dropColumn('archived_at');
      t.dropColumn('archived_by');
    });
};
