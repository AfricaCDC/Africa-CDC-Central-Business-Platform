/**
 * plan_nodes.secondary_division_codes — a specific activity may name several
 * secondary responsible divisions (D-20261026-02).
 *
 * Replaces the single `secondary_division_code` column with a TEXT column
 * holding a JSON array of division codes, the same shape as
 * `contributing_divisions`. Existing values are carried over as one-element
 * arrays. Idempotent.
 */

'use strict';

exports.up = async (knex) => {
  if (!(await knex.schema.hasColumn('plan_nodes', 'secondary_division_codes'))) {
    await knex.schema.alterTable('plan_nodes', (t) => {
      t.text('secondary_division_codes').nullable();
    });
  }
  if (await knex.schema.hasColumn('plan_nodes', 'secondary_division_code')) {
    await knex.raw(`
      UPDATE plan_nodes
         SET secondary_division_codes = JSON_ARRAY(secondary_division_code)
       WHERE secondary_division_code IS NOT NULL AND secondary_division_code <> ''
         AND secondary_division_codes IS NULL`);
    await knex.schema.alterTable('plan_nodes', (t) => {
      t.dropColumn('secondary_division_code');
    });
  }
};

// Keeps the first code of each list: the others cannot fit the old column.
exports.down = async (knex) => {
  if (!(await knex.schema.hasColumn('plan_nodes', 'secondary_division_code'))) {
    await knex.schema.alterTable('plan_nodes', (t) => {
      t.string('secondary_division_code', 20).nullable();
    });
  }
  if (await knex.schema.hasColumn('plan_nodes', 'secondary_division_codes')) {
    await knex.raw(`
      UPDATE plan_nodes
         SET secondary_division_code = JSON_UNQUOTE(JSON_EXTRACT(secondary_division_codes, '$[0]'))
       WHERE secondary_division_codes IS NOT NULL AND JSON_VALID(secondary_division_codes)`);
    await knex.schema.alterTable('plan_nodes', (t) => {
      t.dropColumn('secondary_division_codes');
    });
  }
};
