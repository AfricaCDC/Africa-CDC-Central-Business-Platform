exports.up = async function (knex) {
  // 1. Quarterly plan columns on workplan_items (guard against re-run)
  const hasQ1 = await knex.schema.hasColumn('workplan_items', 'q1_plan');
  if (!hasQ1) {
    await knex.schema.table('workplan_items', (t) => {
      t.text('q1_plan').nullable();
      t.text('q2_plan').nullable();
      t.text('q3_plan').nullable();
      t.text('q4_plan').nullable();
      t.decimal('q1_budget', 15, 2).defaultTo(0);
      t.decimal('q2_budget', 15, 2).defaultTo(0);
      t.decimal('q3_budget', 15, 2).defaultTo(0);
      t.decimal('q4_budget', 15, 2).defaultTo(0);
    });
  }

  // 2. Extra columns on activity_reports (table created in 20240226 or 20240227)
  const hasActRep = await knex.schema.hasTable('activity_reports');
  if (hasActRep) {
    const hasPct = await knex.schema.hasColumn('activity_reports', 'overall_progress_pct');
    if (!hasPct) {
      await knex.schema.table('activity_reports', (t) => {
        t.integer('overall_progress_pct').defaultTo(0);
        t.decimal('budget_spent_quarter', 15, 2).defaultTo(0);
        t.decimal('budget_spent_cumul', 15, 2).defaultTo(0);
      });
    }
  }

  // 3. Activity logs table (daily journal)
  const hasLogs = await knex.schema.hasTable('activity_logs');
  if (!hasLogs) {
    await knex.schema.createTable('activity_logs', (t) => {
      t.increments('id');
      t.integer('workplan_item_id').unsigned().notNullable().references('id').inTable('workplan_items').onDelete('CASCADE');
      t.integer('user_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
      t.date('log_date').notNullable();
      t.text('entry').notNullable();
      t.enum('tag', ['progress', 'blocker', 'deliverable', 'note']).defaultTo('note');
      t.timestamps(true, true);
    });
  }

  // 4. Activity check-ins table (weekly status)
  const hasCheckins = await knex.schema.hasTable('activity_checkins');
  if (!hasCheckins) {
    await knex.schema.createTable('activity_checkins', (t) => {
      t.increments('id');
      t.integer('workplan_item_id').unsigned().notNullable().references('id').inTable('workplan_items').onDelete('CASCADE');
      t.integer('user_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
      t.date('week_date').notNullable();
      t.enum('status', ['ON_TRACK', 'AT_RISK', 'BLOCKED']).defaultTo('ON_TRACK');
      t.integer('progress_pct').defaultTo(0);
      t.text('note').nullable();
      t.timestamps(true, true);
      t.unique(['workplan_item_id', 'week_date']);
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('activity_checkins');
  await knex.schema.dropTableIfExists('activity_logs');

  const hasActRep = await knex.schema.hasTable('activity_reports');
  if (hasActRep) {
    await knex.schema.table('activity_reports', (t) => {
      t.dropColumn('overall_progress_pct');
      t.dropColumn('budget_spent_quarter');
      t.dropColumn('budget_spent_cumul');
    });
  }

  await knex.schema.table('workplan_items', (t) => {
    t.dropColumn('q1_plan'); t.dropColumn('q2_plan'); t.dropColumn('q3_plan'); t.dropColumn('q4_plan');
    t.dropColumn('q1_budget'); t.dropColumn('q2_budget'); t.dropColumn('q3_budget'); t.dropColumn('q4_budget');
  });
};
