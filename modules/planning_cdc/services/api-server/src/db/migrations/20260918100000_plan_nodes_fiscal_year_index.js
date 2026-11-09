/**
 * D-20260918-01 — composite index on (fiscal_year, node_type, code).
 *
 * Until now `plan_nodes` only carried a single-column index on `code`, which was
 * enough while one fiscal year existed. Loading a second plan generation makes
 * every lookup a three-part one: the 2027 import resolves parents by
 * (fiscal_year, node_type, code) on every row, and the detail route now filters
 * by fiscal year too.
 *
 * NOT unique on purpose: `code` is nullable (the IMPACT root has none) and the
 * 2026 generation may already contain duplicates we must not reject at write
 * time. Uniqueness is asserted by a test instead, where a violation is a
 * reviewable failure rather than a production 500.
 */

const TABLE = 'plan_nodes';
const INDEX = 'idx_plan_nodes_fy_type_code';

/**
 * True when the index already exists on this schema.
 *
 * @param {import('knex')} knex
 * @returns {Promise<boolean>}
 * @example await hasIndex(knex)
 */
async function hasIndex(knex) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS n FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [TABLE, INDEX],
  );
  return rows[0].n > 0;
}

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable(TABLE))) return;
  if (await hasIndex(knex)) return;
  await knex.schema.alterTable(TABLE, (t) => {
    t.index(['fiscal_year', 'node_type', 'code'], INDEX);
  });
  console.log(`[20260918100000] ${INDEX} added on ${TABLE}`);
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable(TABLE))) return;
  if (!(await hasIndex(knex))) return;
  await knex.schema.alterTable(TABLE, (t) => {
    t.dropIndex(['fiscal_year', 'node_type', 'code'], INDEX);
  });
};
