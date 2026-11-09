/**
 * Legacy-compat: `activity_reports` — per-quarter activity report for
 * SPECIFIC_ACTIVITY plan_nodes. Served by routes/activityReportRoutes.js and
 * routes/me/taskBuilders.js but never created by any migration (ad hoc on
 * the original dev server, same story as plan_nodes).
 *
 * Includes the cumulative columns that the earlier guarded migrations
 * (20260412300000_activity_report_full_fields,
 * 20260412400000_add_contribution_value) silently skipped on fresh installs
 * because the table did not exist when they ran.
 *
 * `status` is VARCHAR (not ENUM) so every historical value fits, including
 * NOT_APPLICABLE (20260412100000). Idempotent.
 */
exports.up = async function (knex) {
  if (await knex.schema.hasTable('activity_reports')) return;

  await knex.schema.createTable('activity_reports', (t) => {
    t.increments('id').primary();
    t.integer('plan_node_id').unsigned().notNullable()
      .references('id').inTable('plan_nodes').onDelete('CASCADE');
    t.integer('user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.string('quarter', 5).notNullable();
    t.string('fiscal_year', 20).notNullable().defaultTo('2026');
    t.string('status', 30).notNullable().defaultTo('DRAFT');

    // Spend & budget
    t.decimal('actual_spend', 15, 2).notNullable().defaultTo(0);
    t.decimal('total_budget', 15, 2).nullable();
    t.string('budget_code', 50).nullable();

    // Narrative (ACTREP1-19 spec)
    t.text('narrative').nullable();
    t.text('achievements').nullable();
    t.text('challenges').nullable();
    t.text('lessons_learned').nullable();
    t.text('next_steps').nullable();
    t.string('location', 300).nullable();
    t.date('start_date').nullable();
    t.date('end_date').nullable();
    t.integer('duration_days').nullable();
    t.string('lead_organiser', 300).nullable();
    t.text('other_staff').nullable();
    t.integer('participants_count').nullable();
    t.string('beneficiary_type', 200).nullable();
    t.text('member_states').nullable();
    t.text('methodology').nullable();
    t.text('indicator_achievement').nullable();
    t.decimal('contribution_value', 15, 2).nullable();
    t.text('means_of_verification').nullable();
    t.text('findings_recommendations').nullable();

    // Workflow stamps
    t.timestamp('submitted_at').nullable();
    t.integer('reviewed_by').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('reviewed_at').nullable();
    t.text('rejection_reason').nullable();
    t.timestamps(true, true);

    t.unique(['plan_node_id', 'quarter', 'fiscal_year'], 'uq_ar_node_quarter_fy');
    t.index(['status'], 'idx_ar_status');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('activity_reports');
};
