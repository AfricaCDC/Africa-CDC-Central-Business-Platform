/**
 * Widen `indicator_report_history.action` ENUM so admin force-override
 * entries land under a dedicated label (auditable at a glance).
 */
'use strict';

const TARGET_VALUES = ['CREATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RESUBMITTED', 'ADMIN_OVERRIDE'];

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
  if (!(await knex.schema.hasTable('indicator_report_history'))) return;
  const current = await readEnumValues(knex, 'indicator_report_history', 'action');
  if (!current) return;
  const missing = TARGET_VALUES.filter((v) => !current.includes(v));
  if (!missing.length) return;
  const enumList = TARGET_VALUES.map((v) => `'${v}'`).join(',');
  await knex.raw(
    `ALTER TABLE indicator_report_history MODIFY COLUMN action ENUM(${enumList}) NOT NULL`,
  );
};

exports.down = async function down() {
  // No-op — narrowing an ENUM silently truncates stored values.
};
