/**
 * Add NOT_APPLICABLE status to activity_reports so focal persons can
 * signal that a specific activity doesn't concern their division.
 *
 * Idempotent: safe to re-run.
 */

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('activity_reports'))) return;

  await knex.raw(`
    ALTER TABLE activity_reports
      MODIFY COLUMN status
        ENUM('DRAFT','SUBMITTED','APPROVED','REJECTED','NOT_APPLICABLE')
        DEFAULT 'DRAFT'
  `);
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('activity_reports'))) return;

  await knex('activity_reports')
    .where('status', 'NOT_APPLICABLE')
    .update({ status: 'DRAFT' });

  await knex.raw(`
    ALTER TABLE activity_reports
      MODIFY COLUMN status
        ENUM('DRAFT','SUBMITTED','APPROVED','REJECTED')
        DEFAULT 'DRAFT'
  `);
};
