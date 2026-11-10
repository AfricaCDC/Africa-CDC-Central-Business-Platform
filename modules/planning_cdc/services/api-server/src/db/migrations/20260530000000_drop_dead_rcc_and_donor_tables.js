/**
 * Cleaning Phase 0.3 — drop confirmed-dead tables.
 *
 * Two groups, both verified (2026-05-30) to have ZERO incoming foreign keys and
 * ZERO references from runtime `src/` code (only migrations/seeds, which are
 * historical):
 *
 *   1. RCC emergency backup snapshots (redundant with the live tables — the live
 *      plan_nodes / indicator_broad_links hold the current data):
 *        - plan_nodes_rcc_backup_20260415   (13 rows)
 *        - plan_nodes_rcc_backup_v2          (13 rows)
 *        - indicator_broad_links_rcc_backup_v2 (36 rows)
 *        - specifics_linked_rcc_backup_v2    (62 rows)
 *
 *   2. Donor-specific result tables that were created but never wired to any
 *      service/route and never populated (0 rows each):
 *        - donor_results_afdb / gavi / mastercard / unicef / worldbank
 *
 * `down` recreates the table STRUCTURES (so the schema is reversible) but does
 * NOT restore the backup row data — that data was a redundant snapshot of the
 * live tables and is intentionally not preserved (see DECISIONS.md D-20260530-01).
 *
 * NOTE (deferred): the amert_*, indicator_achievements/baselines/targets and
 * logframe_* dead tables are ALSO empty but are still referenced by mounted code
 * (amertService/amertRoutes, monitoringService, logframeRoutes). They will be
 * dropped together with their routes in cleanup Phase 4. See OBSOLETE.md.
 */

const DROP_TABLES = [
  'plan_nodes_rcc_backup_20260415',
  'plan_nodes_rcc_backup_v2',
  'indicator_broad_links_rcc_backup_v2',
  'specifics_linked_rcc_backup_v2',
  'donor_results_afdb',
  'donor_results_gavi',
  'donor_results_mastercard',
  'donor_results_unicef',
  'donor_results_worldbank',
];

