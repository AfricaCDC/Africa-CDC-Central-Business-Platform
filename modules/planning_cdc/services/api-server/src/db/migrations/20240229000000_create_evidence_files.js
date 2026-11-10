exports.up = function (knex) {
  return knex.schema.createTable('evidence_files', (t) => {
    t.increments('id').primary();
    t.string('file_id', 36).notNullable().unique();   // UUID
    t.string('original_name', 500).notNullable();
    t.string('stored_name', 500).notNullable();
    t.string('mime_type', 100).notNullable();
    t.bigInteger('file_size').notNullable().defaultTo(0);
    t.string('file_url', 1000).notNullable();          // local path or remote URL in prod
    // What this file is attached to
    t.string('parent_type', 50).notNullable();         // 'activity_actual' | 'indicator_actual'
    t.integer('parent_id').notNullable();
    t.integer('uploaded_by').nullable();
    t.timestamps(true, true);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('evidence_files');
};
