/**
 * Migration: indicator_division_reports + indicator_report_history
 *
 * One report per (indicator, division, quarter, fiscal_year).
 * Each division (MAIN or CONTRIB) submits its own report.
 * Total actual = SUM(actual_value) across all divisions.
 *
 * History table tracks every status change with who/when/why.
 */

exports.up = async function (knex) {
  await knex.schema.createTable('indicator_division_reports', (t) => {
    t.increments('id').primary();
    t.integer('plan_node_id').unsigned().notNullable()
      .references('id').inTable('plan_nodes').onDelete('CASCADE');
    t.string('division_code', 20).notNullable()
      .references('code').inTable('division_codes');
    t.string('quarter', 4).notNullable(); // Q1, Q2, Q3, Q4
    t.string('fiscal_year', 10).notNullable();
    t.enum('role', ['MAIN', 'CONTRIB']).notNullable().defaultTo('CONTRIB');

    // Report data
    t.decimal('actual_value', 18, 4).nullable();
    t.text('narrative').nullable();
    t.text('challenges').nullable(); // JSON array
    t.text('recommendations').nullable(); // JSON array
    t.text('evidence_url').nullable(); // JSON array of URLs
    t.json('disaggregations').nullable();

    // Workflow
    t.enum('status', ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'VALIDATED'])
      .notNullable().defaultTo('DRAFT');
    t.string('reporting_date', 10).nullable();

    // Ownership
    t.integer('created_by').unsigned().nullable()
      .references('id').inTable('users');
    t.integer('submitted_by').unsigned().nullable()
      .references('id').inTable('users');
    t.integer('approved_by').unsigned().nullable()
      .references('id').inTable('users');
    t.timestamp('submitted_at').nullable();
    t.timestamp('approved_at').nullable();
    t.text('rejection_reason').nullable();

    t.timestamps(true, true);

    // One report per division per indicator per quarter
    t.unique(['plan_node_id', 'division_code', 'quarter', 'fiscal_year'], {
      indexName: 'uq_ind_div_report',
    });
    t.index(['division_code', 'fiscal_year', 'quarter'], 'idx_idr_div_fy_q');
    t.index(['status'], 'idx_idr_status');
  });

  await knex.schema.createTable('indicator_report_history', (t) => {
    t.increments('id').primary();
    t.integer('report_id').unsigned().notNullable()
      .references('id').inTable('indicator_division_reports').onDelete('CASCADE');
    t.enum('action', [
      'CREATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RESUBMITTED',
    ]).notNullable();
    t.string('from_status', 20).nullable();
    t.string('to_status', 20).notNullable();
    t.integer('performed_by').unsigned().nullable()
      .references('id').inTable('users');
    t.timestamp('performed_at').notNullable().defaultTo(knex.fn.now());
    t.text('comment').nullable(); // rejection reason, approval note
    t.index(['report_id'], 'idx_irh_report');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('indicator_report_history');
  await knex.schema.dropTableIfExists('indicator_division_reports');
};
