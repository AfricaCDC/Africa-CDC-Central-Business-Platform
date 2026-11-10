/**
 * Drop 21 dead tables (D-20261106-10).
 *
 * Verified in production on 2026-11-06: 0 rows each, no code reading or
 * writing them outside migrations, seeds and tests, no view, and the only
 * foreign keys pointing at them come from tables of this same list. The
 * children are dropped before their parents.
 *
 * Kept on purpose: empty tables still wired to a current feature
 * (approval_delegations, reminder_log, activity_cost_lines,
 * activity_report_preparer_changes) and legacy tables still read by code
 * (amert_*, monitoring, indicators, budget_lines, ...). See OBSOLETE.md.
 *
 * `down` recreates the table structures (empty), from the CREATE statements
 * captured in production on 2026-11-06.
 */

// Children first.
const DROP_ORDER = Object.freeze([
  'assumptions',
  'means_of_verification',
  'logframe_rows',
  'logframe_matrices',
  'report_sections',
  'generated_files',
  'reports',
  'report_templates',
  'expenditures',
  'sap_budget_codes',
  'partner_access_scopes',
  'partner_organizations',
  'budgets',
  'exchange_rates',
  'data_collection_schedules',
  'indicator_baselines',
  'results_links',
  'team_members',
  'pirs_completion_stats',
  'workplan_dependencies',
  'item_contributing_divisions',
]);

