/**
 * Legacy-compat objects still read by app code at runtime but never created
 * by any migration (ad hoc on the original dev server):
 *
 * 1. `users.division_code` — the user's "primary" division. Kept for
 *    backwards compatibility per 20260407120000_user_divisions_assignments
 *    (operational truth lives in `user_divisions`), but still selected by
 *    services/admin/users.js, routes/plan-nodes/reads.js and
 *    services/admin/hierarchy.js.
 *
 * 2. `indicator_reports` — the legacy per-quarter indicator report table.
 *    Superseded by `indicator_division_reports` but still served by
 *    routes/indicatorReportRoutes.js and routes/me/taskBuilders.js
 *    ("stays for archival lookup" per 20260418500000).
 *
 * Idempotent — no-ops where the objects already exist.
 */
exports.up = async function (knex) {
  if (await knex.schema.hasTable('users')) {
    if (!(await knex.schema.hasColumn('users', 'division_code'))) {
      await knex.schema.alterTable('users', (t) => {
        t.string('division_code', 20).nullable().index('idx_users_division');
      });
    }
  }

  if (!(await knex.schema.hasTable('indicator_reports'))) {
    await knex.schema.createTable('indicator_reports', (t) => {
      t.increments('id').primary();
      t.integer('plan_node_id').unsigned().notNullable()
        .references('id').inTable('plan_nodes').onDelete('CASCADE');
      t.integer('user_id').unsigned().nullable()
        .references('id').inTable('users').onDelete('SET NULL');
      t.string('quarter', 5).notNullable();
      t.string('fiscal_year', 20).notNullable().defaultTo('2026');
      t.decimal('actual_value', 18, 4).nullable();
      t.text('disaggregations').nullable(); // JSON text, parsed at the boundary
      t.string('status', 30).notNullable().defaultTo('DRAFT');
      t.text('narrative').nullable();
      t.text('challenges').nullable();
      t.text('recommendations').nullable();
      t.string('evidence_url', 500).nullable();
      t.string('responsible_division_code', 20).nullable();
      t.string('reporting_date', 50).nullable();
      t.timestamp('submitted_at').nullable();
      t.integer('reviewed_by').unsigned().nullable()
        .references('id').inTable('users').onDelete('SET NULL');
      t.timestamp('reviewed_at').nullable();
      t.text('rejection_reason').nullable();
      t.timestamps(true, true);

      t.unique(['plan_node_id', 'quarter', 'fiscal_year'], 'uq_ir_node_quarter_fy');
      t.index(['status'], 'idx_ir_status');
      t.index(['responsible_division_code'], 'idx_ir_division');
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('indicator_reports');
  if (await knex.schema.hasColumn('users', 'division_code')) {
    await knex.schema.alterTable('users', (t) => {
      t.dropIndex('division_code', 'idx_users_division');
      t.dropColumn('division_code');
    });
  }
};
