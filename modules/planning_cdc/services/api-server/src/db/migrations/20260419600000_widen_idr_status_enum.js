/**
 * Widen `indicator_division_reports.status` ENUM to cover every value
 * the workflow engine may write.
 *
 * Symptom in staging (2026-04-19):
 *   ER_WARN_DATA_TRUNCATED — "Data truncated for column 'status' at row 1"
 * when svc.submit() pushed `IN_REVIEW` into a row whose column ENUM was
 * still the narrower 5.7-era variant (DRAFT|SUBMITTED|APPROVED|REJECTED
 * only). The fresh 20260418200000 CREATE carried the full 6-value set
 * but environments that had an earlier hand-crafted version of the
 * table never got it.
 *
 * Idempotent. Re-running against an already-wide ENUM is a no-op.
 */

'use strict';

const TARGET_VALUES = ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'VALIDATED'];

async function readEnumValues(knex, table, column) {
  const [rows] = await knex.raw(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [table, column],
  );
  const type = rows?.[0]?.COLUMN_TYPE || '';
  // COLUMN_TYPE example: enum('DRAFT','SUBMITTED',...)
  const match = type.match(/^enum\((.*)\)$/i);
  if (!match) return null;
  return match[1].split(',').map((s) => s.replace(/^'(.*)'$/, '$1'));
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('indicator_division_reports'))) return;
  const current = await readEnumValues(knex, 'indicator_division_reports', 'status');
  if (!current) return;
  const missing = TARGET_VALUES.filter((v) => !current.includes(v));
  if (!missing.length) return;

  const enumList = TARGET_VALUES.map((v) => `'${v}'`).join(',');
  await knex.raw(
    `ALTER TABLE indicator_division_reports
       MODIFY COLUMN status ENUM(${enumList}) NOT NULL DEFAULT 'DRAFT'`,
  );
};

exports.down = async function down() {
  // No-op: narrowing an ENUM silently truncates existing data.
};
