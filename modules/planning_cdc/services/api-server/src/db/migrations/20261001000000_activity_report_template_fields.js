/**
 * Align activity_reports with the official Africa CDC Activity Reporting
 * Template (D-20261001-01).
 *
 * New columns, all nullable so existing reports stay valid:
 *   - mission_type     template item 4 (MISSION_TYPES in @rbm/lib/enums)
 *   - venue            template item 7, beside the existing `location`
 *   - objectives       template item 9
 *   - strategic_needs  template item 10b (AHSS)
 *   - type_details     JSON text, the per-mission-type section
 *                      (MISSION_TYPE_FIELDS); same storage choice as
 *                      `member_states`
 *
 * Also corrects duration_days. The template counts the days of the activity
 * (a one-day workshop lasts 1 day); the old computation was end - start,
 * which gave 0 for a one-day activity. Rows with both dates are recomputed
 * the same way the service now computes them.
 *
 * Idempotent. `down` drops the columns; the duration fix is not reverted
 * because the old value was wrong.
 */

const COLUMNS = [
  ['mission_type', 'VARCHAR(40) NULL AFTER plan_node_id'],
  ['venue', 'VARCHAR(300) NULL AFTER location'],
  ['objectives', 'TEXT NULL AFTER other_staff'],
  ['strategic_needs', 'TEXT NULL AFTER objectives'],
  ['type_details', 'TEXT NULL AFTER strategic_needs'],
];

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('activity_reports'))) return;
  const existing = (await knex.raw('SHOW COLUMNS FROM activity_reports'))[0].map((c) => c.Field);
  const add = COLUMNS
    .filter(([name]) => !existing.includes(name))
    .map(([name, ddl]) => `ADD COLUMN ${name} ${ddl}`);
  if (add.length) await knex.raw(`ALTER TABLE activity_reports ${add.join(', ')}`);

  await knex.raw(`
    UPDATE activity_reports
       SET duration_days = DATEDIFF(end_date, start_date) + 1
     WHERE start_date IS NOT NULL AND end_date IS NOT NULL
       AND end_date >= start_date
  `);
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('activity_reports'))) return;
  const existing = (await knex.raw('SHOW COLUMNS FROM activity_reports'))[0].map((c) => c.Field);
  const drop = COLUMNS.map(([name]) => name).filter((name) => existing.includes(name));
  if (drop.length) {
    await knex.raw(`ALTER TABLE activity_reports ${drop.map((n) => `DROP COLUMN ${n}`).join(', ')}`);
  }
};
