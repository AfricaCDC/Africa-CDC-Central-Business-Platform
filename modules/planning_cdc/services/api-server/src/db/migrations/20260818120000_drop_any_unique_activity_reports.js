/**
 * Hotfix for D-20260818-01: the legacy/prod DB carries the one-report-per-
 * quarter unique key under Knex's DEFAULT name
 * (`activity_reports_plan_node_id_quarter_fiscal_year_unique`), not the
 * `uq_ar_node_quarter_fy` that 20260818100000 dropped by name — so the
 * second insert on a tuple still failed with ER_DUP_ENTRY in staging.
 * This migration introspects information_schema and drops EVERY unique
 * index (any name, PRIMARY excluded) whose column set is exactly
 * (plan_node_id, quarter, fiscal_year). Idempotent; the non-unique
 * idx_ar_node_quarter_fy from 20260818100000 keeps the FK satisfied.
 */

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('activity_reports'))) return;

  // MySQL 8 returns information_schema headers in canonical UPPERCASE
  // unless aliased — alias BOTH columns so the row keys are predictable
  // (the first deploy of this file dropped index `undefined` and
  // crash-looped api-server).
  const [rows] = await knex.raw(
    `SELECT index_name AS idx_name,
            GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'activity_reports'
        AND non_unique = 0
        AND index_name <> 'PRIMARY'
      GROUP BY index_name`,
  );

  for (const row of rows) {
    const idxName = row.idx_name || row.IDX_NAME;
    if (idxName && row.cols === 'plan_node_id,quarter,fiscal_year') {
      await knex.raw('ALTER TABLE activity_reports DROP INDEX ??', [idxName]);
      console.log(`[20260818120000] dropped unique index ${idxName} (multi-report model)`);
    }
  }
};

exports.down = async function () {
  // Nothing to restore — recreating any unique key would fail wherever
  // legitimate multi-reports exist (same rationale as 20260818100000).
};
