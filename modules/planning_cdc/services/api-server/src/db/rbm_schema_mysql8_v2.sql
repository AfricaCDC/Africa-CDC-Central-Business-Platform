SET FOREIGN_KEY_CHECKS = 0;

-- RBM Platform schema (MySQL 8) | Africa CDC | v2


CREATE TABLE IF NOT EXISTS business_units (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_business_units_code (code),
  KEY idx_business_units_parent (parent_id),
  CONSTRAINT fk_business_units_parent FOREIGN KEY (parent_id) REFERENCES business_units(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS countries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  iso2 CHAR(2) NULL,
  name VARCHAR(255) NOT NULL,
  is_internal TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_countries_iso2 (iso2),
  KEY idx_countries_internal (is_internal)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS partner_organizations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  org_type ENUM('DONOR','IMPLEMENTING_PARTNER','GOVERNMENT','NGO','PRIVATE','OTHER') NOT NULL DEFAULT 'OTHER',
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_partner_org_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  user_type ENUM('STAFF','PARTNER') NOT NULL DEFAULT 'STAFF',
  status ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  business_unit_id BIGINT UNSIGNED NULL,
  partner_org_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_type (user_type),
  KEY idx_users_bu (business_unit_id),
  KEY idx_users_partner_org (partner_org_id),
  CONSTRAINT fk_users_bu FOREIGN KEY (business_unit_id) REFERENCES business_units(id),
  CONSTRAINT fk_users_partner_org FOREIGN KEY (partner_org_id) REFERENCES partner_organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role (role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS teams (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  team_type ENUM('REVIEW','DQA','FINANCE','PROJECT','OTHER') NOT NULL DEFAULT 'OTHER',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_teams_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS team_members (
  team_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  membership_role ENUM('MEMBER','LEAD','VIEWER') NOT NULL DEFAULT 'MEMBER',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, user_id),
  KEY idx_team_members_user (user_id),
  CONSTRAINT fk_team_members_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_team_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS partner_access_scopes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  partner_org_id BIGINT UNSIGNED NOT NULL,
  scope_type ENUM('PROGRAM','PROJECT','REPORT') NOT NULL,
  scope_id BIGINT UNSIGNED NOT NULL,
  access_level ENUM('VIEW','COMMENT') NOT NULL DEFAULT 'VIEW',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_partner_scopes_org (partner_org_id),
  KEY idx_partner_scopes_scope (scope_type, scope_id),
  CONSTRAINT fk_partner_scopes_org FOREIGN KEY (partner_org_id) REFERENCES partner_organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS sap_budget_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL,
  description VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  valid_from DATE NULL,
  valid_to DATE NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sap_budget_codes_code (code),
  KEY idx_sap_budget_codes_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS funding_sources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  partner_org_id BIGINT UNSIGNED NULL,
  currency ENUM('USD','EUR','ETB','CDF','XOF','ZAR','NGN','KES','UGX','TZS','GHS','OTHER') NOT NULL DEFAULT 'USD',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_funding_sources_code (code),
  KEY idx_funding_sources_partner (partner_org_id),
  CONSTRAINT fk_funding_sources_partner FOREIGN KEY (partner_org_id) REFERENCES partner_organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS exchange_rates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rate_date DATE NOT NULL,
  from_currency ENUM('USD','EUR','ETB','CDF','XOF','ZAR','NGN','KES','UGX','TZS','GHS','OTHER') NOT NULL,
  to_currency ENUM('USD','EUR','ETB','CDF','XOF','ZAR','NGN','KES','UGX','TZS','GHS','OTHER') NOT NULL,
  rate DECIMAL(18,8) NOT NULL,
  source VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exchange_rates (rate_date, from_currency, to_currency)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS strategic_plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  status ENUM('DRAFT','IN_REVIEW','APPROVED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  business_unit_id BIGINT UNSIGNED NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_strategic_plans_code (code),
  KEY idx_strategic_plans_status (status),
  CONSTRAINT fk_sp_bu FOREIGN KEY (business_unit_id) REFERENCES business_units(id),
  CONSTRAINT fk_sp_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS strategic_objectives (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  strategic_plan_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(80) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NULL,
  status ENUM('DRAFT','IN_REVIEW','APPROVED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_strat_obj (strategic_plan_id, code),
  KEY idx_strat_obj_plan (strategic_plan_id),
  CONSTRAINT fk_strat_obj_plan FOREIGN KEY (strategic_plan_id) REFERENCES strategic_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS programs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  strategic_plan_id BIGINT UNSIGNED NOT NULL,
  strategic_objective_id BIGINT UNSIGNED NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status ENUM('DRAFT','IN_REVIEW','APPROVED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  business_unit_id BIGINT UNSIGNED NULL,
  country_id BIGINT UNSIGNED NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_programs_code (code),
  KEY idx_programs_plan (strategic_plan_id),
  KEY idx_programs_status (status),
  KEY idx_programs_country (country_id),
  CONSTRAINT fk_programs_plan FOREIGN KEY (strategic_plan_id) REFERENCES strategic_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_programs_strat_obj FOREIGN KEY (strategic_objective_id) REFERENCES strategic_objectives(id),
  CONSTRAINT fk_programs_bu FOREIGN KEY (business_unit_id) REFERENCES business_units(id),
  CONSTRAINT fk_programs_country FOREIGN KEY (country_id) REFERENCES countries(id),
  CONSTRAINT fk_programs_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS projects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  program_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status ENUM('DRAFT','IN_REVIEW','APPROVED','IN_EXECUTION','CLOSED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  business_unit_id BIGINT UNSIGNED NULL,
  country_id BIGINT UNSIGNED NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  manager_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_projects_code (code),
  KEY idx_projects_program (program_id),
  KEY idx_projects_status (status),
  KEY idx_projects_country (country_id),
  CONSTRAINT fk_projects_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_projects_bu FOREIGN KEY (business_unit_id) REFERENCES business_units(id),
  CONSTRAINT fk_projects_country FOREIGN KEY (country_id) REFERENCES countries(id),
  CONSTRAINT fk_projects_manager FOREIGN KEY (manager_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS approval_instances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type ENUM('STRATEGIC_PLAN','STRATEGIC_OBJECTIVE','PROGRAM','PROJECT','RESULTS_CHAIN','LOGFRAME','WORKPLAN','BUDGET','ACHIEVEMENT','REPORT','INTEGRATION') NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  status ENUM('PENDING','APPROVED','REJECTED','CHANGES_REQUESTED') NOT NULL DEFAULT 'PENDING',
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_approval_entity (entity_type, entity_id),
  KEY idx_approval_status (status),
  CONSTRAINT fk_approval_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS approval_steps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  approval_instance_id BIGINT UNSIGNED NOT NULL,
  step_no INT UNSIGNED NOT NULL,
  assigned_to_user_id BIGINT UNSIGNED NOT NULL,
  decision ENUM('PENDING','APPROVED','REJECTED','CHANGES_REQUESTED') NOT NULL DEFAULT 'PENDING',
  decided_at DATETIME NULL,
  comment TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_approval_steps (approval_instance_id, step_no),
  KEY idx_approval_steps_assignee (assigned_to_user_id),
  CONSTRAINT fk_approval_steps_instance FOREIGN KEY (approval_instance_id) REFERENCES approval_instances(id) ON DELETE CASCADE,
  CONSTRAINT fk_approval_steps_user FOREIGN KEY (assigned_to_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS version_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type ENUM('STRATEGIC_PLAN','STRATEGIC_OBJECTIVE','PROGRAM','PROJECT','RESULTS_CHAIN','LOGFRAME','WORKPLAN','BUDGET','REPORT') NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  status ENUM('DRAFT','IN_REVIEW','APPROVED','ARCHIVED') NOT NULL DEFAULT 'APPROVED',
  snapshot_json JSON NOT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_version_snapshot (entity_type, entity_id, version_no),
  KEY idx_version_snapshot_entity (entity_type, entity_id),
  CONSTRAINT fk_version_snapshot_user FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  strategic_plan_id BIGINT UNSIGNED NULL,
  program_id BIGINT UNSIGNED NULL,
  project_id BIGINT UNSIGNED NULL,
  level ENUM('IMPACT','GOAL','OUTCOME','OUTPUT') NOT NULL,
  code VARCHAR(120) NULL,
  title VARCHAR(800) NOT NULL,
  description TEXT NULL,
  status ENUM('DRAFT','IN_REVIEW','APPROVED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  owner_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_results_level (level),
  KEY idx_results_project (project_id),
  CONSTRAINT fk_results_sp FOREIGN KEY (strategic_plan_id) REFERENCES strategic_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_results_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_results_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_results_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS results_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  from_result_id BIGINT UNSIGNED NOT NULL,
  to_result_id BIGINT UNSIGNED NOT NULL,
  link_type ENUM('CAUSAL') NOT NULL DEFAULT 'CAUSAL',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_results_link (from_result_id, to_result_id),
  CONSTRAINT fk_results_link_from FOREIGN KEY (from_result_id) REFERENCES results(id) ON DELETE CASCADE,
  CONSTRAINT fk_results_link_to FOREIGN KEY (to_result_id) REFERENCES results(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS means_of_verification (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(80) NULL,
  title VARCHAR(255) NOT NULL,
  mov_type ENUM('DOCUMENT_REVIEW','SURVEY','ADMIN_DATA','SYSTEM','OTHER') NOT NULL DEFAULT 'OTHER',
  description TEXT NULL,
  url VARCHAR(600) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mov_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS logframe_matrices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  status ENUM('DRAFT','IN_REVIEW','APPROVED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  version_snapshot_id BIGINT UNSIGNED NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logframe_project (project_id),
  CONSTRAINT fk_logframe_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_logframe_snapshot FOREIGN KEY (version_snapshot_id) REFERENCES version_snapshots(id),
  CONSTRAINT fk_logframe_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS logframe_rows (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  logframe_id BIGINT UNSIGNED NOT NULL,
  row_level ENUM('GOAL','OUTCOME','OUTPUT','ACTIVITY') NOT NULL,
  result_id BIGINT UNSIGNED NULL,
  statement TEXT NOT NULL,
  mov_text TEXT NULL,
  assumptions_text TEXT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logframe_rows_logframe (logframe_id),
  KEY idx_logframe_rows_level (row_level),
  CONSTRAINT fk_logframe_rows_logframe FOREIGN KEY (logframe_id) REFERENCES logframe_matrices(id) ON DELETE CASCADE,
  CONSTRAINT fk_logframe_rows_result FOREIGN KEY (result_id) REFERENCES results(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS assumptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  result_id BIGINT UNSIGNED NULL,
  logframe_row_id BIGINT UNSIGNED NULL,
  assumption_type ENUM('ASSUMPTION','RISK') NOT NULL DEFAULT 'ASSUMPTION',
  description TEXT NOT NULL,
  mitigation TEXT NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_assumptions_result (result_id),
  KEY idx_assumptions_logframe_row (logframe_row_id),
  CONSTRAINT fk_assumptions_result FOREIGN KEY (result_id) REFERENCES results(id) ON DELETE CASCADE,
  CONSTRAINT fk_assumptions_row FOREIGN KEY (logframe_row_id) REFERENCES logframe_rows(id) ON DELETE CASCADE,
  CONSTRAINT fk_assumptions_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS workplans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  period_type ENUM('ANNUAL','QUARTERLY') NOT NULL DEFAULT 'ANNUAL',
  year SMALLINT UNSIGNED NOT NULL,
  quarter TINYINT UNSIGNED NULL,
  status ENUM('DRAFT','APPROVED','IN_EXECUTION','CLOSED') NOT NULL DEFAULT 'DRAFT',
  start_date DATE NULL,
  end_date DATE NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_workplans_project (project_id),
  KEY idx_workplans_year (year),
  CONSTRAINT fk_workplans_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_workplans_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS workplan_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workplan_id BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED NULL,
  item_type ENUM('ACTIVITY','DELIVERABLE','TASK') NOT NULL DEFAULT 'ACTIVITY',
  title VARCHAR(500) NOT NULL,
  description TEXT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  status ENUM('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'NOT_STARTED',
  priority ENUM('LOW','MEDIUM','HIGH') NOT NULL DEFAULT 'MEDIUM',
  assignee_user_id BIGINT UNSIGNED NULL,
  accountable_user_id BIGINT UNSIGNED NULL,
  percent_complete DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  result_id BIGINT UNSIGNED NULL,
  logframe_row_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_workplan_items_workplan (workplan_id),
  KEY idx_workplan_items_status (status),
  KEY idx_workplan_items_parent (parent_id),
  CONSTRAINT fk_wpi_workplan FOREIGN KEY (workplan_id) REFERENCES workplans(id) ON DELETE CASCADE,
  CONSTRAINT fk_wpi_parent FOREIGN KEY (parent_id) REFERENCES workplan_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_wpi_assignee FOREIGN KEY (assignee_user_id) REFERENCES users(id),
  CONSTRAINT fk_wpi_accountable FOREIGN KEY (accountable_user_id) REFERENCES users(id),
  CONSTRAINT fk_wpi_result FOREIGN KEY (result_id) REFERENCES results(id),
  CONSTRAINT fk_wpi_logframe_row FOREIGN KEY (logframe_row_id) REFERENCES logframe_rows(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS milestones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workplan_id BIGINT UNSIGNED NOT NULL,
  workplan_item_id BIGINT UNSIGNED NULL,
  title VARCHAR(500) NOT NULL,
  due_date DATE NULL,
  status ENUM('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'NOT_STARTED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_milestones_workplan (workplan_id),
  KEY idx_milestones_item (workplan_item_id),
  CONSTRAINT fk_milestones_workplan FOREIGN KEY (workplan_id) REFERENCES workplans(id) ON DELETE CASCADE,
  CONSTRAINT fk_milestones_item FOREIGN KEY (workplan_item_id) REFERENCES workplan_items(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS workplan_dependencies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  predecessor_item_id BIGINT UNSIGNED NOT NULL,
  successor_item_id BIGINT UNSIGNED NOT NULL,
  dependency_type ENUM('FINISH_TO_START','START_TO_START','FINISH_TO_FINISH','START_TO_FINISH') NOT NULL DEFAULT 'FINISH_TO_START',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_workplan_dep (predecessor_item_id, successor_item_id),
  KEY idx_workplan_dep_successor (successor_item_id),
  CONSTRAINT fk_workplan_dep_pred FOREIGN KEY (predecessor_item_id) REFERENCES workplan_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_workplan_dep_succ FOREIGN KEY (successor_item_id) REFERENCES workplan_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS progress_updates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  workplan_item_id BIGINT UNSIGNED NOT NULL,
  by_user_id BIGINT UNSIGNED NOT NULL,
  update_date DATE NOT NULL,
  percent_complete DECIMAL(5,2) NULL,
  note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_progress_updates_item (workplan_item_id),
  CONSTRAINT fk_progress_item FOREIGN KEY (workplan_item_id) REFERENCES workplan_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_progress_user FOREIGN KEY (by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS indicators (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(120) NOT NULL,
  name VARCHAR(500) NOT NULL,
  description TEXT NULL,
  indicator_type ENUM('QUANTITATIVE','QUALITATIVE','BINARY','INDEX') NOT NULL DEFAULT 'QUANTITATIVE',
  unit ENUM('NUMBER','PERCENT','USD','SCORE','TEXT') NOT NULL DEFAULT 'NUMBER',
  frequency ENUM('MONTHLY','QUARTERLY','SEMI_ANNUAL','ANNUAL','ADHOC') NOT NULL DEFAULT 'QUARTERLY',
  status ENUM('DRAFT','ACTIVE','RETIRED') NOT NULL DEFAULT 'DRAFT',
  result_id BIGINT UNSIGNED NULL,
  project_id BIGINT UNSIGNED NULL,
  logframe_row_id BIGINT UNSIGNED NULL,
  mov_id BIGINT UNSIGNED NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_indicators_code (code),
  KEY idx_indicators_project (project_id),
  KEY idx_indicators_status (status),
  CONSTRAINT fk_indicators_result FOREIGN KEY (result_id) REFERENCES results(id),
  CONSTRAINT fk_indicators_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_indicators_row FOREIGN KEY (logframe_row_id) REFERENCES logframe_rows(id),
  CONSTRAINT fk_indicators_mov FOREIGN KEY (mov_id) REFERENCES means_of_verification(id),
  CONSTRAINT fk_indicators_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS indicator_baselines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  indicator_id BIGINT UNSIGNED NOT NULL,
  period_year SMALLINT UNSIGNED NOT NULL,
  period_quarter TINYINT UNSIGNED NULL,
  value_decimal DECIMAL(18,4) NULL,
  value_text TEXT NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_indicator_baseline (indicator_id, period_year, period_quarter),
  CONSTRAINT fk_baseline_indicator FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS indicator_targets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  indicator_id BIGINT UNSIGNED NOT NULL,
  period_year SMALLINT UNSIGNED NOT NULL,
  period_quarter TINYINT UNSIGNED NULL,
  target_decimal DECIMAL(18,4) NULL,
  target_text TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_indicator_target (indicator_id, period_year, period_quarter),
  CONSTRAINT fk_target_indicator FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS indicator_disaggregations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  indicator_id BIGINT UNSIGNED NOT NULL,
  dimension_name VARCHAR(120) NOT NULL,
  categories_json JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_indicator_disagg (indicator_id, dimension_name),
  CONSTRAINT fk_indicator_disagg_indicator FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS data_collection_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  indicator_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NULL,
  assigned_to_user_id BIGINT UNSIGNED NULL,
  status ENUM('PLANNED','OPEN','SUBMITTED','APPROVED','REJECTED','OVERDUE') NOT NULL DEFAULT 'PLANNED',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dcs_project (project_id),
  KEY idx_dcs_status (status),
  CONSTRAINT fk_dcs_indicator FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE CASCADE,
  CONSTRAINT fk_dcs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_dcs_assignee FOREIGN KEY (assigned_to_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS indicator_achievements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id BIGINT UNSIGNED NULL,
  indicator_id BIGINT UNSIGNED NOT NULL,
  project_id BIGINT UNSIGNED NOT NULL,
  collected_by_user_id BIGINT UNSIGNED NULL,
  collected_at DATETIME NULL,
  value_decimal DECIMAL(18,4) NULL,
  value_text TEXT NULL,
  status ENUM('DRAFT','SUBMITTED','APPROVED','REJECTED','NEEDS_REVISION') NOT NULL DEFAULT 'DRAFT',
  reviewer_comment TEXT NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ach_indicator (indicator_id),
  KEY idx_ach_project (project_id),
  KEY idx_ach_status (status),
  CONSTRAINT fk_ach_schedule FOREIGN KEY (schedule_id) REFERENCES data_collection_schedules(id) ON DELETE SET NULL,
  CONSTRAINT fk_ach_indicator FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE CASCADE,
  CONSTRAINT fk_ach_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_ach_collector FOREIGN KEY (collected_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS achievement_disaggregations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  achievement_id BIGINT UNSIGNED NOT NULL,
  dimension_name VARCHAR(120) NOT NULL,
  category VARCHAR(200) NOT NULL,
  value_decimal DECIMAL(18,4) NULL,
  value_text TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_ach_disagg_ach (achievement_id),
  CONSTRAINT fk_ach_disagg_ach FOREIGN KEY (achievement_id) REFERENCES indicator_achievements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS evidence_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type ENUM('WORKPLAN_ITEM','ACHIEVEMENT','REPORT','EVALUATION','DQA') NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(300) NOT NULL,
  mime_type VARCHAR(150) NULL,
  storage_url VARCHAR(900) NOT NULL,
  uploaded_by_user_id BIGINT UNSIGNED NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_evidence_entity (entity_type, entity_id),
  CONSTRAINT fk_evidence_uploader FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS dqa_assessments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status ENUM('DRAFT','FINALIZED','FOLLOW_UP') NOT NULL DEFAULT 'DRAFT',
  lead_user_id BIGINT UNSIGNED NULL,
  summary TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dqa_project (project_id),
  CONSTRAINT fk_dqa_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_dqa_lead FOREIGN KEY (lead_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS dqa_findings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assessment_id BIGINT UNSIGNED NOT NULL,
  dimension ENUM('COMPLETENESS','TIMELINESS','CONSISTENCY','VALIDITY','INTEGRITY') NOT NULL,
  severity ENUM('LOW','MEDIUM','HIGH') NOT NULL DEFAULT 'MEDIUM',
  description TEXT NOT NULL,
  corrective_action TEXT NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  due_date DATE NULL,
  status ENUM('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'NOT_STARTED',
  closed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dqa_findings_assessment (assessment_id),
  CONSTRAINT fk_dqa_findings_assessment FOREIGN KEY (assessment_id) REFERENCES dqa_assessments(id) ON DELETE CASCADE,
  CONSTRAINT fk_dqa_findings_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS evaluations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  eval_type ENUM('MID_TERM','ENDLINE','ADHOC') NOT NULL DEFAULT 'ADHOC',
  status ENUM('PLANNED','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'PLANNED',
  start_date DATE NULL,
  end_date DATE NULL,
  summary TEXT NULL,
  report_file_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eval_project (project_id),
  CONSTRAINT fk_eval_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_report_file FOREIGN KEY (report_file_id) REFERENCES evidence_files(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS lessons_learned (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  lesson_date DATE NOT NULL,
  title VARCHAR(500) NOT NULL,
  detail TEXT NOT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lessons_project (project_id),
  CONSTRAINT fk_lessons_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_lessons_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS strategy_adjustments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  status ENUM('PROPOSED','APPROVED','IMPLEMENTED') NOT NULL DEFAULT 'PROPOSED',
  title VARCHAR(500) NOT NULL,
  rationale TEXT NOT NULL,
  evidence_reference TEXT NULL,
  approved_by_user_id BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  implemented_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_adjust_project (project_id),
  CONSTRAINT fk_adjust_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_adjust_approved_by FOREIGN KEY (approved_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS budgets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  fiscal_year SMALLINT UNSIGNED NOT NULL,
  funding_source_id BIGINT UNSIGNED NULL,
  currency ENUM('USD','EUR','ETB','CDF','XOF','ZAR','NGN','KES','UGX','TZS','GHS','OTHER') NOT NULL DEFAULT 'USD',
  status ENUM('DRAFT','IN_REVIEW','APPROVED','LOCKED') NOT NULL DEFAULT 'DRAFT',
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  approved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_budget_project_year (project_id, fiscal_year, funding_source_id),
  KEY idx_budget_status (status),
  CONSTRAINT fk_budget_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_funding FOREIGN KEY (funding_source_id) REFERENCES funding_sources(id),
  CONSTRAINT fk_budget_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS budget_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  budget_id BIGINT UNSIGNED NOT NULL,
  sap_budget_code_id BIGINT UNSIGNED NOT NULL,
  workplan_item_id BIGINT UNSIGNED NULL,
  result_id BIGINT UNSIGNED NULL,
  description VARCHAR(600) NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  cost_center VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_budget_lines_budget (budget_id),
  KEY idx_budget_lines_sap (sap_budget_code_id),
  CONSTRAINT fk_budget_lines_budget FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_lines_sap FOREIGN KEY (sap_budget_code_id) REFERENCES sap_budget_codes(id),
  CONSTRAINT fk_budget_lines_wpi FOREIGN KEY (workplan_item_id) REFERENCES workplan_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_budget_lines_result FOREIGN KEY (result_id) REFERENCES results(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS expenditures (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id BIGINT UNSIGNED NOT NULL,
  sap_budget_code_id BIGINT UNSIGNED NULL,
  transaction_date DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency ENUM('USD','EUR','ETB','CDF','XOF','ZAR','NGN','KES','UGX','TZS','GHS','OTHER') NOT NULL DEFAULT 'USD',
  source ENUM('SAP','MANUAL','OTHER') NOT NULL DEFAULT 'SAP',
  reference VARCHAR(180) NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_exp_project_date (project_id, transaction_date),
  CONSTRAINT fk_exp_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_exp_sap FOREIGN KEY (sap_budget_code_id) REFERENCES sap_budget_codes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
