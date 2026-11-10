/**
 * AMERT v3 — Full Schema Reset
 * Source: AMERT_Tech_Spec_v3.docx (bible)
 *
 * Tables:
 *   A. Identity & RBAC: users, roles, user_roles, business_units, teams, team_members,
 *      partner_organizations, partner_access_scopes
 *   B. Reference: member_states, tiers, strategic_plan, division_codes, partners,
 *      sap_budget_codes, funding_sources, exchange_rates
 *   C. Indicators (PIRS central): indicators
 *   D. AMERT hierarchy: amert_projects, amert_outcome_indicators, amert_output_groups,
 *      amert_output_indicators, amert_output_risks, amert_activities
 *   E. Portfolio & Planning: strategic_plans, programs, projects
 *   F. Results & Logframe: results, results_links, logframe_matrices, logframe_rows,
 *      assumptions, means_of_verification
 *   G. Workplans: workplans, workplan_items, milestones, workplan_dependencies
 *   H. M&E: indicator_baselines, indicator_targets, indicator_disaggregations,
 *      data_collection_schedules, indicator_achievements, achievement_disaggregations,
 *      evidence_files, dqa_assessments, dqa_findings, evaluations, lessons_learned,
 *      strategy_adjustments
 *   I. Finance: budgets, budget_lines, expenditures
 *   J. Reporting: report_templates, reports, report_sections, generated_files
 *   K. Governance: approval_instances, approval_steps, version_snapshots,
 *      audit_events, notifications
 *   L. Tracking: big_tickets, pirs_completion_stats, donor_results_*
 */

