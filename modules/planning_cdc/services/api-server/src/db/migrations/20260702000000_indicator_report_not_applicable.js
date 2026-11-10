/**
 * Widen `indicator_division_reports.status` and
 * `indicator_report_history.action` ENUMs to add NOT_APPLICABLE, so a
 * focal person can flag an indicator as not applicable to their division
 * — the indicator-report equivalent of the existing activity_reports
 * ownership-dispute flow (20260412100000_add_not_applicable_status.js).
 *
 * Idempotent — mirrors 20260419600000_widen_idr_status_enum.js /
 * 20260420100000_history_admin_override.js (introspects the live ENUM via
 * information_schema and only ALTERs when the value is actually missing).
 */
'use strict';

const STATUS_VALUES = ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'VALIDATED', 'NOT_APPLICABLE'];
const ACTION_VALUES = ['CREATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RESUBMITTED', 'ADMIN_OVERRIDE', 'NOT_APPLICABLE'];

async function readEnumValues(knex, table, column) {
  const [rows] = await knex.raw(
    'SELECT COLUMN_TYPE FROM information_schema.COLUMNS '
    + 'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column],
  );
  const type = rows?.[0]?.COLUMN_TYPE || '';
  const match = type.match(/^enum\((.*)\)$/i);
  if (!match) return null;
  return match[1].split(',').map((s) => s.replace(/^'(.*)'$/, '$1'));
}

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('indicator_division_reports')) {
    const current = await readEnumValues(knex, 'indicator_division_reports', 'status');
    if (current && !current.includes('NOT_APPLICABLE')) {
      const enumList = STATUS_VALUES.map((v) => `'${v}'`).join(',');
      await knex.raw(
        `ALTER TABLE indicator_division_reports MODIFY COLUMN status ENUM(${enumList}) NOT NULL DEFAULT 'DRAFT'`,
      );
    }
  }

  if (await knex.schema.hasTable('indicator_report_history')) {
    const current = await readEnumValues(knex, 'indicator_report_history', 'action');
    if (current && !current.includes('NOT_APPLICABLE')) {
      const enumList = ACTION_VALUES.map((v) => `'${v}'`).join(',');
      await knex.raw(
        `ALTER TABLE indicator_report_history MODIFY COLUMN action ENUM(${enumList}) NOT NULL`,
      );
    }
  }
};

exports.down = async function down() {
  // No-op — narrowing an ENUM silently truncates stored values (same
  // rationale as the two migrations this one mirrors).
};
