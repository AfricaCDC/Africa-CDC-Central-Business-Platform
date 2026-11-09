/**
 * Bootstrap `plan_nodes` (+ its `units_of_measure` lookup) for fresh installs.
 *
 * Historical context: both tables were created ad hoc on the original dev
 * server and never captured in a migration, so every plan_nodes-related
 * migration self-guards with hasTable/hasColumn and silently no-ops on a
 * fresh database — leaving the whole planning module unusable. This
 * migration replays the cumulative schema as of 20260412200000
 * (specific_activity_extra_fields), i.e. the state the first pending
 * migration after it (20260413000000_add_contributing_divisions) expects.
 *
 * Columns added by migrations >= 20260413000000 (contributing_divisions,
 * target_y4/y5*, strategic_plan_id, is_big_ticket, ...) are intentionally
 * NOT included — those migrations run right after this one and add them.
 *
 * Idempotent: a no-op on databases where the tables already exist.
 *
 * NOTE: plan_nodes.tier_id is a SIGNED int because tiers.tier_id is
 * int(11) — an unsigned FK column would be rejected by MySQL/MariaDB.
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('units_of_measure'))) {
    await knex.schema.createTable('units_of_measure', (t) => {
      t.increments('id').primary();
      t.string('code', 50).notNullable().unique();
      t.string('label', 255).notNullable();
      t.string('display_format', 100).nullable();
      t.string('calc_type', 50).nullable();
      t.timestamps(true, true);
    });
  }

  if (await knex.schema.hasTable('plan_nodes')) return;

  await knex.schema.createTable('plan_nodes', (t) => {
    t.increments('id').primary();
    t.enum('node_type', [
      'OUTCOME_AREA',
      'OUTCOME_INDICATOR',
      'BROAD_ACTIVITY',
      'SPECIFIC_ACTIVITY',
    ]).notNullable();
    t.string('code', 255).nullable();
    t.text('title').notNullable();
    t.text('description').nullable();
    t.integer('parent_id').unsigned().nullable()
      .references('id').inTable('plan_nodes').onDelete('CASCADE');
    t.integer('tier_id').nullable() // signed — matches tiers.tier_id int(11)
      .references('tier_id').inTable('tiers').onDelete('SET NULL');
    t.string('fiscal_year', 20).nullable();
    t.enum('status', [
      'DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED',
      'CANCELLED', 'IN_EXECUTION', 'CLOSED', 'ARCHIVED',
    ]).notNullable().defaultTo('APPROVED');
    t.integer('sort_order').notNullable().defaultTo(0);
    t.string('responsible_division_code', 20).nullable()
      .references('code').inTable('division_codes').onDelete('SET NULL');
    t.integer('linked_indicator_id').unsigned().nullable()
      .references('id').inTable('plan_nodes').onDelete('SET NULL');
    t.string('indicator_code', 100).nullable();
    t.enum('activity_type', [
      'PROCUREMENT', 'TRAINING', 'MEETING',
      'CONFERENCE', 'WORKSHOP', 'TECHNICAL_ASSISTANCE',
    ]).nullable();
    t.boolean('implementation_at_rcc').nullable();
    t.string('secondary_division_code', 20).nullable();
    t.enum('budgeting_arrangement', ['Extramural', 'Intramural']).nullable();
    t.string('primary_funding_source', 200).nullable();
    t.string('other_funding_source', 200).nullable();
    t.string('grant_name', 200).nullable();
    t.string('location', 300).nullable();
    t.boolean('is_operational').nullable();
    t.date('start_date').nullable();
    t.date('end_date').nullable();
    t.decimal('budget_main', 15, 2).nullable().defaultTo(0);
    t.decimal('budget_pass_through', 15, 2).nullable().defaultTo(0);
    t.decimal('budget_tech_assistance', 15, 2).nullable().defaultTo(0);
    t.decimal('budget_special_projects', 15, 2).nullable().defaultTo(0);
    t.decimal('budget_total_2026', 15, 2).nullable().defaultTo(0);
    t.decimal('budget_2027', 15, 2).nullable().defaultTo(0);
    t.decimal('budget_2028', 15, 2).nullable().defaultTo(0);
    t.decimal('q1_budget', 15, 2).nullable().defaultTo(0);
    t.decimal('q2_budget', 15, 2).nullable().defaultTo(0);
    t.decimal('q3_budget', 15, 2).nullable().defaultTo(0);
    t.decimal('q4_budget', 15, 2).nullable().defaultTo(0);
    t.integer('unit_of_measure_id').unsigned().nullable()
      .references('id').inTable('units_of_measure').onDelete('SET NULL');
    t.decimal('baseline_numeric', 18, 4).nullable();
    t.string('target_y1', 255).nullable();
    t.string('target_y2', 255).nullable();
    t.string('target_y3', 255).nullable();
    t.decimal('target_y1_numeric', 18, 4).nullable();
    t.decimal('target_y2_numeric', 18, 4).nullable();
    t.decimal('target_y3_numeric', 18, 4).nullable();
    t.decimal('q1_target_numeric', 18, 4).nullable();
    t.decimal('q2_target_numeric', 18, 4).nullable();
    t.decimal('q3_target_numeric', 18, 4).nullable();
    t.decimal('q4_target_numeric', 18, 4).nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('created_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('submitted_at').nullable();
    t.integer('reviewed_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('reviewed_at').nullable();
    t.text('rejection_reason').nullable();
    t.timestamps(true, true);

    // Mirrors 20260407000000_add_performance_indexes, which no-ops when
    // plan_nodes is absent and never re-runs on this database.
    t.index('node_type', 'idx_plan_nodes_node_type');
    t.index('parent_id', 'idx_plan_nodes_parent');
    t.index('fiscal_year', 'idx_plan_nodes_fiscal_year');
    t.index('linked_indicator_id', 'idx_plan_nodes_linked_indicator');
    t.index('responsible_division_code', 'idx_plan_nodes_resp_division');
    t.index('code', 'idx_plan_nodes_code');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('plan_nodes');
  await knex.schema.dropTableIfExists('units_of_measure');
};