exports.up = async function (knex) {
  // ═══════════════════════════════════════════
  // A. IDENTITY & RBAC
  // ═══════════════════════════════════════════

  await knex.schema.createTable('business_units', (t) => {
    t.increments('id').unsigned().primary();
    t.string('code', 50).unique().notNullable();
    t.string('name', 255).notNullable();
    t.integer('parent_id').unsigned().nullable().references('id').inTable('business_units').onDelete('SET NULL');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('users', (t) => {
    t.increments('id').unsigned().primary();
    t.string('email', 255).unique().notNullable();
    t.string('full_name', 255).notNullable();
    t.string('password_hash', 255).nullable();
    t.enum('status', ['ACTIVE', 'DISABLED']).defaultTo('ACTIVE');
    t.enum('user_type', ['STAFF', 'PARTNER']).defaultTo('STAFF');
    t.integer('business_unit_id').unsigned().nullable().references('id').inTable('business_units').onDelete('SET NULL');
    t.datetime('last_login_at').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('roles', (t) => {
    t.increments('id').unsigned().primary();
    t.string('code', 50).unique().notNullable();
    t.string('name', 100).notNullable();
    t.text('description').nullable();
    t.json('permissions').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('user_roles', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('role_id').unsigned().notNullable().references('id').inTable('roles').onDelete('CASCADE');
    t.unique(['user_id', 'role_id']);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('teams', (t) => {
    t.increments('id').unsigned().primary();
    t.string('name', 255).notNullable();
    t.text('description').nullable();
    t.integer('owner_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('team_members', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('team_id').unsigned().notNullable().references('id').inTable('teams').onDelete('CASCADE');
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.unique(['team_id', 'user_id']);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('partner_organizations', (t) => {
    t.increments('id').unsigned().primary();
    t.string('name', 255).notNullable();
    t.enum('org_type', ['DONOR', 'IMPLEMENTING_PARTNER', 'TECHNICAL', 'GOVERNANCE']).defaultTo('DONOR');
    t.enum('status', ['ACTIVE', 'INACTIVE']).defaultTo('ACTIVE');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('partner_access_scopes', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('partner_org_id').unsigned().notNullable().references('id').inTable('partner_organizations').onDelete('CASCADE');
    t.enum('scope_type', ['PROGRAM', 'PROJECT', 'REPORT']).notNullable();
    t.integer('scope_id').unsigned().notNullable();
    t.enum('access_level', ['VIEW', 'COMMENT']).defaultTo('VIEW');
    t.timestamps(true, true);
  });

  // ═══════════════════════════════════════════
  // B. REFERENCE DATA
  // ═══════════════════════════════════════════

  await knex.schema.createTable('member_states', (t) => {
    t.increments('id').unsigned().primary();
    t.string('country_name', 100).notNullable();
    t.string('iso3_code', 3).unique().notNullable();
    t.enum('rcc_region', ['Northern', 'Eastern', 'Western', 'Central', 'Southern']).notNullable();
  });

  await knex.schema.createTable('tiers', (t) => {
    t.integer('tier_id').primary();
    t.string('tier_label', 20).notNullable();
    t.string('indicator_types', 100).notNullable();
    t.string('sp_level', 100).notNullable();
    t.string('timeframe', 30).notNullable();
  });

  await knex.schema.createTable('strategic_plan', (t) => {
    t.increments('id').unsigned().primary();
    t.enum('sp_type', ['priority', 'enabler']).notNullable();
    t.string('sp_code', 10).notNullable();
    t.integer('sp_number_int').notNullable();
    t.string('short_name', 100).notNullable();
    t.text('full_goal').nullable();
    t.integer('objective_number').nullable();
    t.string('objective_code', 20).nullable();
    t.text('objective_text').nullable();
  });

  await knex.schema.createTable('division_codes', (t) => {
    t.string('code', 20).primary();
    t.string('division_name', 200).notNullable();
    t.string('directorate', 200).nullable();
    t.string('office', 100).nullable();
  });

  await knex.schema.createTable('partners', (t) => {
    t.increments('id').unsigned().primary();
    t.string('partner_name', 200).notNullable();
    t.enum('partner_type', ['donor', 'technical', 'governance', 'recs']).defaultTo('donor');
    t.boolean('has_dedicated_rf').defaultTo(false);
  });

  await knex.schema.createTable('sap_budget_codes', (t) => {
    t.increments('id').unsigned().primary();
    t.string('code', 50).unique().notNullable();
    t.string('name', 255).notNullable();
    t.text('description').nullable();
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('funding_sources', (t) => {
    t.increments('id').unsigned().primary();
    t.string('name', 255).notNullable();
    t.enum('source_type', ['DONOR', 'GOVERNMENT', 'PRIVATE', 'POOLED']).defaultTo('DONOR');
    t.enum('status', ['ACTIVE', 'INACTIVE']).defaultTo('ACTIVE');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('exchange_rates', (t) => {
    t.increments('id').unsigned().primary();
    t.string('from_currency', 10).notNullable();
    t.string('to_currency', 10).notNullable();
    t.decimal('rate', 15, 6).notNullable();
    t.date('rate_date').notNullable();
    t.string('source', 100).nullable();
    t.boolean('is_override').defaultTo(false);
    t.timestamps(true, true);
  });

  // ═══════════════════════════════════════════
  // C. INDICATORS — TABLE CENTRALE PIRS (29 champs)
  // ═══════════════════════════════════════════

  await knex.schema.createTable('indicators', (t) => {
    t.increments('id').unsigned().primary();
    // Fields 1-5: Identity
    t.string('indicator_code', 50).unique().notNullable();
    t.string('raw_code', 50).nullable(); // valeur brute avant normalisation
    t.string('strategic_priority', 20).nullable(); // P1..P6, EA..EG → FK strategic_plan.sp_code
    t.integer('goal_id').unsigned().nullable(); // FK → strategic_plan (level goal)
    t.integer('initiative_objective_id').unsigned().nullable(); // FK → strategic_plan (level objective)
    t.text('indicator_name').notNullable();
    // Fields 6-10: Classification
    t.enum('indicator_type', ['Impact', 'Outcome', 'Output', 'Process', 'Input']).notNullable();
    t.enum('standard_custom', ['Standard', 'Custom']).defaultTo('Standard');
    t.integer('tier_id').notNullable().references('tier_id').inTable('tiers');
    t.enum('category', [
      'Global Indicator',
      'Africa-CDC Wide Indicator',
      'Africa-CDC Wide',
      'AU+AfCDC Wide Indicator',
      'Donor-required Indicator'
    ]).nullable();
    t.integer('donor_partner_id').unsigned().nullable().references('id').inTable('partners');
    // Fields 11-15: Definition
    t.text('rationale').nullable();
    t.text('definition').nullable();
    t.string('disaggregation', 300).nullable();
    t.text('numerator').nullable();
    t.text('denominator').nullable();
    // Fields 16-22: Baseline & Targets
    t.string('baseline_value', 100).nullable();
    t.text('baseline_source').nullable();
    t.string('target_fy1', 100).nullable();
    t.string('target_fy2', 100).nullable();
    t.string('target_fy3', 100).nullable();
    t.string('target_fy4', 100).nullable();
    t.string('target_fy5', 100).nullable();
    t.string('overall_target', 100).nullable(); // auto-calculé FY1-FY5
    // Fields 23-29: Data & Responsibility
    t.text('target_justification').nullable();
    t.text('data_source').nullable();
    t.text('data_collection_method').nullable();
    t.enum('reporting_frequency', ['Monthly', 'Quarterly', 'Semi-annually', 'Annually']).nullable();
    t.string('reporting_level', 100).nullable();
    t.string('accountable_division_id', 20).nullable().references('code').inTable('division_codes');
    t.text('contributing_divisions').nullable();
    // Metadata
    t.string('pirs_version', 30).nullable();
    t.boolean('is_active').defaultTo(true);
    t.timestamps(true, true);
  });

  // ═══════════════════════════════════════════
  // D. AMERT HIERARCHY (from PDF Program Budget)
  // ═══════════════════════════════════════════

  await knex.schema.createTable('amert_projects', (t) => {
    t.increments('id').unsigned().primary();
    t.string('project_title', 200).notNullable();
    t.string('department', 200).nullable();
    t.text('moonshot').nullable();
    t.text('au_strategic_objective').nullable();
    t.text('project_purpose').nullable();
    t.text('beneficiaries').nullable();
    t.integer('start_year').notNullable();
    t.integer('end_year').notNullable();
    t.text('project_outcome_title').nullable();
    t.text('report_url').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('amert_outcome_indicators', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('project_id').unsigned().notNullable().references('id').inTable('amert_projects').onDelete('CASCADE');
    t.integer('outcome_number').notNullable();
    t.string('indicator_code', 50).nullable(); // FK → indicators
    t.text('indicator_label').notNullable();
    t.string('baseline', 100).nullable();
    t.string('target_y1', 100).nullable();
    t.string('target_y2', 100).nullable();
    t.string('target_y3', 100).nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('amert_output_groups', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('outcome_indicator_id').unsigned().notNullable().references('id').inTable('amert_outcome_indicators').onDelete('CASCADE');
    t.string('output_code', 10).notNullable(); // '1.1', '1.2', '2.1', etc.
    t.text('output_title').notNullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('amert_output_indicators', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('output_group_id').unsigned().notNullable().references('id').inTable('amert_output_groups').onDelete('CASCADE');
    t.string('indicator_number', 10).notNullable(); // '1.1.1', '1.1.2', etc.
    t.string('indicator_code', 50).nullable(); // FK → indicators (PIRS link)
    t.text('indicator_label').notNullable();
    t.string('measuring_unit', 100).nullable();
    t.string('baseline', 100).nullable();
    t.string('target_y1', 100).nullable();
    t.string('target_y2', 100).nullable();
    t.string('target_y3', 100).nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('amert_output_risks', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('output_group_id').unsigned().notNullable().references('id').inTable('amert_output_groups').onDelete('CASCADE');
    t.integer('risk_number').notNullable();
    t.enum('risk_type', ['Assumption', 'Risk']).defaultTo('Assumption');
    t.text('risk_text').notNullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('amert_activities', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('output_indicator_id').unsigned().notNullable().references('id').inTable('amert_output_indicators').onDelete('CASCADE');
    t.string('activity_code', 30).notNullable(); // Activities1.1.1.01
    t.text('activity_title').notNullable();
    t.string('responsible_division', 200).nullable();
    t.string('pass_through', 100).nullable();
    t.boolean('is_intramural').defaultTo(true);
    t.string('implementing_partner', 200).nullable();
    // Budget (6 columns)
    t.decimal('budget_main', 15, 2).defaultTo(0);
    t.decimal('budget_pass_through', 15, 2).defaultTo(0);
    t.decimal('budget_technical_assistance', 15, 2).defaultTo(0);
    t.decimal('budget_special_projects', 15, 2).defaultTo(0);
    t.decimal('budget_total', 15, 2).defaultTo(0);
    t.decimal('budget_y2_y3', 15, 2).defaultTo(0);
    t.timestamps(true, true);
  });

  // ═══════════════════════════════════════════
  // E. PORTFOLIO & PLANNING (RBM Platform)
  // ═══════════════════════════════════════════

  await knex.schema.createTable('strategic_plans', (t) => {
    t.increments('id').unsigned().primary();
    t.string('code', 50).unique().notNullable();
    t.string('name', 255).notNullable();
    t.enum('status', ['DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED']).defaultTo('DRAFT');
    t.integer('owner_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.integer('business_unit_id').unsigned().nullable().references('id').inTable('business_units').onDelete('SET NULL');
    t.date('start_date').nullable();
    t.date('end_date').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('programs', (t) => {
    t.increments('id').unsigned().primary();
    t.string('code', 50).unique().notNullable();
    t.string('name', 255).notNullable();
    t.text('description').nullable();
    t.enum('status', ['DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED']).defaultTo('DRAFT');
    t.integer('strategic_plan_id').unsigned().nullable().references('id').inTable('strategic_plans').onDelete('SET NULL');
    t.integer('owner_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.integer('business_unit_id').unsigned().nullable().references('id').inTable('business_units').onDelete('SET NULL');
    t.date('start_date').nullable();
    t.date('end_date').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('projects', (t) => {
    t.increments('id').unsigned().primary();
    t.string('code', 50).unique().notNullable();
    t.string('name', 255).notNullable();
    t.text('description').nullable();
    t.enum('status', ['DRAFT', 'IN_REVIEW', 'APPROVED', 'IN_EXECUTION', 'CLOSED', 'ARCHIVED']).defaultTo('DRAFT');
    t.integer('program_id').unsigned().nullable().references('id').inTable('programs').onDelete('SET NULL');
    t.integer('owner_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.integer('business_unit_id').unsigned().nullable().references('id').inTable('business_units').onDelete('SET NULL');
    t.enum('priority', ['LOW', 'MEDIUM', 'HIGH']).defaultTo('MEDIUM');
    t.date('start_date').nullable();
    t.date('end_date').nullable();
    t.timestamps(true, true);
  });

  // ═══════════════════════════════════════════
  // F. RESULTS & LOGFRAME
  // ═══════════════════════════════════════════

  await knex.schema.createTable('results', (t) => {
    t.increments('id').unsigned().primary();
    t.string('code', 50).notNullable();
    t.string('name', 500).notNullable();
    t.text('description').nullable();
    t.enum('level', ['IMPACT', 'OUTCOME', 'OUTPUT']).notNullable();
    t.integer('project_id').unsigned().nullable().references('id').inTable('projects').onDelete('CASCADE');
    t.enum('status', ['DRAFT', 'IN_REVIEW', 'APPROVED']).defaultTo('DRAFT');
    t.integer('owner_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('results_links', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('source_result_id').unsigned().notNullable().references('id').inTable('results').onDelete('CASCADE');
    t.integer('target_result_id').unsigned().notNullable().references('id').inTable('results').onDelete('CASCADE');
    t.enum('link_type', ['CAUSAL', 'CONTRIBUTES_TO']).defaultTo('CAUSAL');
    t.integer('created_by_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('logframe_matrices', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('project_id').unsigned().notNullable().references('id').inTable('projects').onDelete('CASCADE');
    t.integer('version').defaultTo(1);
    t.enum('status', ['DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED']).defaultTo('DRAFT');
    t.integer('created_by_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('logframe_rows', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('logframe_matrix_id').unsigned().notNullable().references('id').inTable('logframe_matrices').onDelete('CASCADE');
    t.enum('level', ['GOAL', 'PURPOSE', 'OUTPUT', 'ACTIVITY']).notNullable();
    t.integer('result_id').unsigned().nullable().references('id').inTable('results').onDelete('SET NULL');
    t.integer('indicator_id').unsigned().nullable().references('id').inTable('indicators').onDelete('SET NULL');
    t.integer('sort_order').defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('assumptions', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('logframe_row_id').unsigned().notNullable().references('id').inTable('logframe_rows').onDelete('CASCADE');
    t.text('description').notNullable();
    t.integer('created_by_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('means_of_verification', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('logframe_row_id').unsigned().notNullable().references('id').inTable('logframe_rows').onDelete('CASCADE');
    t.text('description').notNullable();
    t.string('source', 255).nullable();
    t.string('frequency', 50).nullable();
    t.string('responsible', 255).nullable();
    t.timestamps(true, true);
  });

  // ═══════════════════════════════════════════
  // G. WORKPLANS & EXECUTION
  // ═══════════════════════════════════════════

  await knex.schema.createTable('workplans', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('project_id').unsigned().notNullable().references('id').inTable('projects').onDelete('CASCADE');
    t.enum('period_type', ['ANNUAL', 'QUARTERLY']).defaultTo('ANNUAL');
    t.string('period_label', 50).nullable(); // e.g. '2026', 'Q1-2026'
    t.enum('status', ['DRAFT', 'APPROVED', 'IN_EXECUTION', 'CLOSED']).defaultTo('DRAFT');
    t.integer('owner_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.date('start_date').nullable();
    t.date('end_date').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('workplan_items', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('workplan_id').unsigned().notNullable().references('id').inTable('workplans').onDelete('CASCADE');
    t.string('code', 50).nullable();
    t.string('title', 500).notNullable();
    t.text('description').nullable();
    t.enum('item_type', ['ACTIVITY', 'DELIVERABLE', 'TASK']).defaultTo('ACTIVITY');
    t.enum('status', ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED']).defaultTo('NOT_STARTED');
    t.integer('parent_id').unsigned().nullable().references('id').inTable('workplan_items').onDelete('SET NULL');
    t.integer('owner_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.integer('result_id').unsigned().nullable().references('id').inTable('results').onDelete('SET NULL');
    t.integer('indicator_id').unsigned().nullable().references('id').inTable('indicators').onDelete('SET NULL');
    t.enum('priority', ['LOW', 'MEDIUM', 'HIGH']).defaultTo('MEDIUM');
    t.decimal('percent_complete', 5, 2).defaultTo(0);
    t.date('start_date').nullable();
    t.date('end_date').nullable();
    // Quarter flags for activity scheduling
    t.boolean('q1_active').defaultTo(false);
    t.boolean('q2_active').defaultTo(false);
    t.boolean('q3_active').defaultTo(false);
    t.boolean('q4_active').defaultTo(false);
    t.integer('assignee_user_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.string('responsible_division', 200).nullable();
    t.text('contributing_divisions').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('milestones', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('workplan_id').unsigned().notNullable().references('id').inTable('workplans').onDelete('CASCADE');
    t.string('name', 255).notNullable();
    t.date('due_date').nullable();
    t.enum('status', ['PENDING', 'ACHIEVED', 'MISSED']).defaultTo('PENDING');
    t.integer('owner_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('workplan_dependencies', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('source_item_id').unsigned().notNullable().references('id').inTable('workplan_items').onDelete('CASCADE');
    t.integer('target_item_id').unsigned().notNullable().references('id').inTable('workplan_items').onDelete('CASCADE');
    t.enum('dependency_type', ['FS', 'SS', 'FF']).defaultTo('FS');
    t.timestamps(true, true);
  });

  // ═══════════════════════════════════════════
  // H. M&E TRACKING
  // ═══════════════════════════════════════════

  await knex.schema.createTable('indicator_baselines', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('indicator_id').unsigned().notNullable().references('id').inTable('indicators').onDelete('CASCADE');
    t.string('baseline_value', 100).nullable();
    t.string('baseline_period', 50).nullable(); // e.g. '2023'
    t.text('source').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('indicator_targets', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('indicator_id').unsigned().notNullable().references('id').inTable('indicators').onDelete('CASCADE');
    t.string('target_value', 100).nullable();
    t.string('target_period', 50).nullable(); // e.g. '2026-Q1'
    t.timestamps(true, true);
  });

  await knex.schema.createTable('indicator_disaggregations', (t) => {
    t.increments('id').unsigned().primary();
    t.string('name', 100).notNullable(); // GENDER, AGE, REGION, etc.
    t.text('description').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('data_collection_schedules', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('indicator_id').unsigned().notNullable().references('id').inTable('indicators').onDelete('CASCADE');
    t.enum('frequency', ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']).notNullable();
    t.integer('responsible_unit_id').unsigned().nullable().references('id').inTable('business_units').onDelete('SET NULL');
    t.string('method', 255).nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('indicator_achievements', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('indicator_id').unsigned().notNullable().references('id').inTable('indicators').onDelete('CASCADE');
    t.string('value', 100).notNullable();
    t.string('period', 50).notNullable(); // e.g. '2026-Q1'
    t.enum('status', ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']).defaultTo('DRAFT');
    t.integer('collected_by_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.date('collected_date').nullable();
    t.text('comments').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('achievement_disaggregations', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('achievement_id').unsigned().notNullable().references('id').inTable('indicator_achievements').onDelete('CASCADE');
    t.integer('disaggregation_id').unsigned().notNullable().references('id').inTable('indicator_disaggregations').onDelete('CASCADE');
    t.string('value', 100).nullable();
    t.timestamps(true, true);
  });

  // evidence_files — created in dedicated migration 20240229000000_create_evidence_files.js

  await knex.schema.createTable('dqa_assessments', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('project_id').unsigned().nullable().references('id').inTable('projects').onDelete('CASCADE');
    t.string('assessment_period', 50).nullable();
    t.enum('status', ['DRAFT', 'FINALIZED', 'FOLLOW_UP']).defaultTo('DRAFT');
    t.integer('lead_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.text('summary').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('dqa_findings', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('assessment_id').unsigned().notNullable().references('id').inTable('dqa_assessments').onDelete('CASCADE');
    t.integer('indicator_id').unsigned().nullable().references('id').inTable('indicators').onDelete('SET NULL');
    t.enum('dimension', ['COMPLETENESS', 'TIMELINESS', 'CONSISTENCY', 'VALIDITY', 'INTEGRITY']).notNullable();
    t.integer('score').nullable(); // 1-5
    t.text('finding').nullable();
    t.text('recommendation').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('evaluations', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('project_id').unsigned().nullable().references('id').inTable('projects').onDelete('CASCADE');
    t.enum('eval_type', ['MID_TERM', 'FINAL', 'THEMATIC']).notNullable();
    t.string('title', 255).notNullable();
    t.text('findings').nullable();
    t.text('recommendations').nullable();
    t.text('management_response').nullable();
    t.enum('status', ['PLANNED', 'IN_PROGRESS', 'COMPLETED']).defaultTo('PLANNED');
    t.integer('lead_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('lessons_learned', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('project_id').unsigned().nullable().references('id').inTable('projects').onDelete('CASCADE');
    t.string('title', 255).notNullable();
    t.text('description').nullable();
    t.text('action_taken').nullable();
    t.integer('created_by_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('strategy_adjustments', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('project_id').unsigned().nullable().references('id').inTable('projects').onDelete('CASCADE');
    t.string('title', 255).notNullable();
    t.text('justification').nullable();
    t.text('changes_description').nullable();
    t.enum('status', ['PROPOSED', 'APPROVED', 'IMPLEMENTED']).defaultTo('PROPOSED');
    t.integer('proposed_by_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
  });

  // ═══════════════════════════════════════════
  // I. FINANCE & BUDGET
  // ═══════════════════════════════════════════

  await knex.schema.createTable('budgets', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('project_id').unsigned().notNullable().references('id').inTable('projects').onDelete('CASCADE');
    t.enum('status', ['DRAFT', 'IN_REVIEW', 'APPROVED', 'LOCKED']).defaultTo('DRAFT');
    t.decimal('total_amount', 15, 2).defaultTo(0);
    t.string('currency', 10).defaultTo('USD');
    t.integer('owner_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.string('period', 50).nullable();
    t.timestamps(true, true);
  });

  // budget_lines — created in dedicated migration 20240225000000_create_budget_lines.js

  await knex.schema.createTable('expenditures', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('project_id').unsigned().notNullable().references('id').inTable('projects').onDelete('CASCADE');
    t.integer('budget_line_id').unsigned().nullable(); // FK to budget_lines added after migration 20240225 creates the table
    t.integer('sap_budget_code_id').unsigned().nullable().references('id').inTable('sap_budget_codes').onDelete('SET NULL');
    t.decimal('amount', 15, 2).notNullable();
    t.date('expenditure_date').notNullable();
    t.text('description').nullable();
    t.enum('status', ['PENDING', 'VERIFIED', 'RECONCILED']).defaultTo('PENDING');
    t.timestamps(true, true);
  });

  // ═══════════════════════════════════════════
  // J. REPORTING
  // ═══════════════════════════════════════════

  await knex.schema.createTable('report_templates', (t) => {
    t.increments('id').unsigned().primary();
    t.string('name', 255).notNullable();
    t.enum('report_type', ['QPR', 'APR', 'DONOR', 'IATI', 'SCORECARD', 'CUSTOM']).notNullable();
    t.text('description').nullable();
    t.json('template_json').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('reports', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('project_id').unsigned().nullable().references('id').inTable('projects').onDelete('CASCADE');
    t.integer('template_id').unsigned().nullable().references('id').inTable('report_templates').onDelete('SET NULL');
    t.string('title', 255).notNullable();
    t.string('period', 50).nullable();
    t.enum('status', ['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED']).defaultTo('DRAFT');
    t.integer('owner_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.json('parameters').nullable();
    t.datetime('generated_date').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('report_sections', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('report_id').unsigned().notNullable().references('id').inTable('reports').onDelete('CASCADE');
    t.string('section_key', 100).notNullable();
    t.string('title', 255).nullable();
    t.text('content').nullable();
    t.integer('sort_order').defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('generated_files', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('report_id').unsigned().notNullable().references('id').inTable('reports').onDelete('CASCADE');
    t.string('file_path', 500).notNullable();
    t.enum('file_type', ['PDF', 'EXCEL', 'WORD']).notNullable();
    t.timestamps(true, true);
  });

  // ═══════════════════════════════════════════
  // K. GOVERNANCE & AUDIT
  // ═══════════════════════════════════════════

  await knex.schema.createTable('approval_instances', (t) => {
    t.increments('id').unsigned().primary();
    t.string('entity_type', 50).notNullable(); // STRATEGIC_PLAN, PROGRAM, PROJECT, BUDGET, REPORT, etc.
    t.integer('entity_id').unsigned().notNullable();
    t.enum('status', ['PENDING', 'APPROVED', 'REJECTED']).defaultTo('PENDING');
    t.integer('initiated_by_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.datetime('initiated_date').nullable();
    t.timestamps(true, true);
    t.index(['entity_type', 'entity_id']);
  });

  await knex.schema.createTable('approval_steps', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('approval_instance_id').unsigned().notNullable().references('id').inTable('approval_instances').onDelete('CASCADE');
    t.integer('step_order').notNullable();
    t.enum('decision', ['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED']).defaultTo('PENDING');
    t.integer('assigned_to_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.datetime('completed_date').nullable();
    t.text('comments').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('version_snapshots', (t) => {
    t.increments('id').unsigned().primary();
    t.string('entity_type', 50).notNullable();
    t.integer('entity_id').unsigned().notNullable();
    t.integer('version_number').notNullable();
    t.json('snapshot_data').nullable();
    t.integer('created_by_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);
    t.index(['entity_type', 'entity_id']);
  });

  await knex.schema.createTable('audit_events', (t) => {
    t.increments('id').unsigned().primary();
    t.string('entity_type', 50).notNullable();
    t.integer('entity_id').unsigned().nullable();
    t.enum('action', ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'SUBMIT', 'ARCHIVE']).notNullable();
    t.integer('actor_id').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.json('details').nullable();
    t.datetime('timestamp').defaultTo(knex.fn.now());
    t.index(['entity_type', 'entity_id']);
    t.index('actor_id');
    t.index('timestamp');
  });

  await knex.schema.createTable('notifications', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('entity_type', 50).nullable();
    t.integer('entity_id').unsigned().nullable();
    t.text('message').notNullable();
    t.boolean('is_read').defaultTo(false);
    t.timestamps(true, true);
    t.index('user_id');
  });

  // ═══════════════════════════════════════════
  // L. TRACKING TABLES (big_tickets, pirs_completion, donor_results)
  // ═══════════════════════════════════════════

  await knex.schema.createTable('big_tickets', (t) => {
    t.increments('id').unsigned().primary();
    t.text('priority').nullable();
    t.text('contributing_enabler').nullable();
    t.text('objective').nullable();
    t.text('strategic_area').notNullable();
    t.string('indicator_code', 50).nullable(); // FK → indicators (nullable)
    t.enum('indicator_type', ['Output', 'Outcome']).nullable();
    t.string('result_level', 20).nullable(); // 'Tier 3', 'Tier 4'
    t.string('primary_responsibility', 200).nullable();
    t.text('q1_achievement').nullable();
    t.text('q1_comments').nullable();
    t.text('q2_achievement').nullable();
    t.text('q2_comments').nullable();
    t.text('q3_achievement').nullable();
    t.text('q3_comments').nullable();
    t.text('q4_achievement').nullable();
    t.text('q4_comments').nullable();
    t.text('areas_of_interlinkage').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('pirs_completion_stats', (t) => {
    t.increments('id').unsigned().primary();
    t.string('sp_code', 10).nullable(); // FK → strategic_plan.sp_code
    t.string('priority_label', 200).nullable();
    t.decimal('t1_completion', 5, 2).nullable();
    t.decimal('t2_completion', 5, 2).nullable();
    t.decimal('t3_completion', 5, 2).nullable();
    t.decimal('t4_completion', 5, 2).nullable();
    t.string('responsible', 200).nullable();
    t.timestamps(true, true);
  });

  // Donor Results Frameworks
  await knex.schema.createTable('donor_results_afdb', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('partner_id').unsigned().nullable().references('id').inTable('partners');
    t.string('indicator_code', 50).nullable();
    t.text('indicator_name').nullable();
    t.enum('status', ['Retained', 'Repurposed', 'Dropped', 'New Activity based on other repurposed activities']).nullable();
    t.string('baseline', 100).nullable();
    t.string('target', 100).nullable();
    t.string('actual', 100).nullable();
    t.decimal('achievement_pct', 5, 2).nullable();
    t.text('comments').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('donor_results_gavi', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('partner_id').unsigned().nullable().references('id').inTable('partners');
    t.string('mou_priority_area', 200).nullable();
    t.string('indicator_code', 50).nullable();
    t.text('indicator_name').nullable();
    t.string('baseline', 100).nullable();
    t.string('target', 100).nullable();
    t.string('actual_feb', 100).nullable();
    t.string('actual_aug', 100).nullable();
    t.text('comments').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('donor_results_mastercard', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('partner_id').unsigned().nullable().references('id').inTable('partners');
    t.string('indicator_code', 50).nullable();
    t.text('indicator_name').nullable();
    t.integer('tier_id').nullable();
    t.string('baseline', 100).nullable();
    t.string('target', 100).nullable();
    t.string('actual', 100).nullable();
    t.text('comments').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('donor_results_unicef', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('partner_id').unsigned().nullable().references('id').inTable('partners');
    t.string('indicator_code', 50).nullable();
    t.text('indicator_name').nullable();
    t.string('thematic_area', 200).nullable();
    t.string('baseline', 100).nullable();
    t.string('target', 100).nullable();
    t.string('actual', 100).nullable();
    t.text('comments').nullable();
    t.timestamps(true, true);
  });

  await knex.schema.createTable('donor_results_worldbank', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('partner_id').unsigned().nullable().references('id').inTable('partners');
    t.enum('indicator_category', ['PDO', 'INTERMEDIATE']).nullable();
    t.string('indicator_code', 50).nullable();
    t.text('indicator_name').nullable();
    t.string('component', 100).nullable();
    t.string('baseline', 100).nullable();
    t.string('end_target', 100).nullable();
    t.string('actual', 100).nullable();
    t.text('comments').nullable();
    t.timestamps(true, true);
  });
};


exports.down = async function (knex) {
  const tables = [
    // L. Tracking
    'donor_results_worldbank', 'donor_results_unicef', 'donor_results_mastercard',
    'donor_results_gavi', 'donor_results_afdb', 'pirs_completion_stats', 'big_tickets',
    // K. Governance
    'notifications', 'audit_events', 'version_snapshots', 'approval_steps', 'approval_instances',
    // J. Reporting
    'generated_files', 'report_sections', 'reports', 'report_templates',
    // I. Finance (budget_lines dropped by its own migration 20240225)
    'expenditures', 'budgets',
    // H. M&E
    'strategy_adjustments', 'lessons_learned', 'evaluations',
    'dqa_findings', 'dqa_assessments',
    // evidence_files dropped by its own migration 20240229
    'achievement_disaggregations', 'indicator_achievements',
    'data_collection_schedules', 'indicator_disaggregations',
    'indicator_targets', 'indicator_baselines',
    // G. Workplans
    'workplan_dependencies', 'milestones', 'workplan_items', 'workplans',
    // F. Results & Logframe
    'means_of_verification', 'assumptions', 'logframe_rows', 'logframe_matrices',
    'results_links', 'results',
    // E. Portfolio
    'projects', 'programs', 'strategic_plans',
    // D. AMERT
    'amert_activities', 'amert_output_risks', 'amert_output_indicators',
    'amert_output_groups', 'amert_outcome_indicators', 'amert_projects',
    // C. Indicators
    'indicators',
    // B. Reference
    'exchange_rates', 'funding_sources', 'sap_budget_codes',
    'partners', 'division_codes', 'strategic_plan', 'tiers', 'member_states',
    // A. Identity
    'partner_access_scopes', 'partner_organizations',
    'team_members', 'teams', 'user_roles', 'roles', 'users', 'business_units',
  ];

  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
};
