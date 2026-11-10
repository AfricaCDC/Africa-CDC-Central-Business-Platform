/**
 * Extend plan_nodes with FY4 & FY5 annual target columns.
 *
 * The Africa CDC strategic plan 2023-2027 covers 5 fiscal years
 * (FY1=2023 .. FY5=2027). Until now the schema only stored 3 year
 * targets (target_y1_numeric .. target_y3_numeric) because earlier
 * iterations assumed a 3-year operating cycle. We now carry the full
 * 5-year horizon so "the target for the current year" can point to
 * FY4 (2026) without losing history or future rolls.
 *
 * New columns mirror the existing naming for consistency; the
 * `*_numeric` twin stays optional and matches the legacy y1..y3 pair.
 */

'use strict';

exports.up = async function up(knex) {
  const addIfMissing = async (col, fn) => {
    if (!(await knex.schema.hasColumn('plan_nodes', col))) {
      await knex.schema.alterTable('plan_nodes', fn);
    }
  };
  await addIfMissing('target_y4', (t) => t.string('target_y4', 255).nullable());
  await addIfMissing('target_y4_numeric', (t) => t.decimal('target_y4_numeric', 18, 4).nullable());
  await addIfMissing('target_y5', (t) => t.string('target_y5', 255).nullable());
  await addIfMissing('target_y5_numeric', (t) => t.decimal('target_y5_numeric', 18, 4).nullable());
};

exports.down = async function down(knex) {
  const dropIfExists = async (col) => {
    if (await knex.schema.hasColumn('plan_nodes', col)) {
      await knex.schema.alterTable('plan_nodes', (t) => t.dropColumn(col));
    }
  };
  await dropIfExists('target_y4');
  await dropIfExists('target_y4_numeric');
  await dropIfExists('target_y5');
  await dropIfExists('target_y5_numeric');
};