// Exact CREATE statements captured from the live schema on 2026-05-30, used by
// `down` to restore structure (empty).
const RECREATE_SQL = {
  plan_nodes_rcc_backup_20260415: `CREATE TABLE \`plan_nodes_rcc_backup_20260415\` (
    \`id\` int(10) unsigned NOT NULL DEFAULT 0, \`parent_id\` int(10) unsigned DEFAULT NULL,
    \`node_type\` enum('IMPACT','IMPACT_INDICATOR','OUTCOME_AREA','OUTCOME_INDICATOR','BROAD_ACTIVITY','SPECIFIC_ACTIVITY') NOT NULL,
    \`activity_type\` enum('PROCUREMENT','TRAINING','MEETING','CONFERENCE','WORKSHOP','TECHNICAL_ASSISTANCE') DEFAULT NULL,
    \`implementation_at_rcc\` tinyint(1) DEFAULT NULL, \`tier_id\` int(11) DEFAULT NULL, \`code\` varchar(50) DEFAULT NULL,
    \`title\` text NOT NULL, \`description\` text DEFAULT NULL, \`unit\` varchar(100) DEFAULT NULL,
    \`baseline\` varchar(100) DEFAULT NULL, \`target_y1\` varchar(100) DEFAULT NULL, \`target_y2\` varchar(100) DEFAULT NULL,
    \`target_y3\` varchar(100) DEFAULT NULL, \`budget_main\` decimal(15,2) DEFAULT 0.00,
    \`budgeting_arrangement\` enum('Extramural','Intramural') DEFAULT NULL, \`primary_funding_source\` varchar(200) DEFAULT NULL,
    \`other_funding_source\` varchar(200) DEFAULT NULL, \`grant_name\` varchar(200) DEFAULT NULL,
    \`budget_pass_through\` decimal(15,2) DEFAULT 0.00, \`budget_tech_assistance\` decimal(15,2) DEFAULT 0.00,
    \`budget_special_projects\` decimal(15,2) DEFAULT 0.00, \`budget_total_2026\` decimal(15,2) DEFAULT 0.00,
    \`budget_2027\` decimal(15,2) DEFAULT 0.00, \`budget_2028\` decimal(15,2) DEFAULT 0.00, \`fiscal_year\` varchar(10) DEFAULT '2026',
    \`responsible_division_code\` varchar(20) DEFAULT NULL,
    \`contributing_divisions\` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(\`contributing_divisions\`)),
    \`secondary_division_code\` varchar(20) DEFAULT NULL,
    \`status\` enum('DRAFT','IN_REVIEW','APPROVED','REJECTED','CANCELLED','IN_EXECUTION','CLOSED','ARCHIVED') DEFAULT 'APPROVED',
    \`sort_order\` int(11) DEFAULT 0, \`is_active\` tinyint(1) DEFAULT 1, \`created_by_user_id\` int(10) unsigned DEFAULT NULL,
    \`submitted_at\` timestamp NULL DEFAULT NULL, \`reviewed_by_user_id\` int(10) unsigned DEFAULT NULL,
    \`reviewed_at\` timestamp NULL DEFAULT NULL, \`rejection_reason\` text DEFAULT NULL,
    \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(), \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp(),
    \`unit_of_measure_id\` int(10) unsigned DEFAULT NULL, \`baseline_numeric\` decimal(15,4) DEFAULT NULL,
    \`target_y1_numeric\` decimal(15,4) DEFAULT NULL, \`target_y2_numeric\` decimal(15,4) DEFAULT NULL,
    \`target_y3_numeric\` decimal(15,4) DEFAULT NULL, \`start_date\` date DEFAULT NULL, \`end_date\` date DEFAULT NULL,
    \`location\` varchar(300) DEFAULT NULL, \`is_operational\` tinyint(1) DEFAULT NULL,
    \`q1_budget\` decimal(15,2) DEFAULT 0.00, \`q2_budget\` decimal(15,2) DEFAULT 0.00, \`q3_budget\` decimal(15,2) DEFAULT 0.00,
    \`q4_budget\` decimal(15,2) DEFAULT 0.00, \`indicator_code\` varchar(50) DEFAULT NULL, \`linked_indicator_id\` int(10) unsigned DEFAULT NULL,
    \`q1_target_numeric\` decimal(15,4) DEFAULT NULL, \`q2_target_numeric\` decimal(15,4) DEFAULT NULL,
    \`q3_target_numeric\` decimal(15,4) DEFAULT NULL, \`q4_target_numeric\` decimal(15,4) DEFAULT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

  indicator_broad_links_rcc_backup_v2: `CREATE TABLE \`indicator_broad_links_rcc_backup_v2\` (
    \`id\` int(10) unsigned NOT NULL DEFAULT 0, \`indicator_id\` int(10) unsigned NOT NULL,
    \`broad_activity_id\` int(10) unsigned NOT NULL, \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
    \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp()
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

  specifics_linked_rcc_backup_v2: `CREATE TABLE \`specifics_linked_rcc_backup_v2\` (
    \`id\` int(10) unsigned NOT NULL DEFAULT 0, \`linked_indicator_id\` int(10) unsigned DEFAULT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

  donor_results_afdb: `CREATE TABLE \`donor_results_afdb\` (
    \`id\` int(10) unsigned NOT NULL AUTO_INCREMENT, \`partner_id\` int(10) unsigned DEFAULT NULL,
    \`indicator_code\` varchar(50) DEFAULT NULL, \`indicator_name\` text DEFAULT NULL,
    \`status\` enum('Retained','Repurposed','Dropped','New Activity based on other repurposed activities') DEFAULT NULL,
    \`baseline\` varchar(100) DEFAULT NULL, \`target\` varchar(100) DEFAULT NULL, \`actual\` varchar(100) DEFAULT NULL,
    \`achievement_pct\` decimal(5,2) DEFAULT NULL, \`comments\` text DEFAULT NULL,
    \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(), \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (\`id\`), KEY \`donor_results_afdb_partner_id_foreign\` (\`partner_id\`),
    CONSTRAINT \`donor_results_afdb_partner_id_foreign\` FOREIGN KEY (\`partner_id\`) REFERENCES \`partners\` (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

  donor_results_gavi: `CREATE TABLE \`donor_results_gavi\` (
    \`id\` int(10) unsigned NOT NULL AUTO_INCREMENT, \`partner_id\` int(10) unsigned DEFAULT NULL,
    \`mou_priority_area\` varchar(200) DEFAULT NULL, \`indicator_code\` varchar(50) DEFAULT NULL, \`indicator_name\` text DEFAULT NULL,
    \`baseline\` varchar(100) DEFAULT NULL, \`target\` varchar(100) DEFAULT NULL, \`actual_feb\` varchar(100) DEFAULT NULL,
    \`actual_aug\` varchar(100) DEFAULT NULL, \`comments\` text DEFAULT NULL,
    \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(), \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (\`id\`), KEY \`donor_results_gavi_partner_id_foreign\` (\`partner_id\`),
    CONSTRAINT \`donor_results_gavi_partner_id_foreign\` FOREIGN KEY (\`partner_id\`) REFERENCES \`partners\` (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

  donor_results_mastercard: `CREATE TABLE \`donor_results_mastercard\` (
    \`id\` int(10) unsigned NOT NULL AUTO_INCREMENT, \`partner_id\` int(10) unsigned DEFAULT NULL,
    \`indicator_code\` varchar(50) DEFAULT NULL, \`indicator_name\` text DEFAULT NULL, \`tier_id\` int(11) DEFAULT NULL,
    \`baseline\` varchar(100) DEFAULT NULL, \`target\` varchar(100) DEFAULT NULL, \`actual\` varchar(100) DEFAULT NULL,
    \`comments\` text DEFAULT NULL, \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
    \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (\`id\`), KEY \`donor_results_mastercard_partner_id_foreign\` (\`partner_id\`),
    CONSTRAINT \`donor_results_mastercard_partner_id_foreign\` FOREIGN KEY (\`partner_id\`) REFERENCES \`partners\` (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

  donor_results_unicef: `CREATE TABLE \`donor_results_unicef\` (
    \`id\` int(10) unsigned NOT NULL AUTO_INCREMENT, \`partner_id\` int(10) unsigned DEFAULT NULL,
    \`indicator_code\` varchar(50) DEFAULT NULL, \`indicator_name\` text DEFAULT NULL, \`thematic_area\` varchar(200) DEFAULT NULL,
    \`baseline\` varchar(100) DEFAULT NULL, \`target\` varchar(100) DEFAULT NULL, \`actual\` varchar(100) DEFAULT NULL,
    \`comments\` text DEFAULT NULL, \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
    \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (\`id\`), KEY \`donor_results_unicef_partner_id_foreign\` (\`partner_id\`),
    CONSTRAINT \`donor_results_unicef_partner_id_foreign\` FOREIGN KEY (\`partner_id\`) REFERENCES \`partners\` (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

  donor_results_worldbank: `CREATE TABLE \`donor_results_worldbank\` (
    \`id\` int(10) unsigned NOT NULL AUTO_INCREMENT, \`partner_id\` int(10) unsigned DEFAULT NULL,
    \`indicator_category\` enum('PDO','INTERMEDIATE') DEFAULT NULL, \`indicator_code\` varchar(50) DEFAULT NULL,
    \`indicator_name\` text DEFAULT NULL, \`component\` varchar(100) DEFAULT NULL, \`baseline\` varchar(100) DEFAULT NULL,
    \`end_target\` varchar(100) DEFAULT NULL, \`actual\` varchar(100) DEFAULT NULL, \`comments\` text DEFAULT NULL,
    \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(), \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (\`id\`), KEY \`donor_results_worldbank_partner_id_foreign\` (\`partner_id\`),
    CONSTRAINT \`donor_results_worldbank_partner_id_foreign\` FOREIGN KEY (\`partner_id\`) REFERENCES \`partners\` (\`id\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
};

// plan_nodes_rcc_backup_v2 shares the exact schema of the dated backup.
RECREATE_SQL.plan_nodes_rcc_backup_v2 = RECREATE_SQL.plan_nodes_rcc_backup_20260415.replace(
  'plan_nodes_rcc_backup_20260415',
  'plan_nodes_rcc_backup_v2'
);

exports.up = async function up(knex) {
  for (const t of DROP_TABLES) {
    await knex.schema.raw(`DROP TABLE IF EXISTS \`${t}\``);
  }
};

exports.down = async function down(knex) {
  // Recreate structure only; redundant RCC backup row data is intentionally not restored.
  for (const t of DROP_TABLES) {
    const ddl = RECREATE_SQL[t];
    if (ddl) await knex.schema.raw(ddl);
  }
};
