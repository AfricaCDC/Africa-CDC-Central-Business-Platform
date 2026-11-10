/**
 * Drop 20 legacy tables left without code (D-20261106-14).
 *
 * The AMERT, monitoring, activity tracking, strategy, teams and budget-line
 * routes were removed with their pages (D-20261106-13). Verified in
 * production on 2026-11-06: 0 rows each, no view, and the only foreign keys
 * pointing at them come from tables of this same list. Children first.
 *
 * Kept: legacy tables still named by live code or holding rows
 * (indicators, results, workplan_items, workplans, programs, projects,
 * member_states, indicator_actuals, division_activity_reports,
 * indicator_reports). See OBSOLETE.md.
 *
 * `down` recreates the structures (empty), from the CREATE statements
 * captured in production on 2026-11-06.
 */

// Children first.
const DROP_ORDER = Object.freeze([
  'amert_activities',
  'amert_output_risks',
  'amert_output_indicators',
  'amert_output_groups',
  'amert_outcome_indicators',
  'amert_projects',
  'achievement_disaggregations',
  'indicator_achievements',
  'dqa_findings',
  'dqa_assessments',
  'activity_checkins',
  'activity_logs',
  'evaluations',
  'indicator_targets',
  'strategy_adjustments',
  'lessons_learned',
  'milestones',
  'version_snapshots',
  'teams',
  'budget_lines',
]);

