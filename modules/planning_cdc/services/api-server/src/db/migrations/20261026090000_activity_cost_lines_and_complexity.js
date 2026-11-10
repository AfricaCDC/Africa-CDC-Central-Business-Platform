/**
 * Cost lines of a specific activity by expense category, and Decision
 * Complexity Screening (D-20261026-01).
 *
 *   · expense_categories — the expense categories of PR&A's cost catalogue
 *     (its first column: Travel Ticket, Conference Facilities, …). Only the
 *     categories: no catalogue item, no price, no GL number.
 *   · activity_cost_lines — what a specific activity plans to pay: a
 *     category, a description and an amount.
 *   · activity_complexity_screenings — one per specific activity: the Yes /
 *     No screening question and, on Yes, the five Low / Moderate / High
 *     ratings with their total (5 to 15) and band. Informative only: it
 *     does not change the approval of the activity.
 *
 * Idempotent: tables created when missing, categories inserted when missing.
 * down() drops the three tables.
 */

'use strict';

const { COMPLEXITY_CRITERIA } = require('@rbm/lib/complexity');

// First column of the cost catalogue (Cost_catalogue.xlsx, Oct 2026), in its order.
const CATEGORIES = [
  'External Expertise', 'Travel Ticket', 'Travel DSA', 'Visa and Terminal', 'Ground Transportation',
  'Conference Facilities', 'Conference Materials', 'Retreat - Workshop - Meeting', 'IT Equipment',
  'Office Equipment', 'Other Items - Supplies', 'Fixed Asset', 'Non Stock Items', 'Medical Equipment',
  'Safety and Security Equipment', 'Miscellaneous', 'Project Staff', 'Peace Support Operation Costs',
  'Maintenance and Facilities', 'Judges Benefits',
];

exports.up = async (knex) => {
  if (!(await knex.schema.hasTable('expense_categories'))) {
    await knex.schema.createTable('expense_categories', (t) => {
      t.increments('id');
      t.string('name', 120).notNullable().unique();
      t.integer('sort_order').notNullable().defaultTo(0);
      t.boolean('is_active').notNullable().defaultTo(true);
      t.timestamps(true, true);
    });
  }
  if (!(await knex.schema.hasTable('activity_cost_lines'))) {
    await knex.schema.createTable('activity_cost_lines', (t) => {
      t.increments('id');
      t.integer('plan_node_id').unsigned().notNullable().references('id').inTable('plan_nodes').onDelete('CASCADE');
      t.integer('expense_category_id').unsigned().notNullable().references('id').inTable('expense_categories');
      t.string('description', 255).notNullable();
      t.decimal('amount', 16, 2).notNullable().defaultTo(0);
      t.integer('sort_order').notNullable().defaultTo(0);
      t.timestamps(true, true);
      t.index('plan_node_id');
    });
  }
  if (!(await knex.schema.hasTable('activity_complexity_screenings'))) {
    await knex.schema.createTable('activity_complexity_screenings', (t) => {
      t.increments('id');
      t.integer('plan_node_id').unsigned().notNullable().unique().references('id').inTable('plan_nodes').onDelete('CASCADE');
      t.boolean('requires_complex_decision').notNullable();
      for (const { key } of COMPLEXITY_CRITERIA) t.tinyint(key).unsigned().nullable();
      t.tinyint('total_score').unsigned().nullable();
      t.string('complexity_band', 20).nullable();
      t.integer('updated_by_user_id').unsigned().nullable();
      t.timestamps(true, true);
    });
  }
  const existing = new Set(await knex('expense_categories').pluck('name'));
  const rows = CATEGORIES.map((name, i) => ({ name, sort_order: i + 1 })).filter((r) => !existing.has(r.name));
  if (rows.length) await knex('expense_categories').insert(rows);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('activity_complexity_screenings');
  await knex.schema.dropTableIfExists('activity_cost_lines');
  await knex.schema.dropTableIfExists('expense_categories');
};
