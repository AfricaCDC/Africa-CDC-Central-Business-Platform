/**
 * Drop the last 5 legacy tables (D-20261107-01).
 *
 * projects, workplans, results and workplan_items hold the one-shot workplan
 * import of 5 April 2026, replaced by plan_nodes. indicator_reports holds the
 * Q1 2026 reports of the old model; 119 of 123 were copied to
 * indicator_division_reports, the other 4 were left out by decision. No row
 * of the five was written after 17 April 2026. They were exported to Excel
 * (kept outside git) and the production database was backed up before the drop.
 *
 * Guard: refuses to drop a table that got a row created or changed on or
 * after the export day, since that row is not in the export.
 *
 * `down` recreates the structures (empty), from the CREATE statements
 * captured in production on 2026-11-07.
 */

const EXPORTED_ON = '2026-11-07 00:00:00';

// Children first.
const DROP_ORDER = Object.freeze([
  'indicator_reports',
  'workplan_items',
  'results',
  'workplans',
  'projects',
]);

const RECREATE_SQL = Object.freeze({
  indicator_reports: `CREATE TABLE \`indicator_reports\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`plan_node_id\` int unsigned NOT NULL,
  \`user_id\` int unsigned DEFAULT NULL,
  \`quarter\` varchar(10) COLLATE utf8mb4_general_ci NOT NULL,
  \`fiscal_year\` varchar(10) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '2026',
  \`status\` enum('DRAFT','SUBMITTED','VALIDATED','REJECTED') COLLATE utf8mb4_general_ci DEFAULT 'DRAFT',
  \`actual_value\` decimal(15,4) DEFAULT NULL,
  \`narrative\` text COLLATE utf8mb4_general_ci,
  \`challenges\` text COLLATE utf8mb4_general_ci,
  \`recommendations\` text COLLATE utf8mb4_general_ci,
  \`evidence_url\` text COLLATE utf8mb4_general_ci,
  \`responsible_division_code\` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`submitted_at\` datetime DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`disaggregations\` json DEFAULT NULL,
  \`reporting_date\` date DEFAULT NULL,
  \`rejection_reason\` text COLLATE utf8mb4_general_ci,
  \`reviewed_by\` int unsigned DEFAULT NULL,
  \`reviewed_at\` datetime DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`indicator_reports_plan_node_id_quarter_fiscal_year_unique\` (\`plan_node_id\`,\`quarter\`,\`fiscal_year\`),
  KEY \`indicator_reports_user_id_foreign\` (\`user_id\`),
  KEY \`indicator_reports_plan_node_id_quarter_index\` (\`plan_node_id\`,\`quarter\`),
  KEY \`idx_ir_plan_node\` (\`plan_node_id\`),
  KEY \`idx_ir_quarter_year\` (\`quarter\`,\`fiscal_year\`),
  CONSTRAINT \`indicator_reports_plan_node_id_foreign\` FOREIGN KEY (\`plan_node_id\`) REFERENCES \`plan_nodes\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`indicator_reports_user_id_foreign\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  workplan_items: `CREATE TABLE \`workplan_items\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`workplan_id\` int unsigned NOT NULL,
  \`code\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`title\` varchar(500) COLLATE utf8mb4_general_ci NOT NULL,
  \`description\` text COLLATE utf8mb4_general_ci,
  \`item_type\` enum('ACTIVITY','DELIVERABLE','TASK') COLLATE utf8mb4_general_ci DEFAULT 'ACTIVITY',
  \`status\` enum('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED') COLLATE utf8mb4_general_ci DEFAULT 'NOT_STARTED',
  \`parent_id\` int unsigned DEFAULT NULL,
  \`owner_id\` int unsigned DEFAULT NULL,
  \`result_id\` int unsigned DEFAULT NULL,
  \`indicator_id\` int unsigned DEFAULT NULL,
  \`priority\` enum('LOW','MEDIUM','HIGH') COLLATE utf8mb4_general_ci DEFAULT 'MEDIUM',
  \`percent_complete\` decimal(5,2) DEFAULT '0.00',
  \`start_date\` date DEFAULT NULL,
  \`end_date\` date DEFAULT NULL,
  \`q1_active\` tinyint(1) DEFAULT '0',
  \`q2_active\` tinyint(1) DEFAULT '0',
  \`q3_active\` tinyint(1) DEFAULT '0',
  \`q4_active\` tinyint(1) DEFAULT '0',
  \`assignee_user_id\` int unsigned DEFAULT NULL,
  \`responsible_division\` varchar(200) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`responsible_division_code\` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`focal_point_id\` int unsigned DEFAULT NULL,
  \`contributing_divisions\` text COLLATE utf8mb4_general_ci,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`budget_main\` decimal(15,2) DEFAULT '0.00',
  \`budget_pass_through\` decimal(15,2) DEFAULT '0.00',
  \`budget_technical_assistance\` decimal(15,2) DEFAULT '0.00',
  \`budget_special_projects\` decimal(15,2) DEFAULT '0.00',
  \`budget_total\` decimal(15,2) DEFAULT '0.00',
  \`budget_2027\` decimal(15,2) DEFAULT '0.00',
  \`budget_2028\` decimal(15,2) DEFAULT '0.00',
  \`budget_source_fund\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`archived_at\` timestamp NULL DEFAULT NULL,
  \`archived_by\` int unsigned DEFAULT NULL,
  \`q1_plan\` text COLLATE utf8mb4_general_ci,
  \`q2_plan\` text COLLATE utf8mb4_general_ci,
  \`q3_plan\` text COLLATE utf8mb4_general_ci,
  \`q4_plan\` text COLLATE utf8mb4_general_ci,
  \`q1_budget\` decimal(15,2) DEFAULT '0.00',
  \`q2_budget\` decimal(15,2) DEFAULT '0.00',
  \`q3_budget\` decimal(15,2) DEFAULT '0.00',
  \`q4_budget\` decimal(15,2) DEFAULT '0.00',
  \`amert_code\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`workplan_items_workplan_id_foreign\` (\`workplan_id\`),
  KEY \`workplan_items_parent_id_foreign\` (\`parent_id\`),
  KEY \`workplan_items_owner_id_foreign\` (\`owner_id\`),
  KEY \`workplan_items_result_id_foreign\` (\`result_id\`),
  KEY \`workplan_items_indicator_id_foreign\` (\`indicator_id\`),
  KEY \`workplan_items_assignee_user_id_foreign\` (\`assignee_user_id\`),
  KEY \`workplan_items_archived_by_foreign\` (\`archived_by\`),
  KEY \`idx_wpi_focal_point\` (\`focal_point_id\`),
  KEY \`idx_wpi_div_code\` (\`responsible_division_code\`),
  KEY \`idx_workplan_items_amert_code\` (\`amert_code\`),
  CONSTRAINT \`workplan_items_archived_by_foreign\` FOREIGN KEY (\`archived_by\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`workplan_items_assignee_user_id_foreign\` FOREIGN KEY (\`assignee_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`workplan_items_focal_point_id_foreign\` FOREIGN KEY (\`focal_point_id\`) REFERENCES \`focal_points\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`workplan_items_indicator_id_foreign\` FOREIGN KEY (\`indicator_id\`) REFERENCES \`indicators\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`workplan_items_owner_id_foreign\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`workplan_items_parent_id_foreign\` FOREIGN KEY (\`parent_id\`) REFERENCES \`workplan_items\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`workplan_items_responsible_division_code_foreign\` FOREIGN KEY (\`responsible_division_code\`) REFERENCES \`division_codes\` (\`code\`) ON DELETE SET NULL,
  CONSTRAINT \`workplan_items_result_id_foreign\` FOREIGN KEY (\`result_id\`) REFERENCES \`results\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`workplan_items_workplan_id_foreign\` FOREIGN KEY (\`workplan_id\`) REFERENCES \`workplans\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  results: `CREATE TABLE \`results\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`code\` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  \`amert_index\` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`name\` varchar(500) COLLATE utf8mb4_general_ci NOT NULL,
  \`description\` text COLLATE utf8mb4_general_ci,
  \`level\` enum('IMPACT','OUTCOME','OUTPUT') COLLATE utf8mb4_general_ci NOT NULL,
  \`project_id\` int unsigned DEFAULT NULL,
  \`status\` enum('DRAFT','IN_REVIEW','APPROVED') COLLATE utf8mb4_general_ci DEFAULT 'DRAFT',
  \`owner_id\` int unsigned DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`budget_main\` decimal(15,2) DEFAULT '0.00',
  \`budget_pass_through\` decimal(15,2) DEFAULT '0.00',
  \`budget_technical_assistance\` decimal(15,2) DEFAULT '0.00',
  \`budget_special_projects\` decimal(15,2) DEFAULT '0.00',
  \`budget_total\` decimal(15,2) DEFAULT '0.00',
  \`budget_2027\` decimal(15,2) DEFAULT '0.00',
  \`budget_2028\` decimal(15,2) DEFAULT '0.00',
  \`budget_source_fund\` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`archived_at\` timestamp NULL DEFAULT NULL,
  \`archived_by\` int unsigned DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`results_project_id_foreign\` (\`project_id\`),
  KEY \`results_owner_id_foreign\` (\`owner_id\`),
  KEY \`results_archived_by_foreign\` (\`archived_by\`),
  CONSTRAINT \`results_archived_by_foreign\` FOREIGN KEY (\`archived_by\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`results_owner_id_foreign\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`results_project_id_foreign\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  workplans: `CREATE TABLE \`workplans\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`project_id\` int unsigned NOT NULL,
  \`period_type\` enum('ANNUAL','QUARTERLY') COLLATE utf8mb4_general_ci DEFAULT 'ANNUAL',
  \`period_label\` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  \`status\` enum('DRAFT','APPROVED','IN_EXECUTION','CLOSED') COLLATE utf8mb4_general_ci DEFAULT 'DRAFT',
  \`owner_id\` int unsigned DEFAULT NULL,
  \`start_date\` date DEFAULT NULL,
  \`end_date\` date DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`workplans_project_id_foreign\` (\`project_id\`),
  KEY \`workplans_owner_id_foreign\` (\`owner_id\`),
  CONSTRAINT \`workplans_owner_id_foreign\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`workplans_project_id_foreign\` FOREIGN KEY (\`project_id\`) REFERENCES \`projects\` (\`id\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  projects: `CREATE TABLE \`projects\` (
  \`id\` int unsigned NOT NULL AUTO_INCREMENT,
  \`code\` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  \`name\` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  \`description\` text COLLATE utf8mb4_general_ci,
  \`status\` enum('DRAFT','IN_REVIEW','APPROVED','IN_EXECUTION','CLOSED','ARCHIVED') COLLATE utf8mb4_general_ci DEFAULT 'DRAFT',
  \`program_id\` int unsigned DEFAULT NULL,
  \`owner_id\` int unsigned DEFAULT NULL,
  \`business_unit_id\` int unsigned DEFAULT NULL,
  \`priority\` enum('LOW','MEDIUM','HIGH') COLLATE utf8mb4_general_ci DEFAULT 'MEDIUM',
  \`start_date\` date DEFAULT NULL,
  \`end_date\` date DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`projects_code_unique\` (\`code\`),
  KEY \`projects_program_id_foreign\` (\`program_id\`),
  KEY \`projects_owner_id_foreign\` (\`owner_id\`),
  KEY \`projects_business_unit_id_foreign\` (\`business_unit_id\`),
  CONSTRAINT \`projects_business_unit_id_foreign\` FOREIGN KEY (\`business_unit_id\`) REFERENCES \`business_units\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`projects_owner_id_foreign\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
  CONSTRAINT \`projects_program_id_foreign\` FOREIGN KEY (\`program_id\`) REFERENCES \`programs\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
});

exports.up = async (knex) => {
  const writtenSince = [];
  for (const table of DROP_ORDER) {
    if (!(await knex.schema.hasTable(table))) continue;
    const [{ n }] = await knex(table)
      .where('created_at', '>=', EXPORTED_ON).orWhere('updated_at', '>=', EXPORTED_ON)
      .count('* as n');
    if (Number(n) > 0) writtenSince.push(`${table} (${n})`);
  }
  if (writtenSince.length) {
    throw new Error(`Not dropped, rows written since the export: ${writtenSince.join(', ')}`);
  }
  for (const table of DROP_ORDER) {
    await knex.schema.dropTableIfExists(table);
  }
};

exports.down = async (knex) => {
  for (const table of [...DROP_ORDER].reverse()) {
    if (!(await knex.schema.hasTable(table))) await knex.raw(RECREATE_SQL[table]);
  }
};