const RECREATE_SQL = Object.freeze({
  amert_activities: `CREATE TABLE \`amert_activities\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`output_indicator_id\` int unsigned NOT NULL,
  \`activity_code\` varchar(30) COLLATE utf8mb4_general_ci NOT NULL,
  \`activity_title\` text COLLATE utf8mb4_general_ci NOT NULL,
  \`responsible_division\` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`responsible_division_code\` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`pass_through\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`is_intramural\` tinyint(1) DEFAULT '1',
  \`implementing_partner\` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`budget_main\` decimal(15,2) DEFAULT '0.00',
  \`budget_pass_through\` decimal(15,2) DEFAULT '0.00',
  \`budget_technical_assistance\` decimal(15,2) DEFAULT '0.00',
  \`budget_special_projects\` decimal(15,2) DEFAULT '0.00',
  \`budget_total\` decimal(15,2) DEFAULT '0.00',
  \`budget_y2_y3\` decimal(15,2) DEFAULT '0.00',
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`amert_activities_output_indicator_id_foreign\` (\`output_indicator_id\`),
  KEY \`idx_amert_act_div_code\` (\`responsible_division_code\`),
  CONSTRAINT \`amert_activities_output_indicator_id_foreign\` FOREIGN KEY (\`output_indicator_id\`) REFERENCES \`amert_output_indicators\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`amert_activities_responsible_division_code_foreign\` FOREIGN KEY (\`responsible_division_code\`) REFERENCES \`division_codes\` (\`code\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  amert_output_risks: `CREATE TABLE \`amert_output_risks\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`output_group_id\` int unsigned NOT NULL,
  \`risk_number\` int NOT NULL,
  \`risk_type\` enum('Assumption','Risk') COLLATE utf8mb4_general_ci DEFAULT 'Assumption',
  \`risk_text\` text COLLATE utf8mb4_general_ci NOT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`amert_output_risks_output_group_id_foreign\` (\`output_group_id\`),
  CONSTRAINT \`amert_output_risks_output_group_id_foreign\` FOREIGN KEY (\`output_group_id\`) REFERENCES \`amert_output_groups\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  amert_output_indicators: `CREATE TABLE \`amert_output_indicators\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`output_group_id\` int unsigned NOT NULL,
  \`indicator_number\` varchar(10) COLLATE utf8mb4_general_ci NOT NULL,
  \`indicator_code\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`indicator_label\` text COLLATE utf8mb4_general_ci NOT NULL,
  \`measuring_unit\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`baseline\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`target_y1\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`target_y2\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`target_y3\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`amert_output_indicators_output_group_id_foreign\` (\`output_group_id\`),
  CONSTRAINT \`amert_output_indicators_output_group_id_foreign\` FOREIGN KEY (\`output_group_id\`) REFERENCES \`amert_output_groups\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  amert_output_groups: `CREATE TABLE \`amert_output_groups\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`outcome_indicator_id\` int unsigned NOT NULL,
  \`output_code\` varchar(10) COLLATE utf8mb4_general_ci NOT NULL,
  \`output_title\` text COLLATE utf8mb4_general_ci NOT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`amert_output_groups_outcome_indicator_id_foreign\` (\`outcome_indicator_id\`),
  CONSTRAINT \`amert_output_groups_outcome_indicator_id_foreign\` FOREIGN KEY (\`outcome_indicator_id\`) REFERENCES \`amert_outcome_indicators\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  amert_outcome_indicators: `CREATE TABLE \`amert_outcome_indicators\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`project_id\` int unsigned NOT NULL,
  \`outcome_number\` int NOT NULL,
  \`indicator_code\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`indicator_label\` text COLLATE utf8mb4_general_ci NOT NULL,
  \`baseline\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`target_y1\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`target_y2\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`target_y3\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`amert_outcome_indicators_project_id_foreign\` (\`project_id\`),
  CONSTRAINT \`amert_outcome_indicators_project_id_foreign\` FOREIGN KEY (\`project_id\`) REFERENCES \`amert_projects\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  amert_projects: `CREATE TABLE \`amert_projects\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`project_title\` varchar(200) COLLATE utf8mb4_general_ci NOT NULL,
  \`department\` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`moonshot\` text COLLATE utf8mb4_general_ci,
  \`au_strategic_objective\` text COLLATE utf8mb4_general_ci,
  \`project_purpose\` text COLLATE utf8mb4_general_ci,
  \`beneficiaries\` text COLLATE utf8mb4_general_ci,
  \`start_year\` int NOT NULL,
  \`end_year\` int NOT NULL,
  \`project_outcome_title\` text COLLATE utf8mb4_general_ci,
  \`report_url\` text COLLATE utf8mb4_general_ci,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  achievement_disaggregations: `CREATE TABLE \`achievement_disaggregations\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`achievement_id\` int unsigned NOT NULL,
  \`disaggregation_id\` int unsigned NOT NULL,
  \`value\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`achievement_disaggregations_achievement_id_foreign\` (\`achievement_id\`),
  KEY \`achievement_disaggregations_disaggregation_id_foreign\` (\`disaggregation_id\`),
  CONSTRAINT \`achievement_disaggregations_achievement_id_foreign\` FOREIGN KEY (\`achievement_id\`) REFERENCES \`indicator_achievements\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`achievement_disaggregations_disaggregation_id_foreign\` FOREIGN KEY (\`disaggregation_id\`) REFERENCES \`indicator_disaggregations\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  indicator_achievements: `CREATE TABLE \`indicator_achievements\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`indicator_id\` int unsigned NOT NULL,
  \`value\` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  \`period\` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  \`status\` enum('DRAFT','SUBMITTED','APPROVED','REJECTED') COLLATE utf8mb4_general_ci DEFAULT 'DRAFT',
  \`collected_by_id\` int unsigned DEFAULT NULL,
  \`collected_date\` date DEFAULT NULL,
  \`comments\` text COLLATE utf8mb4_general_ci,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`indicator_achievements_indicator_id_foreign\` (\`indicator_id\`),
  KEY \`indicator_achievements_collected_by_id_foreign\` (\`collected_by_id\`),
  CONSTRAINT \`indicator_achievements_collected_by_id_foreign\` FOREIGN KEY (\`collected_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`indicator_achievements_indicator_id_foreign\` FOREIGN KEY (\`indicator_id\`) REFERENCES \`indicators\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  dqa_findings: `CREATE TABLE \`dqa_findings\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`assessment_id\` int unsigned NOT NULL,
  \`indicator_id\` int unsigned DEFAULT NULL,
  \`dimension\` enum('COMPLETENESS','TIMELINESS','CONSISTENCY','VALIDITY','INTEGRITY') COLLATE utf8mb4_general_ci NOT NULL,
  \`score\` int DEFAULT NULL,
  \`finding\` text COLLATE utf8mb4_general_ci,
  \`recommendation\` text COLLATE utf8mb4_general_ci,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`dqa_findings_assessment_id_foreign\` (\`assessment_id\`),
  KEY \`dqa_findings_indicator_id_foreign\` (\`indicator_id\`),
  CONSTRAINT \`dqa_findings_assessment_id_foreign\` FOREIGN KEY (\`assessment_id\`) REFERENCES \`dqa_assessments\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`dqa_findings_indicator_id_foreign\` FOREIGN KEY (\`indicator_id\`) REFERENCES \`indicators\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  dqa_assessments: `CREATE TABLE \`dqa_assessments\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`project_id\` int unsigned DEFAULT NULL,
  \`assessment_period\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`status\` enum('DRAFT','FINALIZED','FOLLOW_UP') COLLATE utf8mb4_general_ci DEFAULT 'DRAFT',
  \`lead_id\` int unsigned DEFAULT NULL,
  \`summary\` text COLLATE utf8mb4_general_ci,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`dqa_assessments_project_id_foreign\` (\`project_id\`),
  KEY \`dqa_assessments_lead_id_foreign\` (\`lead_id\`),
  CONSTRAINT \`dqa_assessments_lead_id_foreign\` FOREIGN KEY (\`lead_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`dqa_assessments_project_id_foreign\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  activity_checkins: `CREATE TABLE \`activity_checkins\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`workplan_item_id\` int unsigned NOT NULL,
  \`user_id\` int unsigned DEFAULT NULL,
  \`week_date\` date NOT NULL,
  \`status\` enum('ON_TRACK','AT_RISK','BLOCKED') COLLATE utf8mb4_general_ci DEFAULT 'ON_TRACK',
  \`progress_pct\` int DEFAULT '0',
  \`note\` text COLLATE utf8mb4_general_ci,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`activity_checkins_workplan_item_id_week_date_unique\` (\`workplan_item_id\`,\`week_date\`),
  KEY \`activity_checkins_user_id_foreign\` (\`user_id\`),
  CONSTRAINT \`activity_checkins_user_id_foreign\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`activity_checkins_workplan_item_id_foreign\` FOREIGN KEY (\`workplan_item_id\`) REFERENCES \`workplan_items\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  activity_logs: `CREATE TABLE \`activity_logs\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`workplan_item_id\` int unsigned NOT NULL,
  \`user_id\` int unsigned DEFAULT NULL,
  \`log_date\` date NOT NULL,
  \`entry\` text COLLATE utf8mb4_general_ci NOT NULL,
  \`tag\` enum('progress','blocker','deliverable','note') COLLATE utf8mb4_general_ci DEFAULT 'note',
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`activity_logs_workplan_item_id_foreign\` (\`workplan_item_id\`),
  KEY \`activity_logs_user_id_foreign\` (\`user_id\`),
  CONSTRAINT \`activity_logs_user_id_foreign\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`activity_logs_workplan_item_id_foreign\` FOREIGN KEY (\`workplan_item_id\`) REFERENCES \`workplan_items\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  evaluations: `CREATE TABLE \`evaluations\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`project_id\` int unsigned DEFAULT NULL,
  \`eval_type\` enum('MID_TERM','FINAL','THEMATIC') COLLATE utf8mb4_general_ci NOT NULL,
  \`title\` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  \`findings\` text COLLATE utf8mb4_general_ci,
  \`recommendations\` text COLLATE utf8mb4_general_ci,
  \`management_response\` text COLLATE utf8mb4_general_ci,
  \`status\` enum('PLANNED','IN_PROGRESS','COMPLETED') COLLATE utf8mb4_general_ci DEFAULT 'PLANNED',
  \`lead_id\` int unsigned DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`evaluations_project_id_foreign\` (\`project_id\`),
  KEY \`evaluations_lead_id_foreign\` (\`lead_id\`),
  CONSTRAINT \`evaluations_lead_id_foreign\` FOREIGN KEY (\`lead_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`evaluations_project_id_foreign\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  indicator_targets: `CREATE TABLE \`indicator_targets\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`indicator_id\` int unsigned NOT NULL,
  \`target_value\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`target_period\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`indicator_targets_indicator_id_foreign\` (\`indicator_id\`),
  CONSTRAINT \`indicator_targets_indicator_id_foreign\` FOREIGN KEY (\`indicator_id\`) REFERENCES \`indicators\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  strategy_adjustments: `CREATE TABLE \`strategy_adjustments\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`project_id\` int unsigned DEFAULT NULL,
  \`title\` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  \`justification\` text COLLATE utf8mb4_general_ci,
  \`changes_description\` text COLLATE utf8mb4_general_ci,
  \`status\` enum('PROPOSED','APPROVED','IMPLEMENTED') COLLATE utf8mb4_general_ci DEFAULT 'PROPOSED',
  \`proposed_by_id\` int unsigned DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`strategy_adjustments_project_id_foreign\` (\`project_id\`),
  KEY \`strategy_adjustments_proposed_by_id_foreign\` (\`proposed_by_id\`),
  CONSTRAINT \`strategy_adjustments_project_id_foreign\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`strategy_adjustments_proposed_by_id_foreign\` FOREIGN KEY (\`proposed_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  lessons_learned: `CREATE TABLE \`lessons_learned\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`project_id\` int unsigned DEFAULT NULL,
  \`title\` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  \`description\` text COLLATE utf8mb4_general_ci,
  \`action_taken\` text COLLATE utf8mb4_general_ci,
  \`created_by_id\` int unsigned DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`lessons_learned_project_id_foreign\` (\`project_id\`),
  KEY \`lessons_learned_created_by_id_foreign\` (\`created_by_id\`),
  CONSTRAINT \`lessons_learned_created_by_id_foreign\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`lessons_learned_project_id_foreign\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  milestones: `CREATE TABLE \`milestones\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`workplan_id\` int unsigned NOT NULL,
  \`name\` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  \`due_date\` date DEFAULT NULL,
  \`status\` enum('PENDING','ACHIEVED','MISSED') COLLATE utf8mb4_general_ci DEFAULT 'PENDING',
  \`owner_id\` int unsigned DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`milestones_workplan_id_foreign\` (\`workplan_id\`),
  KEY \`milestones_owner_id_foreign\` (\`owner_id\`),
  CONSTRAINT \`milestones_owner_id_foreign\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`milestones_workplan_id_foreign\` FOREIGN KEY (\`workplan_id\`) REFERENCES \`workplans\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  version_snapshots: `CREATE TABLE \`version_snapshots\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`entity_type\` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  \`entity_id\` int unsigned NOT NULL,
  \`version_number\` int NOT NULL,
  \`snapshot_data\` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  \`created_by_id\` int unsigned DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`version_snapshots_created_by_id_foreign\` (\`created_by_id\`),
  KEY \`version_snapshots_entity_type_entity_id_index\` (\`entity_type\`,\`entity_id\`),
  CONSTRAINT \`version_snapshots_created_by_id_foreign\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`version_snapshots_chk_1\` CHECK (json_valid(\`snapshot_data\`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  teams: `CREATE TABLE \`teams\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`name\` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  \`description\` text COLLATE utf8mb4_general_ci,
  \`owner_id\` int unsigned DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`teams_owner_id_foreign\` (\`owner_id\`),
  CONSTRAINT \`teams_owner_id_foreign\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  budget_lines: `CREATE TABLE \`budget_lines\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`project_id\` int unsigned DEFAULT NULL,
  \`fiscal_year\` varchar(10) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '2026',
  \`bu_code\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`bu_name\` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`seq_no\` int DEFAULT NULL,
  \`amert_code\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`budget_code\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`fund_code\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`fund_description\` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`functional_area\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`workplan_item_id\` int unsigned DEFAULT NULL,
  \`result_id\` int unsigned DEFAULT NULL,
  \`activity_title\` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`amount\` decimal(15,2) DEFAULT '0.00',
  \`technical_assistance\` decimal(15,2) DEFAULT '0.00',
  \`main_budget\` decimal(15,2) DEFAULT '0.00',
  \`amert_approval\` decimal(15,2) DEFAULT '0.00',
  \`ip_member_states\` decimal(15,2) DEFAULT '0.00',
  \`ip_afdb\` decimal(15,2) DEFAULT '0.00',
  \`ip_canada\` decimal(15,2) DEFAULT '0.00',
  \`ip_cepi\` decimal(15,2) DEFAULT '0.00',
  \`ip_ecdc\` decimal(15,2) DEFAULT '0.00',
  \`ip_eu_hera\` decimal(15,2) DEFAULT '0.00',
  \`ip_fcdo\` decimal(15,2) DEFAULT '0.00',
  \`ip_gavi\` decimal(15,2) DEFAULT '0.00',
  \`ip_indirect_cost\` decimal(15,2) DEFAULT '0.00',
  \`ip_korea_dca\` decimal(15,2) DEFAULT '0.00',
  \`ip_korea_fund\` decimal(15,2) DEFAULT '0.00',
  \`ip_mastercard\` decimal(15,2) DEFAULT '0.00',
  \`ip_sbtf\` decimal(15,2) DEFAULT '0.00',
  \`ip_team_europe\` decimal(15,2) DEFAULT '0.00',
  \`ip_unicef\` decimal(15,2) DEFAULT '0.00',
  \`ip_welcome_trust\` decimal(15,2) DEFAULT '0.00',
  \`ip_world_bank\` decimal(15,2) DEFAULT '0.00',
  \`ip_world_diabetic\` decimal(15,2) DEFAULT '0.00',
  \`total_ips\` decimal(15,2) DEFAULT '0.00',
  \`gap\` decimal(15,2) DEFAULT '0.00',
  \`remarks\` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`archived_at\` timestamp NULL DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`budget_lines_project_id_foreign\` (\`project_id\`),
  KEY \`budget_lines_workplan_item_id_foreign\` (\`workplan_item_id\`),
  KEY \`budget_lines_result_id_foreign\` (\`result_id\`),
  CONSTRAINT \`budget_lines_project_id_foreign\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`budget_lines_result_id_foreign\` FOREIGN KEY (\`result_id\`) REFERENCES \`results\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`budget_lines_workplan_item_id_foreign\` FOREIGN KEY (\`workplan_item_id\`) REFERENCES \`workplan_items\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
});

exports.up = async (knex) => {
  // Guard: every table was empty at the audit. Refuse to drop data written since.
  const withRows = [];
  for (const table of DROP_ORDER) {
    if (!(await knex.schema.hasTable(table))) continue;
    const [{ n }] = await knex(table).count('* as n');
    if (Number(n) > 0) withRows.push(`${table} (${n})`);
  }
  if (withRows.length) throw new Error(`Not dropped, these tables have rows: ${withRows.join(', ')}`);
  for (const table of DROP_ORDER) {
    await knex.schema.dropTableIfExists(table);
  }
};

exports.down = async (knex) => {
  for (const table of [...DROP_ORDER].reverse()) {
    if (!(await knex.schema.hasTable(table))) await knex.raw(RECREATE_SQL[table]);
  }
};
