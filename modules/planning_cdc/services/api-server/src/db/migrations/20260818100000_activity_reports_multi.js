/**
 * D-20260818-01 (Dr Justin p2) — multiple activity reports per specific
 * activity per quarter. A report is an independent submission: no unique
 * (plan_node_id, quarter, fiscal_year) key. On legacy DBs the unique key
 * never existed (20260706003000 bails when the table pre-exists), so both
 * steps are conditional. The non-unique index keeps list queries fast and
 * satisfies the plan_node_id FK requirement before the unique key drops.
 */

async function hasIndex(knex, table, indexName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS n FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [table, indexName],
  );
  return rows[0].n > 0;
}

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('activity_reports'))) return;
  if (!(await hasIndex(knex, 'activity_reports', 'idx_ar_node_quarter_fy'))) {
    await knex.schema.alterTable('activity_reports', (t) => {
      t.index(['plan_node_id', 'quarter', 'fiscal_year'], 'idx_ar_node_quarter_fy');
    });
  }
  if (await hasIndex(knex, 'activity_reports', 'uq_ar_node_quarter_fy')) {
    await knex.raw('ALTER TABLE activity_reports DROP INDEX uq_ar_node_quarter_fy');
    console.log('[20260818100000] dropped uq_ar_node_quarter_fy (multi-report model)');
  } else {
    console.log('[20260818100000] uq_ar_node_quarter_fy absent (legacy DB) — nothing to drop');
  }
};

exports.down = async function (knex) {
  // Down restores the plain index only — re-adding the unique key would
  // fail wherever legitimate multi-reports now exist.
  if (!(await knex.schema.hasTable('activity_reports'))) return;
  if (!(await hasIndex(knex, 'activity_reports', 'idx_ar_node_quarter_fy'))) {
    await knex.schema.alterTable('activity_reports', (t) => {
      t.index(['plan_node_id', 'quarter', 'fiscal_year'], 'idx_ar_node_quarter_fy');
    });
  }
};
