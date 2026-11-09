const fs = require('fs');
const path = require('path');

exports.up = function (knex) {
  const sqlPath = path.join(__dirname, '../rbm_schema_postgres_v2.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  return knex.raw(sql);
};

exports.down = function (knex) {
  return knex.raw(
    [
      'DROP TABLE IF EXISTS expenditures CASCADE;',
      'DROP TABLE IF EXISTS budget_lines CASCADE;',
      'DROP TABLE IF EXISTS budgets CASCADE;',
      'DROP TABLE IF EXISTS strategy_adjustments CASCADE;',
      'DROP TABLE IF EXISTS lessons_learned CASCADE;',
      'DROP TABLE IF EXISTS evaluations CASCADE;',
      'DROP TABLE IF EXISTS dqa_findings CASCADE;',
      'DROP TABLE IF EXISTS dqa_assessments CASCADE;',
      'DROP TABLE IF EXISTS evidence_files CASCADE;',
      'DROP TABLE IF EXISTS achievement_disaggregations CASCADE;',
      'DROP TABLE IF EXISTS indicator_achievements CASCADE;',
      'DROP TABLE IF EXISTS data_collection_schedules CASCADE;',
      'DROP TABLE IF EXISTS indicator_disaggregations CASCADE;',
      'DROP TABLE IF EXISTS indicator_targets CASCADE;',
      'DROP TABLE IF EXISTS indicator_baselines CASCADE;',
      'DROP TABLE IF EXISTS indicators CASCADE;',
      'DROP TABLE IF EXISTS progress_updates CASCADE;',
      'DROP TABLE IF EXISTS workplan_dependencies CASCADE;',
      'DROP TABLE IF EXISTS milestones CASCADE;',
      'DROP TABLE IF EXISTS workplan_items CASCADE;',
      'DROP TABLE IF EXISTS workplans CASCADE;',
      'DROP TABLE IF EXISTS assumptions CASCADE;',
      'DROP TABLE IF EXISTS logframe_rows CASCADE;',
      'DROP TABLE IF EXISTS logframe_matrices CASCADE;',
      'DROP TABLE IF EXISTS means_of_verification CASCADE;',
      'DROP TABLE IF EXISTS results_links CASCADE;',
      'DROP TABLE IF EXISTS results CASCADE;',
      'DROP TABLE IF EXISTS version_snapshots CASCADE;',
      'DROP TABLE IF EXISTS approval_steps CASCADE;',
      'DROP TABLE IF EXISTS approval_instances CASCADE;',
      'DROP TABLE IF EXISTS projects CASCADE;',
      'DROP TABLE IF EXISTS programs CASCADE;',
      'DROP TABLE IF EXISTS strategic_objectives CASCADE;',
      'DROP TABLE IF EXISTS strategic_plans CASCADE;',
      'DROP TABLE IF EXISTS exchange_rates CASCADE;',
      'DROP TABLE IF EXISTS funding_sources CASCADE;',
      'DROP TABLE IF EXISTS sap_budget_codes CASCADE;',
      'DROP TABLE IF EXISTS partner_access_scopes CASCADE;',
      'DROP TABLE IF EXISTS team_members CASCADE;',
      'DROP TABLE IF EXISTS teams CASCADE;',
      'DROP TABLE IF EXISTS user_roles CASCADE;',
      'DROP TABLE IF EXISTS roles CASCADE;',
      'DROP TABLE IF EXISTS users CASCADE;',
      'DROP TABLE IF EXISTS partner_organizations CASCADE;',
      'DROP TABLE IF EXISTS countries CASCADE;',
      'DROP TABLE IF EXISTS business_units CASCADE;'
    ].join('\n')
  );
};
