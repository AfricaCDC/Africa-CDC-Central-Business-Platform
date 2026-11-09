/**
 * Big Tickets tables: align their collation on division_codes and add the
 * two division foreign keys that could not be created (D-20261015-02).
 *
 * 20261015120000_big_tickets.js created the tables with the server default
 * collation. On MySQL 8 that is utf8mb4_0900_ai_ci while division_codes and
 * plan_nodes are utf8mb4_general_ci: the FKs on lead_division_code and
 * big_ticket_contributors.division_code were refused ("incompatible") and
 * every join with division_codes / plan_nodes failed (ER_CANT_AGGREGATE_2COLLATIONS).
 *
 * The target collation is read from division_codes, not hard-coded. Idempotent:
 * a table already on it is skipped, an existing FK is not re-added.
 * down(): no-op (the conversion is harmless to keep).
 */

'use strict';

const TABLES = [
  'big_tickets', 'big_ticket_contributors', 'big_ticket_lines',
  'big_ticket_line_targets', 'big_ticket_reports', 'big_ticket_report_values',
];
const DIVISION_FKS = [
  { table: 'big_tickets', column: 'lead_division_code' },
  { table: 'big_ticket_contributors', column: 'division_code' },
];
const SAFE_COLLATION = /^[a-z0-9]+_[a-z0-9_]+$/;

async function tableCollation(knex, table) {
  const [rows] = await knex.raw(
    'SELECT TABLE_COLLATION AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [table],
  );
  return rows[0] ? rows[0].c : null;
}

async function hasForeignKey(knex, table, column) {
  const [rows] = await knex.raw(
    `SELECT 1 FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? AND referenced_table_name = 'division_codes'`,
    [table, column],
  );
  return rows.length > 0;
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('big_tickets'))) return;
  const target = await tableCollation(knex, 'division_codes');
  if (!target || !SAFE_COLLATION.test(target)) return;
  const charset = target.split('_')[0];

  for (const table of TABLES) {
    if (!(await knex.schema.hasTable(table))) continue;
    if ((await tableCollation(knex, table)) === target) continue;
    await knex.raw(`ALTER TABLE ?? CONVERT TO CHARACTER SET ${charset} COLLATE ${target}`, [table]);
  }

  for (const { table, column } of DIVISION_FKS) {
    if (await hasForeignKey(knex, table, column)) continue;
    await knex.schema.alterTable(table, (t) => {
      t.foreign(column).references('code').inTable('division_codes').onUpdate('CASCADE');
    });
  }
};

exports.down = async function down() {
  // Keeping the aligned collation and the FKs is harmless.
};
