/**
 * Add contribution_value to activity_reports for auto-aggregation.
 *
 * This numeric field captures "how much did this activity contribute
 * to its linked indicator's target?" — e.g. 50 people trained.
 * The quarterly report sums these across all activities per indicator.
 *
 * Nullable: not all activities have a numeric contribution.
 * Idempotent: guarded by column check.
 */

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('activity_reports'))) return;
  const cols = (await knex.raw('SHOW COLUMNS FROM activity_reports'))[0].map(c => c.Field);
  if (!cols.includes('contribution_value')) {
    await knex.raw('ALTER TABLE activity_reports ADD COLUMN contribution_value DECIMAL(15,2) NULL AFTER indicator_achievement');
  }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('activity_reports'))) return;
  const cols = (await knex.raw('SHOW COLUMNS FROM activity_reports'))[0].map(c => c.Field);
  if (cols.includes('contribution_value')) {
    await knex.raw('ALTER TABLE activity_reports DROP COLUMN contribution_value');
  }
};
