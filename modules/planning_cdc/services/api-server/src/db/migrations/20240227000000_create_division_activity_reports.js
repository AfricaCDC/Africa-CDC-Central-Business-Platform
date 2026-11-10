exports.up = async function(knex) {
  await knex.schema.createTable('division_activity_reports', t => {
    t.increments('id').primary();
    t.integer('reporting_period_id').unsigned().notNullable()
      .references('id').inTable('reporting_periods').onDelete('CASCADE');
    t.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.string('division', 200).notNullable();
    t.text('narrative').nullable();
    t.text('achievements').nullable();
    t.text('challenges').nullable();
    t.text('lessons').nullable();
    t.text('next_steps').nullable();
    t.integer('beneficiary_count').unsigned().nullable();
    t.string('beneficiary_type', 300).nullable();
    t.enum('implementation_status', ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).defaultTo('IN_PROGRESS');
    t.enum('status', ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']).defaultTo('DRAFT');
    t.datetime('submitted_at').nullable();
    t.integer('reviewed_by').unsigned().nullable().references('id').inTable('users');
    t.datetime('reviewed_at').nullable();
    t.text('rejection_reason').nullable();
    t.timestamps(true, true);
    t.unique(['reporting_period_id', 'division']);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('division_activity_reports');
};
