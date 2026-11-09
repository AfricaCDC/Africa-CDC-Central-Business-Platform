/**
 * Migration: Align DB with Dr. Justin's proposed M&E model
 *
 * Core entities from the diagram:
 * 1. PIRS (indicators) - add value_type, priority_area_id
 * 2. Workplan items - add bu_activity_code, budget_code, implementation metadata
 * 3. Activity Reports - NEW table for BU implementation reporting
 * 4. Workplans - add name column
 */
exports.up = async function (knex) {
  // 1. Add value_type + priority_area_id to indicators (PIRS enrichment)
  const hasValueType = await knex.schema.hasColumn('indicators', 'value_type');
  if (!hasValueType) {
    await knex.schema.alterTable('indicators', (table) => {
      table.enum('value_type', ['INCREMENTAL', 'CUMULATIVE']).nullable().defaultTo('CUMULATIVE').after('reporting_level');
    });
  }

  const hasIndPA = await knex.schema.hasColumn('indicators', 'priority_area_id');
  if (!hasIndPA) {
    await knex.schema.alterTable('indicators', (table) => {
      table.bigInteger('priority_area_id').unsigned().nullable().after('business_unit_id');
    });

    const hasPA = await knex.schema.hasTable('priority_areas');
    if (hasPA) {
      await knex.schema.raw(`
        ALTER TABLE indicators
          ADD CONSTRAINT fk_indicators_priority_area
          FOREIGN KEY (priority_area_id) REFERENCES priority_areas(id)
          ON DELETE SET NULL
      `);
    }
  }

  // 2. Add workplan_items metadata for BU code, budget code, implementation details
  const hasCode = await knex.schema.hasColumn('workplan_items', 'code');
  if (!hasCode) {
    await knex.schema.alterTable('workplan_items', (table) => {
      table.string('code', 80).nullable().after('parent_id');
    });
  }

  const hasBuCode = await knex.schema.hasColumn('workplan_items', 'bu_activity_code');
  if (!hasBuCode) {
    await knex.schema.alterTable('workplan_items', (table) => {
      table.string('bu_activity_code', 50).nullable().after('code');
      table.string('budget_code', 80).nullable().after('bu_activity_code');
      table.string('beneficiary', 500).nullable().after('budget_code');
      table.string('place_of_implementation', 500).nullable().after('beneficiary');
      table.string('scope', 300).nullable().after('place_of_implementation');
    });
  }

  // 3. Add name column to workplans if not exists
  const hasWpName = await knex.schema.hasColumn('workplans', 'name');
  if (!hasWpName) {
    await knex.schema.alterTable('workplans', (table) => {
      table.string('name', 300).nullable().after('quarter');
    });
  }

  // 4. Create activity_reports table (Activity Implementation Reports from BUs)
  if (!(await knex.schema.hasTable('activity_reports'))) {
    await knex.schema.createTable('activity_reports', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('workplan_item_id').unsigned().notNullable();
      table.bigInteger('project_id').unsigned().notNullable();
      table.bigInteger('business_unit_id').unsigned().nullable();
      table.string('report_period', 20).notNullable(); // e.g. "2026-Q1"
      table.text('narrative').nullable();
      table.text('achievements_summary').nullable();
      table.text('challenges').nullable();
      table.text('lessons_learned').nullable();
      table.text('next_steps').nullable();
      table.integer('beneficiaries_count').unsigned().nullable();
      table.string('beneficiaries_type', 300).nullable();
      table.string('implementation_location', 500).nullable();
      table.enum('implementation_status', [
        'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED',
      ]).notNullable().defaultTo('IN_PROGRESS');
      table.enum('status', ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']).notNullable().defaultTo('DRAFT');
      table.bigInteger('submitted_by_user_id').unsigned().nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.foreign('workplan_item_id').references('workplan_items.id').onDelete('CASCADE');
      table.foreign('project_id').references('projects.id').onDelete('CASCADE');
      table.foreign('business_unit_id').references('business_units.id').onDelete('SET NULL');
      table.foreign('submitted_by_user_id').references('users.id').onDelete('SET NULL');

      table.index(['project_id', 'report_period'], 'idx_ar_project_period');
      table.index('status', 'idx_ar_status');
    });
  }
};

exports.down = async function (knex) {
  // Drop activity_reports
  await knex.schema.dropTableIfExists('activity_reports');

  // Remove workplan name
  const hasWpName = await knex.schema.hasColumn('workplans', 'name');
  if (hasWpName) {
    await knex.schema.alterTable('workplans', (table) => {
      table.dropColumn('name');
    });
  }

  // Remove workplan_items metadata
  const hasBuCode = await knex.schema.hasColumn('workplan_items', 'bu_activity_code');
  if (hasBuCode) {
    await knex.schema.alterTable('workplan_items', (table) => {
      table.dropColumn('bu_activity_code');
      table.dropColumn('budget_code');
      table.dropColumn('beneficiary');
      table.dropColumn('place_of_implementation');
      table.dropColumn('scope');
    });
  }

  // Remove indicator fields
  const hasIndPA = await knex.schema.hasColumn('indicators', 'priority_area_id');
  if (hasIndPA) {
    await knex.schema.raw('ALTER TABLE indicators DROP FOREIGN KEY fk_indicators_priority_area').catch(() => {});
    await knex.schema.alterTable('indicators', (table) => {
      table.dropColumn('priority_area_id');
    });
  }

  const hasValueType = await knex.schema.hasColumn('indicators', 'value_type');
  if (hasValueType) {
    await knex.schema.alterTable('indicators', (table) => {
      table.dropColumn('value_type');
    });
  }
};
