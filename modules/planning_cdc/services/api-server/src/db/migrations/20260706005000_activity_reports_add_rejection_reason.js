/**
 * Add `rejection_reason` to activity_reports.
 *
 * Root cause of the broken reject flow on the review tab:
 * 20260407110000_add_rejection_reason_to_reports only added the column to
 * `indicator_reports`, but the batch-review endpoints write it to
 * `activity_reports` too:
 *   - POST /api/reporting/activity-reports/:id/reject   (routes/reporting/activityReportsRoutes.js:348)
 *   - the NOT_APPLICABLE dispute upsert                 (same file, :527)
 * Both fail with ER_BAD_FIELD_ERROR → HTTP 500 on any schema that predates
 * the fresh-install bootstrap (staging included).
 *
 * Idempotent: safe to re-run, no-op where the column already exists.
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('activity_reports'))) return;
  if (await knex.schema.hasColumn('activity_reports', 'rejection_reason')) return;
  await knex.schema.alterTable('activity_reports', (t) => {
    t.text('rejection_reason').nullable();
  });
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('activity_reports'))) return;
  if (!(await knex.schema.hasColumn('activity_reports', 'rejection_reason'))) return;
  await knex.schema.alterTable('activity_reports', (t) => {
    t.dropColumn('rejection_reason');
  });
};
