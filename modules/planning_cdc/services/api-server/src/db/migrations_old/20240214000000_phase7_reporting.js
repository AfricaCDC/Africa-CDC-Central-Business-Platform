exports.up = async function (knex) {
  // ── report_templates ──
  if (!(await knex.schema.hasTable('report_templates'))) {
    await knex.schema.createTable('report_templates', (table) => {
      table.bigIncrements('id').primary();
      table.string('code', 120).notNullable().unique();
      table.string('name', 255).notNullable();
      table.enum('report_type', ['QPR', 'APR', 'DONOR', 'IATI', 'SCORECARD', 'CUSTOM']).notNullable().defaultTo('CUSTOM');
      table.json('schema_json').notNullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  // ── reports ──
  if (!(await knex.schema.hasTable('reports'))) {
    await knex.schema.createTable('reports', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('template_id').unsigned().notNullable().references('id').inTable('report_templates');
      table.enum('scope_type', ['PORTFOLIO', 'PROGRAM', 'PROJECT']).notNullable().defaultTo('PROJECT');
      table.bigInteger('scope_id').unsigned().notNullable();
      table.date('period_start').notNullable();
      table.date('period_end').notNullable();
      table.enum('status', ['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED']).notNullable().defaultTo('DRAFT');
      table.bigInteger('created_by_user_id').unsigned().notNullable().references('id').inTable('users');
      table.timestamp('approved_at').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.index(['scope_type', 'scope_id']);
      table.index('status');
    });
  }

  // ── report_sections ──
  if (!(await knex.schema.hasTable('report_sections'))) {
    await knex.schema.createTable('report_sections', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('report_id').unsigned().notNullable().references('id').inTable('reports').onDelete('CASCADE');
      table.string('section_key', 120).notNullable();
      table.string('title', 255).notNullable();
      table.text('content_text').nullable();
      table.integer('order_no').unsigned().notNullable().defaultTo(0);
      table.bigInteger('updated_by_user_id').unsigned().nullable().references('id').inTable('users');
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['report_id', 'section_key']);
    });
  }

  // ── generated_files ──
  if (!(await knex.schema.hasTable('generated_files'))) {
    await knex.schema.createTable('generated_files', (table) => {
      table.bigIncrements('id').primary();
      table.bigInteger('report_id').unsigned().nullable().references('id').inTable('reports').onDelete('SET NULL');
      table.enum('file_type', ['PDF', 'XLSX', 'CSV', 'ZIP']).notNullable().defaultTo('PDF');
      table.string('file_name', 300).notNullable();
      table.string('storage_url', 900).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index('report_id');
    });
  }

  // ── export_jobs ──
  if (!(await knex.schema.hasTable('export_jobs'))) {
    await knex.schema.createTable('export_jobs', (table) => {
      table.bigIncrements('id').primary();
      table.enum('job_type', ['IATI', 'DONOR_PACK']).notNullable();
      table.enum('status', ['CONFIGURED', 'RUNNING', 'REVIEW', 'COMPLETED', 'FAILED']).notNullable().defaultTo('CONFIGURED');
      table.bigInteger('report_id').unsigned().nullable().references('id').inTable('reports').onDelete('SET NULL');
      table.timestamp('started_at').nullable();
      table.timestamp('finished_at').nullable();
      table.bigInteger('file_id').unsigned().nullable().references('id').inTable('generated_files').onDelete('SET NULL');
      table.bigInteger('created_by_user_id').unsigned().nullable().references('id').inTable('users');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index('status');
    });
  }

  // ── Seed default report templates ──
  const existingTemplates = await knex('report_templates').count('* as cnt').first();
  if (Number(existingTemplates.cnt) === 0) {
    await knex('report_templates').insert([
      {
        code: 'QPR_STANDARD',
        name: 'Quarterly Progress Report',
        report_type: 'QPR',
        schema_json: JSON.stringify({
          sections: [
            { key: 'executive_summary', title: 'Executive Summary', required: true },
            { key: 'progress_overview', title: 'Progress Overview', required: true },
            { key: 'indicator_performance', title: 'Indicator Performance', required: true },
            { key: 'budget_execution', title: 'Budget Execution', required: true },
            { key: 'challenges', title: 'Challenges & Risks', required: true },
            { key: 'next_steps', title: 'Next Steps', required: true },
          ],
        }),
        is_active: true,
      },
      {
        code: 'APR_STANDARD',
        name: 'Annual Progress Report',
        report_type: 'APR',
        schema_json: JSON.stringify({
          sections: [
            { key: 'executive_summary', title: 'Executive Summary', required: true },
            { key: 'annual_achievements', title: 'Annual Achievements', required: true },
            { key: 'indicator_performance', title: 'Indicator Performance', required: true },
            { key: 'budget_execution', title: 'Budget Execution', required: true },
            { key: 'lessons_learned', title: 'Lessons Learned', required: true },
            { key: 'sustainability', title: 'Sustainability', required: false },
            { key: 'recommendations', title: 'Recommendations', required: true },
          ],
        }),
        is_active: true,
      },
      {
        code: 'SCORECARD_STANDARD',
        name: 'Performance Scorecard',
        report_type: 'SCORECARD',
        schema_json: JSON.stringify({
          sections: [
            { key: 'kpi_summary', title: 'KPI Summary', required: true },
            { key: 'performance_rating', title: 'Performance Rating', required: true },
            { key: 'commentary', title: 'Management Commentary', required: false },
          ],
        }),
        is_active: true,
      },
      {
        code: 'DONOR_EU_OPSYS',
        name: 'EU OPSYS Report',
        report_type: 'DONOR',
        schema_json: JSON.stringify({
          sections: [
            { key: 'project_identification', title: 'Project Identification', required: true },
            { key: 'progress_indicators', title: 'Progress Against Indicators', required: true },
            { key: 'financial_report', title: 'Financial Report', required: true },
            { key: 'visibility', title: 'Visibility & Communication', required: false },
            { key: 'risks_issues', title: 'Risks & Issues', required: true },
          ],
        }),
        is_active: true,
      },
      {
        code: 'DONOR_WB_ISR',
        name: 'World Bank ISR Report',
        report_type: 'DONOR',
        schema_json: JSON.stringify({
          sections: [
            { key: 'project_context', title: 'Project Context', required: true },
            { key: 'results_framework', title: 'Results Framework', required: true },
            { key: 'implementation_status', title: 'Implementation Status', required: true },
            { key: 'fiduciary_compliance', title: 'Fiduciary Compliance', required: true },
            { key: 'safeguards', title: 'Safeguards Compliance', required: false },
          ],
        }),
        is_active: true,
      },
    ]);
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('export_jobs');
  await knex.schema.dropTableIfExists('generated_files');
  await knex.schema.dropTableIfExists('report_sections');
  await knex.schema.dropTableIfExists('reports');
  await knex.schema.dropTableIfExists('report_templates');
};