const RECREATE_SQL = Object.freeze({
  assumptions: `CREATE TABLE \`assumptions\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`logframe_row_id\` int unsigned NOT NULL,
  \`description\` text COLLATE utf8mb4_general_ci NOT NULL,
  \`created_by_id\` int unsigned DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`assumptions_logframe_row_id_foreign\` (\`logframe_row_id\`),
  KEY \`assumptions_created_by_id_foreign\` (\`created_by_id\`),
  CONSTRAINT \`assumptions_created_by_id_foreign\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`assumptions_logframe_row_id_foreign\` FOREIGN KEY (\`logframe_row_id\`) REFERENCES \`logframe_rows\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  means_of_verification: `CREATE TABLE \`means_of_verification\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`logframe_row_id\` int unsigned NOT NULL,
  \`description\` text COLLATE utf8mb4_general_ci NOT NULL,
  \`source\` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`frequency\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`responsible\` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`means_of_verification_logframe_row_id_foreign\` (\`logframe_row_id\`),
  CONSTRAINT \`means_of_verification_logframe_row_id_foreign\` FOREIGN KEY (\`logframe_row_id\`) REFERENCES \`logframe_rows\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  logframe_rows: `CREATE TABLE \`logframe_rows\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`logframe_matrix_id\` int unsigned NOT NULL,
  \`level\` enum('GOAL','PURPOSE','OUTPUT','ACTIVITY') COLLATE utf8mb4_general_ci NOT NULL,
  \`result_id\` int unsigned DEFAULT NULL,
  \`indicator_id\` int unsigned DEFAULT NULL,
  \`sort_order\` int DEFAULT '0',
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`logframe_rows_logframe_matrix_id_foreign\` (\`logframe_matrix_id\`),
  KEY \`logframe_rows_result_id_foreign\` (\`result_id\`),
  KEY \`logframe_rows_indicator_id_foreign\` (\`indicator_id\`),
  CONSTRAINT \`logframe_rows_indicator_id_foreign\` FOREIGN KEY (\`indicator_id\`) REFERENCES \`indicators\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`logframe_rows_logframe_matrix_id_foreign\` FOREIGN KEY (\`logframe_matrix_id\`) REFERENCES \`logframe_matrices\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`logframe_rows_result_id_foreign\` FOREIGN KEY (\`result_id\`) REFERENCES \`results\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  logframe_matrices: `CREATE TABLE \`logframe_matrices\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`project_id\` int unsigned NOT NULL,
  \`version\` int DEFAULT '1',
  \`status\` enum('DRAFT','IN_REVIEW','APPROVED','ARCHIVED') COLLATE utf8mb4_general_ci DEFAULT 'DRAFT',
  \`created_by_id\` int unsigned DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`logframe_matrices_project_id_foreign\` (\`project_id\`),
  KEY \`logframe_matrices_created_by_id_foreign\` (\`created_by_id\`),
  CONSTRAINT \`logframe_matrices_created_by_id_foreign\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`logframe_matrices_project_id_foreign\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  report_sections: `CREATE TABLE \`report_sections\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`report_id\` int unsigned NOT NULL,
  \`section_key\` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  \`title\` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`content\` text COLLATE utf8mb4_general_ci,
  \`sort_order\` int DEFAULT '0',
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`report_sections_report_id_foreign\` (\`report_id\`),
  CONSTRAINT \`report_sections_report_id_foreign\` FOREIGN KEY (\`report_id\`) REFERENCES \`reports\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  generated_files: `CREATE TABLE \`generated_files\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`report_id\` int unsigned NOT NULL,
  \`file_path\` varchar(500) COLLATE utf8mb4_general_ci NOT NULL,
  \`file_type\` enum('PDF','EXCEL','WORD') COLLATE utf8mb4_general_ci NOT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`generated_files_report_id_foreign\` (\`report_id\`),
  CONSTRAINT \`generated_files_report_id_foreign\` FOREIGN KEY (\`report_id\`) REFERENCES \`reports\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  reports: `CREATE TABLE \`reports\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`project_id\` int unsigned DEFAULT NULL,
  \`template_id\` int unsigned DEFAULT NULL,
  \`title\` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  \`period\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`status\` enum('DRAFT','IN_REVIEW','APPROVED','PUBLISHED') COLLATE utf8mb4_general_ci DEFAULT 'DRAFT',
  \`owner_id\` int unsigned DEFAULT NULL,
  \`parameters\` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  \`generated_date\` datetime DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`reports_project_id_foreign\` (\`project_id\`),
  KEY \`reports_template_id_foreign\` (\`template_id\`),
  KEY \`reports_owner_id_foreign\` (\`owner_id\`),
  CONSTRAINT \`reports_owner_id_foreign\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`reports_project_id_foreign\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`reports_template_id_foreign\` FOREIGN KEY (\`template_id\`) REFERENCES \`report_templates\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`reports_chk_1\` CHECK (json_valid(\`parameters\`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  report_templates: `CREATE TABLE \`report_templates\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`name\` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  \`report_type\` enum('QPR','APR','DONOR','IATI','SCORECARD','CUSTOM') COLLATE utf8mb4_general_ci NOT NULL,
  \`description\` text COLLATE utf8mb4_general_ci,
  \`template_json\` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  CONSTRAINT \`report_templates_chk_1\` CHECK (json_valid(\`template_json\`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  expenditures: `CREATE TABLE \`expenditures\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`project_id\` int unsigned NOT NULL,
  \`budget_line_id\` int unsigned DEFAULT NULL,
  \`sap_budget_code_id\` int unsigned DEFAULT NULL,
  \`amount\` decimal(15,2) NOT NULL,
  \`expenditure_date\` date NOT NULL,
  \`description\` text COLLATE utf8mb4_general_ci,
  \`status\` enum('PENDING','VERIFIED','RECONCILED') COLLATE utf8mb4_general_ci DEFAULT 'PENDING',
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`expenditures_project_id_foreign\` (\`project_id\`),
  KEY \`expenditures_sap_budget_code_id_foreign\` (\`sap_budget_code_id\`),
  KEY \`expenditures_budget_line_id_foreign\` (\`budget_line_id\`),
  CONSTRAINT \`expenditures_budget_line_id_foreign\` FOREIGN KEY (\`budget_line_id\`) REFERENCES \`budget_lines\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`expenditures_project_id_foreign\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`expenditures_sap_budget_code_id_foreign\` FOREIGN KEY (\`sap_budget_code_id\`) REFERENCES \`sap_budget_codes\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  sap_budget_codes: `CREATE TABLE \`sap_budget_codes\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`code\` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  \`name\` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  \`description\` text COLLATE utf8mb4_general_ci,
  \`is_active\` tinyint(1) DEFAULT '1',
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`sap_budget_codes_code_unique\` (\`code\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  partner_access_scopes: `CREATE TABLE \`partner_access_scopes\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`partner_org_id\` int unsigned NOT NULL,
  \`scope_type\` enum('PROGRAM','PROJECT','REPORT') COLLATE utf8mb4_general_ci NOT NULL,
  \`scope_id\` int unsigned NOT NULL,
  \`access_level\` enum('VIEW','COMMENT') COLLATE utf8mb4_general_ci DEFAULT 'VIEW',
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`partner_access_scopes_partner_org_id_foreign\` (\`partner_org_id\`),
  CONSTRAINT \`partner_access_scopes_partner_org_id_foreign\` FOREIGN KEY (\`partner_org_id\`) REFERENCES \`partner_organizations\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  partner_organizations: `CREATE TABLE \`partner_organizations\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`name\` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  \`org_type\` enum('DONOR','IMPLEMENTING_PARTNER','TECHNICAL','GOVERNANCE') COLLATE utf8mb4_general_ci DEFAULT 'DONOR',
  \`status\` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_general_ci DEFAULT 'ACTIVE',
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  budgets: `CREATE TABLE \`budgets\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`project_id\` int unsigned NOT NULL,
  \`status\` enum('DRAFT','IN_REVIEW','APPROVED','LOCKED') COLLATE utf8mb4_general_ci DEFAULT 'DRAFT',
  \`total_amount\` decimal(15,2) DEFAULT '0.00',
  \`currency\` varchar(10) COLLATE utf8mb4_general_ci DEFAULT 'USD',
  \`owner_id\` int unsigned DEFAULT NULL,
  \`period\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`budgets_project_id_foreign\` (\`project_id\`),
  KEY \`budgets_owner_id_foreign\` (\`owner_id\`),
  CONSTRAINT \`budgets_owner_id_foreign\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`budgets_project_id_foreign\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  exchange_rates: `CREATE TABLE \`exchange_rates\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`from_currency\` varchar(10) COLLATE utf8mb4_general_ci NOT NULL,
  \`to_currency\` varchar(10) COLLATE utf8mb4_general_ci NOT NULL,
  \`rate\` decimal(15,6) NOT NULL,
  \`rate_date\` date NOT NULL,
  \`source\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`is_override\` tinyint(1) DEFAULT '0',
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  data_collection_schedules: `CREATE TABLE \`data_collection_schedules\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`indicator_id\` int unsigned NOT NULL,
  \`frequency\` enum('MONTHLY','QUARTERLY','SEMI_ANNUAL','ANNUAL') COLLATE utf8mb4_general_ci NOT NULL,
  \`responsible_unit_id\` int unsigned DEFAULT NULL,
  \`method\` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`data_collection_schedules_indicator_id_foreign\` (\`indicator_id\`),
  KEY \`data_collection_schedules_responsible_unit_id_foreign\` (\`responsible_unit_id\`),
  CONSTRAINT \`data_collection_schedules_indicator_id_foreign\` FOREIGN KEY (\`indicator_id\`) REFERENCES \`indicators\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`data_collection_schedules_responsible_unit_id_foreign\` FOREIGN KEY (\`responsible_unit_id\`) REFERENCES \`business_units\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  indicator_baselines: `CREATE TABLE \`indicator_baselines\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`indicator_id\` int unsigned NOT NULL,
  \`baseline_value\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`baseline_period\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`source\` text COLLATE utf8mb4_general_ci,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`indicator_baselines_indicator_id_foreign\` (\`indicator_id\`),
  CONSTRAINT \`indicator_baselines_indicator_id_foreign\` FOREIGN KEY (\`indicator_id\`) REFERENCES \`indicators\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  results_links: `CREATE TABLE \`results_links\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`source_result_id\` int unsigned NOT NULL,
  \`target_result_id\` int unsigned NOT NULL,
  \`link_type\` enum('CAUSAL','CONTRIBUTES_TO') COLLATE utf8mb4_general_ci DEFAULT 'CAUSAL',
  \`created_by_id\` int unsigned DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`results_links_source_result_id_foreign\` (\`source_result_id\`),
  KEY \`results_links_target_result_id_foreign\` (\`target_result_id\`),
  KEY \`results_links_created_by_id_foreign\` (\`created_by_id\`),
  CONSTRAINT \`results_links_created_by_id_foreign\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`results_links_source_result_id_foreign\` FOREIGN KEY (\`source_result_id\`) REFERENCES \`results\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`results_links_target_result_id_foreign\` FOREIGN KEY (\`target_result_id\`) REFERENCES \`results\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  team_members: `CREATE TABLE \`team_members\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`team_id\` int unsigned NOT NULL,
  \`user_id\` int unsigned NOT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`team_members_team_id_user_id_unique\` (\`team_id\`,\`user_id\`),
  KEY \`team_members_user_id_foreign\` (\`user_id\`),
  CONSTRAINT \`team_members_team_id_foreign\` FOREIGN KEY (\`team_id\`) REFERENCES \`teams\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`team_members_user_id_foreign\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  pirs_completion_stats: `CREATE TABLE \`pirs_completion_stats\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`sp_code\` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`priority_label\` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`t1_completion\` decimal(5,2) DEFAULT NULL,
  \`t2_completion\` decimal(5,2) DEFAULT NULL,
  \`t3_completion\` decimal(5,2) DEFAULT NULL,
  \`t4_completion\` decimal(5,2) DEFAULT NULL,
  \`responsible\` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`responsible_code\` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_pirs_resp_code\` (\`responsible_code\`),
  CONSTRAINT \`pirs_completion_stats_responsible_code_foreign\` FOREIGN KEY (\`responsible_code\`) REFERENCES \`division_codes\` (\`code\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  workplan_dependencies: `CREATE TABLE \`workplan_dependencies\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`source_item_id\` int unsigned NOT NULL,
  \`target_item_id\` int unsigned NOT NULL,
  \`dependency_type\` enum('FS','SS','FF') COLLATE utf8mb4_general_ci DEFAULT 'FS',
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`workplan_dependencies_source_item_id_foreign\` (\`source_item_id\`),
  KEY \`workplan_dependencies_target_item_id_foreign\` (\`target_item_id\`),
  CONSTRAINT \`workplan_dependencies_source_item_id_foreign\` FOREIGN KEY (\`source_item_id\`) REFERENCES \`workplan_items\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`workplan_dependencies_target_item_id_foreign\` FOREIGN KEY (\`target_item_id\`) REFERENCES \`workplan_items\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  item_contributing_divisions: `CREATE TABLE \`item_contributing_divisions\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`item_type\` enum('workplan_item','indicator') COLLATE utf8mb4_general_ci NOT NULL,
  \`item_id\` int unsigned NOT NULL,
  \`division_code\` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_icd_type_item_div\` (\`item_type\`,\`item_id\`,\`division_code\`),
  KEY \`item_contributing_divisions_division_code_foreign\` (\`division_code\`),
  KEY \`idx_icd_item\` (\`item_type\`,\`item_id\`),
  CONSTRAINT \`item_contributing_divisions_division_code_foreign\` FOREIGN KEY (\`division_code\`) REFERENCES \`division_codes\` (\`code\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
});

exports.up = async (knex) => {
  // Guard: the audit found every table empty. Refuse to drop data written since.
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
