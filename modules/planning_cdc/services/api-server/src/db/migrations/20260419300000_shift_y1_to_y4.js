/**
 * Data migration: move existing FY1 target values to FY4.
 *
 * Before the FY mapping refactor, `target_y1*` was treated as the
 * CURRENT-year target (app was built around FY1=current in a 3-year
 * horizon). The mapping is now absolute (FY1=2023, FY4=2026=current),
 * so every historical value that was entered "for the current year"
 * actually belongs in FY4 now.
 *
 * Only rows where FY4 is currently NULL are shifted — we never clobber
 * a value the admin has already typed into FY4. Source FY1 columns
 * are cleared after shift so the same value doesn't appear twice.
 *
 * Runs on both `target_y1` (string) and `target_y1_numeric` (decimal).
 */

'use strict';

exports.up = async function up(knex) {
  // numeric
  await knex.raw(`
    UPDATE plan_nodes
       SET target_y4_numeric = target_y1_numeric
     WHERE target_y1_numeric IS NOT NULL
       AND target_y4_numeric IS NULL
  `);
  await knex.raw(`
    UPDATE plan_nodes
       SET target_y1_numeric = NULL
     WHERE target_y1_numeric IS NOT NULL
       AND target_y4_numeric = target_y1_numeric
  `);

  // string mirror (for rows where the numeric pair is not populated)
  await knex.raw(`
    UPDATE plan_nodes
       SET target_y4 = target_y1
     WHERE target_y1 IS NOT NULL AND target_y1 <> ''
       AND (target_y4 IS NULL OR target_y4 = '')
  `);
  await knex.raw(`
    UPDATE plan_nodes
       SET target_y1 = NULL
     WHERE target_y1 IS NOT NULL AND target_y1 <> ''
       AND target_y4 = target_y1
  `);
};

exports.down = async function down(knex) {
  // Reverse: move FY4 back into FY1 where FY1 is empty.
  await knex.raw(`
    UPDATE plan_nodes
       SET target_y1_numeric = target_y4_numeric
     WHERE target_y4_numeric IS NOT NULL
       AND target_y1_numeric IS NULL
  `);
  await knex.raw(`
    UPDATE plan_nodes
       SET target_y4_numeric = NULL
     WHERE target_y4_numeric IS NOT NULL
       AND target_y1_numeric = target_y4_numeric
  `);
  await knex.raw(`
    UPDATE plan_nodes
       SET target_y1 = target_y4
     WHERE target_y4 IS NOT NULL AND target_y4 <> ''
       AND (target_y1 IS NULL OR target_y1 = '')
  `);
  await knex.raw(`
    UPDATE plan_nodes
       SET target_y4 = NULL
     WHERE target_y4 IS NOT NULL AND target_y4 <> ''
       AND target_y1 = target_y4
  `);
};
