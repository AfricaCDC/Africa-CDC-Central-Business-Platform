exports.up = async function(knex) {
  await knex.schema.createTable('reporting_periods', t => {
    t.increments('id').primary();
    t.string('label', 100).notNullable();
    t.enum('quarter', ['Q1', 'Q2', 'Q3', 'Q4']).notNullable();
    t.integer('fiscal_year').notNullable();
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.enum('status', ['DRAFT', 'OPEN', 'CLOSED']).defaultTo('DRAFT');
    t.integer('created_by').unsigned().nullable().references('id').inTable('users');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('indicator_actuals', t => {
    t.increments('id').primary();
    t.integer('indicator_id').unsigned().notNullable().references('id').inTable('indicators').onDelete('CASCADE');
    t.integer('reporting_period_id').unsigned().notNullable().references('id').inTable('reporting_periods').onDelete('CASCADE');
    t.string('actual_value', 255).nullable();
    t.text('narrative').nullable();
    t.text('evidence_url').nullable();
    t.integer('submitted_by').unsigned().nullable().references('id').inTable('users');
    t.datetime('submitted_at').nullable();
    t.enum('status', ['DRAFT', 'SUBMITTED', 'VALIDATED', 'REJECTED']).defaultTo('DRAFT');
    t.integer('validated_by').unsigned().nullable().references('id').inTable('users');
    t.datetime('validated_at').nullable();
    t.text('rejection_reason').nullable();
    t.timestamps(true, true);
    t.unique(['indicator_id', 'reporting_period_id']);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('indicator_actuals');
  await knex.schema.dropTableIfExists('reporting_periods');
};
