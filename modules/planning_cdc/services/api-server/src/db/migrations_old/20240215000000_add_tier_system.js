/**
 * Migration: Add Tier System (T1-T4) and PIRs metadata
 *
 * - Adds SHORT_TERM_OUTCOME to results.level enum
 * - Adds tier + PIRs fields to indicators
 * - Adds indicator_id to workplan_items
 * - Creates priority_areas table
 * - Adds priority_area_id to results
 */
exports.up = async function (knex) {
  // 1. Modify results.level enum to include SHORT_TERM_OUTCOME
  await knex.schema.raw(`
    ALTER TABLE results MODIFY COLUMN level
      ENUM('IMPACT','GOAL','OUTCOME','SHORT_TERM_OUTCOME','OUTPUT') NOT NULL
  `);

  // 2. Add tier + PIRs metadata columns to indicators
  const hasIndicatorTier = await knex.schema.hasColumn('indicators', 'tier');
  if (!hasIndicatorTier) {
    await knex.schema.alterTable('indicators', (table) => {
      table.tinyint('tier').unsigned().nullable().after('status');
      table.text('definition').nullable().after('description');
      table.string('collection_method', 500).nullable().after('definition');
      table.string('source_of_data', 500).nullable().after('collection_method');
      table.string('calculation_method', 500).nullable().after('source_of_data');
      table.enum('direction_of_change', ['INCREASE', 'DECREASE', 'MAINTAIN']).nullable().after('calculation_method');
      table.enum('reporting_level', ['AU', 'AFRICA_CDC', 'BOTH']).nullable().defaultTo('AFRICA_CDC').after('direction_of_change');
      table.bigInteger('business_unit_id').unsigned().nullable().after('owner_user_id');
    });

    // Add FK for business_unit_id if business_units table exists
    const hasBU = await knex.schema.hasTable('business_units');
    if (hasBU) {
      await knex.schema.raw(`
        ALTER TABLE indicators
          ADD CONSTRAINT fk_indicators_business_unit
          FOREIGN KEY (business_unit_id) REFERENCES business_units(id)
          ON DELETE SET NULL
      `);
    }
  }

  // 3. Add indicator_id to workplan_items
  const hasWpIndicator = await knex.schema.hasColumn('workplan_items', 'indicator_id');
  if (!hasWpIndicator) {
    await knex.schema.alterTable('workplan_items', (table) => {
      table.bigInteger('indicator_id').unsigned().nullable().after('logframe_row_id');
    });

    await knex.schema.raw(`
      ALTER TABLE workplan_items
        ADD CONSTRAINT fk_workplan_items_indicator
        FOREIGN KEY (indicator_id) REFERENCES indicators(id)
        ON DELETE SET NULL
    `);
  }

  // 4. Create priority_areas table
  if (!(await knex.schema.hasTable('priority_areas'))) {
    await knex.schema.createTable('priority_areas', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('strategic_plan_id').unsigned().notNullable().references('id').inTable('strategic_plans');
      table.string('code', 20).notNullable();
      table.string('name', 300).notNullable();
      table.enum('area_type', ['PILLAR', 'ENABLER']).notNullable();
      table.smallint('display_order').unsigned().notNullable().defaultTo(0);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.unique(['strategic_plan_id', 'code']);
    });
  }

  // 5. Add priority_area_id to results
  const hasResultPA = await knex.schema.hasColumn('results', 'priority_area_id');
  if (!hasResultPA) {
    await knex.schema.alterTable('results', (table) => {
      table.bigInteger('priority_area_id').unsigned().nullable().after('project_id');
    });

    await knex.schema.raw(`
      ALTER TABLE results
        ADD CONSTRAINT fk_results_priority_area
        FOREIGN KEY (priority_area_id) REFERENCES priority_areas(id)
        ON DELETE SET NULL
    `);
  }
};

exports.down = async function (knex) {
  // Remove priority_area_id from results
  const hasResultPA = await knex.schema.hasColumn('results', 'priority_area_id');
  if (hasResultPA) {
    await knex.schema.raw('ALTER TABLE results DROP FOREIGN KEY fk_results_priority_area').catch(() => {});
    await knex.schema.alterTable('results', (table) => {
      table.dropColumn('priority_area_id');
    });
  }

  // Drop priority_areas table
  await knex.schema.dropTableIfExists('priority_areas');

  // Remove indicator_id from workplan_items
  const hasWpIndicator = await knex.schema.hasColumn('workplan_items', 'indicator_id');
  if (hasWpIndicator) {
    await knex.schema.raw('ALTER TABLE workplan_items DROP FOREIGN KEY fk_workplan_items_indicator').catch(() => {});
    await knex.schema.alterTable('workplan_items', (table) => {
      table.dropColumn('indicator_id');
    });
  }

  // Remove tier + PIRs fields from indicators
  const hasIndicatorTier = await knex.schema.hasColumn('indicators', 'tier');
  if (hasIndicatorTier) {
    await knex.schema.raw('ALTER TABLE indicators DROP FOREIGN KEY fk_indicators_business_unit').catch(() => {});
    await knex.schema.alterTable('indicators', (table) => {
      table.dropColumn('tier');
      table.dropColumn('definition');
      table.dropColumn('collection_method');
      table.dropColumn('source_of_data');
      table.dropColumn('calculation_method');
      table.dropColumn('direction_of_change');
      table.dropColumn('reporting_level');
      table.dropColumn('business_unit_id');
    });
  }

  // Revert results.level enum
  await knex.schema.raw(`
    ALTER TABLE results MODIFY COLUMN level
      ENUM('IMPACT','GOAL','OUTCOME','OUTPUT') NOT NULL
  `);
};
