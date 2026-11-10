/**
 * Add `approved_by` / `approved_at` to activity_reports.
 *
 * Companion to 20260706005000 (rejection_reason): the approve endpoint
 * (routes/reporting/activityReportsRoutes.js), the workflow engine
 * (services/workflowEngine.js:378) and the contributor engine
 * (services/contributorWorkflowEngine.js:404) all stamp these columns on
 * activity_reports, but the table never had them — approving a report
 * failed with ER_BAD_FIELD_ERROR exactly like rejecting did.
 *
 * Column shapes mirror indicator_division_reports (int unsigned / timestamp,
 * no FK) so the two report tables stay symmetric. Idempotent.
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('activity_reports'))) return;
  if (!(await knex.schema.hasColumn('activity_reports', 'approved_by'))) {
    await knex.schema.alterTable('activity_reports', (t) => {
      t.integer('approved_by').unsigned().nullable();
    });
  }
  if (!(await knex.schema.hasColumn('activity_reports', 'approved_at'))) {
    await knex.schema.alterTable('activity_reports', (t) => {
      t.timestamp('approved_at').nullable();
    });
  }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('activity_reports'))) return;
  for (const col of ['approved_at', 'approved_by']) {
    // eslint-disable-next-line no-await-in-loop -- sequential column drops
    if (await knex.schema.hasColumn('activity_reports', col)) {
      // eslint-disable-next-line no-await-in-loop
      await knex.schema.alterTable('activity_reports', (t) => t.dropColumn(col));
    }
  }
};
