/**
 * Align collation on the tables created in the 20260418+/20260419+ batch.
 *
 * MySQL 8.0 defaults to `utf8mb4_0900_ai_ci` for CREATE TABLE while the
 * existing prod/staging schema was built on MySQL 5.7 / legacy imports
 * at `utf8mb4_general_ci`. Any JOIN that compares a new-table varchar
 * against a legacy-table varchar crashes with:
 *
 *   ER_CANT_AGGREGATE_2COLLATIONS:
 *   Illegal mix of collations (utf8mb4_0900_ai_ci,IMPLICIT)
 *   and (utf8mb4_general_ci,IMPLICIT) for operation '='
 *
 * We convert the new tables to the legacy collation so every JOIN the
 * app does (`division_code`, `quarter`, `fiscal_year`, `role`, …) stays
 * within a single collation family. Idempotent.
 */

'use strict';

const TARGET_CHARSET = 'utf8mb4';
const TARGET_COLLATION = 'utf8mb4_general_ci';

const TABLES = [
  'plan_node_active_periods',
  'indicator_division_reports',
  'indicator_report_history',
];

async function tableCollation(knex, table) {
  const [rows] = await knex.raw(
    `SELECT TABLE_COLLATION FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return rows?.[0]?.TABLE_COLLATION || null;
}

exports.up = async function up(knex) {
  for (const table of TABLES) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await knex.schema.hasTable(table);
    if (!exists) continue;
    // eslint-disable-next-line no-await-in-loop
    const current = await tableCollation(knex, table);
    if (current === TARGET_COLLATION) continue;
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(
      `ALTER TABLE ?? CONVERT TO CHARACTER SET ${TARGET_CHARSET} COLLATE ${TARGET_COLLATION}`,
      [table],
    );
  }
};

exports.down = async function down() {
  // Intentional no-op — reversing a collation conversion can silently
  // truncate data when rows contain characters incompatible with the
  // previous collation.
};
