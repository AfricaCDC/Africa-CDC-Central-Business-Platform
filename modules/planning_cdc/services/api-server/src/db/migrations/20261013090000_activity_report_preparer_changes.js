/**
 * History of "Prepared by" changes on activity reports (D-20261013-03).
 *
 * An administrator or M&E officer may give a report to another person
 * (activity_reports.user_id). The previous preparer must stay on record, so
 * every change is one row here: from, to, who changed it, why, when.
 * The table is append-only; nothing updates or deletes its rows.
 *
 * Idempotent (hasTable guard). Down drops the table.
 */

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('activity_report_preparer_changes')) return;
  await knex.schema.createTable('activity_report_preparer_changes', (t) => {
    t.increments('id').primary();
    t.integer('activity_report_id').unsigned().notNullable()
      .references('id').inTable('activity_reports').onDelete('CASCADE');
    t.integer('from_user_id').unsigned().nullable();
    t.integer('to_user_id').unsigned().notNullable();
    t.integer('changed_by').unsigned().notNullable();
    t.text('reason').notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['activity_report_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('activity_report_preparer_changes');
};
