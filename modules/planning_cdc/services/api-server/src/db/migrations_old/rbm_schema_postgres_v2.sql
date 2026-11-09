-- RBM Platform schema (PostgreSQL) | Africa CDC | v2

CREATE TABLE IF NOT EXISTS business_units (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  parent_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_business_units_code UNIQUE (code),
  CONSTRAINT fk_business_units_parent FOREIGN KEY (parent_id) REFERENCES business_units(id)
);
CREATE INDEX IF NOT EXISTS idx_business_units_parent ON business_units(parent_id);

CREATE TABLE IF NOT EXISTS countries (
  id BIGSERIAL PRIMARY KEY,
  iso2 CHAR(2) NULL,
  name VARCHAR(255) NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_countries_iso2 UNIQUE (iso2)
);
CREATE INDEX IF NOT EXISTS idx_countries_internal ON countries(is_internal);

CREATE TABLE IF NOT EXISTS partner_organizations (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  org_type VARCHAR(30) NOT NULL DEFAULT 'OTHER' CHECK (org_type IN ('DONOR','IMPLEMENTING_PARTNER','GOVERNMENT','NGO','PRIVATE','OTHER')),
  status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_partner_org_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  user_type VARCHAR(10) NOT NULL DEFAULT 'STAFF' CHECK (user_type IN ('STAFF','PARTNER')),
  status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  password_hash VARCHAR(255) NULL,
  business_unit_id BIGINT NULL,
  partner_org_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT fk_users_bu FOREIGN KEY (business_unit_id) REFERENCES business_units(id),
  CONSTRAINT fk_users_partner_org FOREIGN KEY (partner_org_id) REFERENCES partner_organizations(id)
);
CREATE INDEX IF NOT EXISTS idx_users_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_bu ON users(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_users_partner_org ON users(partner_org_id);

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_roles_code UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);

CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  team_type VARCHAR(20) NOT NULL DEFAULT 'OTHER' CHECK (team_type IN ('REVIEW','DQA','FINANCE','PROJECT','OTHER')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_teams_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  membership_role VARCHAR(10) NOT NULL DEFAULT 'MEMBER' CHECK (membership_role IN ('MEMBER','LEAD','VIEWER')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, user_id),
  CONSTRAINT fk_team_members_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT fk_team_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

CREATE TABLE IF NOT EXISTS partner_access_scopes (
  id BIGSERIAL PRIMARY KEY,
  partner_org_id BIGINT NOT NULL,
  scope_type VARCHAR(20) NOT NULL CHECK (scope_type IN ('PROGRAM','PROJECT','REPORT')),
  scope_id BIGINT NOT NULL,
  access_level VARCHAR(10) NOT NULL DEFAULT 'VIEW' CHECK (access_level IN ('VIEW','COMMENT')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_partner_scopes_org FOREIGN KEY (partner_org_id) REFERENCES partner_organizations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_partner_scopes_org ON partner_access_scopes(partner_org_id);
CREATE INDEX IF NOT EXISTS idx_partner_scopes_scope ON partner_access_scopes(scope_type, scope_id);

CREATE TABLE IF NOT EXISTS sap_budget_codes (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(80) NOT NULL,
  description VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from DATE NULL,
  valid_to DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_sap_budget_codes_code UNIQUE (code)
);
CREATE INDEX IF NOT EXISTS idx_sap_budget_codes_active ON sap_budget_codes(is_active);

CREATE TABLE IF NOT EXISTS funding_sources (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  partner_org_id BIGINT NULL,
  currency VARCHAR(5) NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','EUR','ETB','CDF','XOF','ZAR','NGN','KES','UGX','TZS','GHS','OTHER')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_funding_sources_code UNIQUE (code),
  CONSTRAINT fk_funding_sources_partner FOREIGN KEY (partner_org_id) REFERENCES partner_organizations(id)
);
CREATE INDEX IF NOT EXISTS idx_funding_sources_partner ON funding_sources(partner_org_id);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id BIGSERIAL PRIMARY KEY,
  rate_date DATE NOT NULL,
  from_currency VARCHAR(5) NOT NULL CHECK (from_currency IN ('USD','EUR','ETB','CDF','XOF','ZAR','NGN','KES','UGX','TZS','GHS','OTHER')),
  to_currency VARCHAR(5) NOT NULL CHECK (to_currency IN ('USD','EUR','ETB','CDF','XOF','ZAR','NGN','KES','UGX','TZS','GHS','OTHER')),
  rate DECIMAL(18,8) NOT NULL,
  source VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_exchange_rates UNIQUE (rate_date, from_currency, to_currency)
);

CREATE TABLE IF NOT EXISTS strategic_plans (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','ARCHIVED')),
  business_unit_id BIGINT NULL,
  owner_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_strategic_plans_code UNIQUE (code),
  CONSTRAINT fk_sp_bu FOREIGN KEY (business_unit_id) REFERENCES business_units(id),
  CONSTRAINT fk_sp_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_strategic_plans_status ON strategic_plans(status);

CREATE TABLE IF NOT EXISTS strategic_objectives (
  id BIGSERIAL PRIMARY KEY,
  strategic_plan_id BIGINT NOT NULL,
  parent_id BIGINT NULL,
  code VARCHAR(80) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NULL,
  level_index INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','ARCHIVED')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_strat_obj UNIQUE (strategic_plan_id, code),
  CONSTRAINT fk_strat_obj_plan FOREIGN KEY (strategic_plan_id) REFERENCES strategic_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_strat_obj_parent FOREIGN KEY (parent_id) REFERENCES strategic_objectives(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_strat_obj_plan ON strategic_objectives(strategic_plan_id);

CREATE TABLE IF NOT EXISTS programs (
  id BIGSERIAL PRIMARY KEY,
  strategic_plan_id BIGINT NOT NULL,
  strategic_objective_id BIGINT NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','ARCHIVED')),
  business_unit_id BIGINT NULL,
  country_id BIGINT NULL,
  owner_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_programs_code UNIQUE (code),
  CONSTRAINT fk_programs_plan FOREIGN KEY (strategic_plan_id) REFERENCES strategic_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_programs_strat_obj FOREIGN KEY (strategic_objective_id) REFERENCES strategic_objectives(id),
  CONSTRAINT fk_programs_bu FOREIGN KEY (business_unit_id) REFERENCES business_units(id),
  CONSTRAINT fk_programs_country FOREIGN KEY (country_id) REFERENCES countries(id),
  CONSTRAINT fk_programs_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_programs_plan ON programs(strategic_plan_id);
CREATE INDEX IF NOT EXISTS idx_programs_status ON programs(status);
CREATE INDEX IF NOT EXISTS idx_programs_country ON programs(country_id);

CREATE TABLE IF NOT EXISTS projects (
  id BIGSERIAL PRIMARY KEY,
  program_id BIGINT NOT NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','IN_EXECUTION','CLOSED','ARCHIVED')),
  business_unit_id BIGINT NULL,
  country_id BIGINT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  manager_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_projects_code UNIQUE (code),
  CONSTRAINT fk_projects_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_projects_bu FOREIGN KEY (business_unit_id) REFERENCES business_units(id),
  CONSTRAINT fk_projects_country FOREIGN KEY (country_id) REFERENCES countries(id),
  CONSTRAINT fk_projects_manager FOREIGN KEY (manager_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_projects_program ON projects(program_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_country ON projects(country_id);

CREATE TABLE IF NOT EXISTS approval_instances (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN ('STRATEGIC_PLAN','STRATEGIC_OBJECTIVE','PROGRAM','PROJECT','RESULTS_CHAIN','LOGFRAME','WORKPLAN','BUDGET','ACHIEVEMENT','REPORT','INTEGRATION')),
  entity_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CHANGES_REQUESTED')),
  created_by_user_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  CONSTRAINT fk_approval_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_approval_entity ON approval_instances(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_instances(status);

CREATE TABLE IF NOT EXISTS approval_steps (
  id BIGSERIAL PRIMARY KEY,
  approval_instance_id BIGINT NOT NULL,
  step_no INTEGER NOT NULL,
  assigned_to_user_id BIGINT NOT NULL,
  decision VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (decision IN ('PENDING','APPROVED','REJECTED','CHANGES_REQUESTED')),
  decided_at TIMESTAMP NULL,
  comment TEXT NULL,
  CONSTRAINT uq_approval_steps UNIQUE (approval_instance_id, step_no),
  CONSTRAINT fk_approval_steps_instance FOREIGN KEY (approval_instance_id) REFERENCES approval_instances(id) ON DELETE CASCADE,
  CONSTRAINT fk_approval_steps_user FOREIGN KEY (assigned_to_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_approval_steps_assignee ON approval_steps(assigned_to_user_id);

CREATE TABLE IF NOT EXISTS version_snapshots (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN ('STRATEGIC_PLAN','STRATEGIC_OBJECTIVE','PROGRAM','PROJECT','RESULTS_CHAIN','LOGFRAME','WORKPLAN','BUDGET','REPORT')),
  entity_id BIGINT NOT NULL,
  version_no INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'APPROVED' CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','ARCHIVED')),
  snapshot_json JSONB NOT NULL,
  created_by_user_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_version_snapshot UNIQUE (entity_type, entity_id, version_no),
  CONSTRAINT fk_version_snapshot_user FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_version_snapshot_entity ON version_snapshots(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS results (
  id BIGSERIAL PRIMARY KEY,
  strategic_plan_id BIGINT NULL,
  program_id BIGINT NULL,
  project_id BIGINT NULL,
  level VARCHAR(10) NOT NULL CHECK (level IN ('IMPACT','GOAL','OUTCOME','OUTPUT')),
  code VARCHAR(120) NULL,
  title VARCHAR(800) NOT NULL,
  description TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','ARCHIVED')),
  owner_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_results_sp FOREIGN KEY (strategic_plan_id) REFERENCES strategic_plans(id) ON DELETE CASCADE,
  CONSTRAINT fk_results_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_results_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_results_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_results_level ON results(level);
CREATE INDEX IF NOT EXISTS idx_results_project ON results(project_id);

CREATE TABLE IF NOT EXISTS results_links (
  id BIGSERIAL PRIMARY KEY,
  from_result_id BIGINT NOT NULL,
  to_result_id BIGINT NOT NULL,
  link_type VARCHAR(10) NOT NULL DEFAULT 'CAUSAL' CHECK (link_type IN ('CAUSAL')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_results_link UNIQUE (from_result_id, to_result_id),
  CONSTRAINT fk_results_link_from FOREIGN KEY (from_result_id) REFERENCES results(id) ON DELETE CASCADE,
  CONSTRAINT fk_results_link_to FOREIGN KEY (to_result_id) REFERENCES results(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS means_of_verification (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(80) NULL,
  title VARCHAR(255) NOT NULL,
  mov_type VARCHAR(20) NOT NULL DEFAULT 'OTHER' CHECK (mov_type IN ('DOCUMENT_REVIEW','SURVEY','ADMIN_DATA','SYSTEM','OTHER')),
  description TEXT NULL,
  url VARCHAR(600) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_mov_code UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS logframe_matrices (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','ARCHIVED')),
  version_snapshot_id BIGINT NULL,
  created_by_user_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_logframe_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_logframe_snapshot FOREIGN KEY (version_snapshot_id) REFERENCES version_snapshots(id),
  CONSTRAINT fk_logframe_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_logframe_project ON logframe_matrices(project_id);

CREATE TABLE IF NOT EXISTS logframe_rows (
  id BIGSERIAL PRIMARY KEY,
  logframe_id BIGINT NOT NULL,
  row_level VARCHAR(10) NOT NULL CHECK (row_level IN ('GOAL','OUTCOME','OUTPUT','ACTIVITY')),
  result_id BIGINT NULL,
  statement TEXT NOT NULL,
  mov_text TEXT NULL,
  assumptions_text TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_logframe_rows_logframe FOREIGN KEY (logframe_id) REFERENCES logframe_matrices(id) ON DELETE CASCADE,
  CONSTRAINT fk_logframe_rows_result FOREIGN KEY (result_id) REFERENCES results(id)
);
CREATE INDEX IF NOT EXISTS idx_logframe_rows_logframe ON logframe_rows(logframe_id);
CREATE INDEX IF NOT EXISTS idx_logframe_rows_level ON logframe_rows(row_level);

CREATE TABLE IF NOT EXISTS assumptions (
  id BIGSERIAL PRIMARY KEY,
  result_id BIGINT NULL,
  logframe_row_id BIGINT NULL,
  assumption_type VARCHAR(15) NOT NULL DEFAULT 'ASSUMPTION' CHECK (assumption_type IN ('ASSUMPTION','RISK')),
  description TEXT NOT NULL,
  mitigation TEXT NULL,
  owner_user_id BIGINT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assumptions_result FOREIGN KEY (result_id) REFERENCES results(id) ON DELETE CASCADE,
  CONSTRAINT fk_assumptions_row FOREIGN KEY (logframe_row_id) REFERENCES logframe_rows(id) ON DELETE CASCADE,
  CONSTRAINT fk_assumptions_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_assumptions_result ON assumptions(result_id);
CREATE INDEX IF NOT EXISTS idx_assumptions_logframe_row ON assumptions(logframe_row_id);

CREATE TABLE IF NOT EXISTS workplans (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  period_type VARCHAR(15) NOT NULL DEFAULT 'ANNUAL' CHECK (period_type IN ('ANNUAL','QUARTERLY')),
  year SMALLINT NOT NULL,
  quarter SMALLINT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','IN_EXECUTION','CLOSED')),
  start_date DATE NULL,
  end_date DATE NULL,
  owner_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_workplans_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_workplans_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_workplans_project ON workplans(project_id);
CREATE INDEX IF NOT EXISTS idx_workplans_year ON workplans(year);

CREATE TABLE IF NOT EXISTS workplan_items (
  id BIGSERIAL PRIMARY KEY,
  workplan_id BIGINT NOT NULL,
  parent_id BIGINT NULL,
  code VARCHAR(80) NULL,
  item_type VARCHAR(15) NOT NULL DEFAULT 'ACTIVITY' CHECK (item_type IN ('ACTIVITY','DELIVERABLE','TASK')),
  title VARCHAR(500) NOT NULL,
  description TEXT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  status VARCHAR(15) NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')),
  priority VARCHAR(10) NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH')),
  assignee_user_id BIGINT NULL,
  accountable_user_id BIGINT NULL,
  percent_complete DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  result_id BIGINT NULL,
  logframe_row_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wpi_workplan FOREIGN KEY (workplan_id) REFERENCES workplans(id) ON DELETE CASCADE,
  CONSTRAINT fk_wpi_parent FOREIGN KEY (parent_id) REFERENCES workplan_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_wpi_assignee FOREIGN KEY (assignee_user_id) REFERENCES users(id),
  CONSTRAINT fk_wpi_accountable FOREIGN KEY (accountable_user_id) REFERENCES users(id),
  CONSTRAINT fk_wpi_result FOREIGN KEY (result_id) REFERENCES results(id),
  CONSTRAINT fk_wpi_logframe_row FOREIGN KEY (logframe_row_id) REFERENCES logframe_rows(id)
);
CREATE INDEX IF NOT EXISTS idx_workplan_items_workplan ON workplan_items(workplan_id);
CREATE INDEX IF NOT EXISTS idx_workplan_items_status ON workplan_items(status);
CREATE INDEX IF NOT EXISTS idx_workplan_items_parent ON workplan_items(parent_id);

CREATE TABLE IF NOT EXISTS milestones (
  id BIGSERIAL PRIMARY KEY,
  workplan_id BIGINT NOT NULL,
  workplan_item_id BIGINT NULL,
  title VARCHAR(500) NOT NULL,
  due_date DATE NULL,
  status VARCHAR(15) NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_milestones_workplan FOREIGN KEY (workplan_id) REFERENCES workplans(id) ON DELETE CASCADE,
  CONSTRAINT fk_milestones_item FOREIGN KEY (workplan_item_id) REFERENCES workplan_items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_milestones_workplan ON milestones(workplan_id);
CREATE INDEX IF NOT EXISTS idx_milestones_item ON milestones(workplan_item_id);

CREATE TABLE IF NOT EXISTS workplan_dependencies (
  id BIGSERIAL PRIMARY KEY,
  predecessor_item_id BIGINT NOT NULL,
  successor_item_id BIGINT NOT NULL,
  dependency_type VARCHAR(20) NOT NULL DEFAULT 'FINISH_TO_START' CHECK (dependency_type IN ('FINISH_TO_START','START_TO_START','FINISH_TO_FINISH','START_TO_FINISH')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_workplan_dep UNIQUE (predecessor_item_id, successor_item_id),
  CONSTRAINT fk_workplan_dep_pred FOREIGN KEY (predecessor_item_id) REFERENCES workplan_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_workplan_dep_succ FOREIGN KEY (successor_item_id) REFERENCES workplan_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_workplan_dep_successor ON workplan_dependencies(successor_item_id);

CREATE TABLE IF NOT EXISTS progress_updates (
  id BIGSERIAL PRIMARY KEY,
  workplan_item_id BIGINT NOT NULL,
  by_user_id BIGINT NOT NULL,
  update_date DATE NOT NULL,
  percent_complete DECIMAL(5,2) NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_progress_item FOREIGN KEY (workplan_item_id) REFERENCES workplan_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_progress_user FOREIGN KEY (by_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_progress_updates_item ON progress_updates(workplan_item_id);

CREATE TABLE IF NOT EXISTS indicators (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(120) NOT NULL,
  name VARCHAR(500) NOT NULL,
  description TEXT NULL,
  indicator_type VARCHAR(20) NOT NULL DEFAULT 'QUANTITATIVE' CHECK (indicator_type IN ('QUANTITATIVE','QUALITATIVE','BINARY','INDEX')),
  unit VARCHAR(10) NOT NULL DEFAULT 'NUMBER' CHECK (unit IN ('NUMBER','PERCENT','USD','SCORE','TEXT')),
  frequency VARCHAR(15) NOT NULL DEFAULT 'QUARTERLY' CHECK (frequency IN ('MONTHLY','QUARTERLY','SEMI_ANNUAL','ANNUAL','ADHOC')),
  status VARCHAR(10) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  result_id BIGINT NULL,
  project_id BIGINT NULL,
  logframe_row_id BIGINT NULL,
  mov_id BIGINT NULL,
  owner_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_indicators_code UNIQUE (code),
  CONSTRAINT fk_indicators_result FOREIGN KEY (result_id) REFERENCES results(id),
  CONSTRAINT fk_indicators_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_indicators_row FOREIGN KEY (logframe_row_id) REFERENCES logframe_rows(id),
  CONSTRAINT fk_indicators_mov FOREIGN KEY (mov_id) REFERENCES means_of_verification(id),
  CONSTRAINT fk_indicators_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_indicators_project ON indicators(project_id);
CREATE INDEX IF NOT EXISTS idx_indicators_status ON indicators(status);

CREATE TABLE IF NOT EXISTS indicator_baselines (
  id BIGSERIAL PRIMARY KEY,
  indicator_id BIGINT NOT NULL,
  period_year SMALLINT NOT NULL,
  period_quarter SMALLINT NULL,
  value_decimal DECIMAL(18,4) NULL,
  value_text TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_indicator_baseline UNIQUE (indicator_id, period_year, period_quarter),
  CONSTRAINT fk_baseline_indicator FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS indicator_targets (
  id BIGSERIAL PRIMARY KEY,
  indicator_id BIGINT NOT NULL,
  period_year SMALLINT NOT NULL,
  period_quarter SMALLINT NULL,
  target_decimal DECIMAL(18,4) NULL,
  target_text TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_indicator_target UNIQUE (indicator_id, period_year, period_quarter),
  CONSTRAINT fk_target_indicator FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS indicator_disaggregations (
  id BIGSERIAL PRIMARY KEY,
  indicator_id BIGINT NOT NULL,
  dimension_name VARCHAR(120) NOT NULL,
  categories_json JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_indicator_disagg UNIQUE (indicator_id, dimension_name),
  CONSTRAINT fk_indicator_disagg_indicator FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS data_collection_schedules (
  id BIGSERIAL PRIMARY KEY,
  indicator_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NULL,
  assigned_to_user_id BIGINT NULL,
  status VARCHAR(15) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','OPEN','SUBMITTED','APPROVED','REJECTED','OVERDUE')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dcs_indicator FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE CASCADE,
  CONSTRAINT fk_dcs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_dcs_assignee FOREIGN KEY (assigned_to_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_dcs_project ON data_collection_schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_dcs_status ON data_collection_schedules(status);

CREATE TABLE IF NOT EXISTS indicator_achievements (
  id BIGSERIAL PRIMARY KEY,
  schedule_id BIGINT NULL,
  indicator_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  collected_by_user_id BIGINT NULL,
  collected_at TIMESTAMP NULL,
  value_decimal DECIMAL(18,4) NULL,
  value_text TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','NEEDS_REVISION')),
  reviewer_comment TEXT NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ach_schedule FOREIGN KEY (schedule_id) REFERENCES data_collection_schedules(id) ON DELETE SET NULL,
  CONSTRAINT fk_ach_indicator FOREIGN KEY (indicator_id) REFERENCES indicators(id) ON DELETE CASCADE,
  CONSTRAINT fk_ach_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_ach_collector FOREIGN KEY (collected_by_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_ach_indicator ON indicator_achievements(indicator_id);
CREATE INDEX IF NOT EXISTS idx_ach_project ON indicator_achievements(project_id);
CREATE INDEX IF NOT EXISTS idx_ach_status ON indicator_achievements(status);

CREATE TABLE IF NOT EXISTS achievement_disaggregations (
  id BIGSERIAL PRIMARY KEY,
  achievement_id BIGINT NOT NULL,
  dimension_name VARCHAR(120) NOT NULL,
  category VARCHAR(200) NOT NULL,
  value_decimal DECIMAL(18,4) NULL,
  value_text TEXT NULL,
  CONSTRAINT fk_ach_disagg_ach FOREIGN KEY (achievement_id) REFERENCES indicator_achievements(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ach_disagg_ach ON achievement_disaggregations(achievement_id);

CREATE TABLE IF NOT EXISTS evidence_files (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('WORKPLAN_ITEM','ACHIEVEMENT','REPORT','EVALUATION','DQA')),
  entity_id BIGINT NOT NULL,
  file_name VARCHAR(300) NOT NULL,
  mime_type VARCHAR(150) NULL,
  storage_url VARCHAR(900) NOT NULL,
  uploaded_by_user_id BIGINT NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_evidence_uploader FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_evidence_entity ON evidence_files(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS dqa_assessments (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(15) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','FINALIZED','FOLLOW_UP')),
  lead_user_id BIGINT NULL,
  summary TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dqa_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_dqa_lead FOREIGN KEY (lead_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_dqa_project ON dqa_assessments(project_id);

CREATE TABLE IF NOT EXISTS dqa_findings (
  id BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT NOT NULL,
  dimension VARCHAR(15) NOT NULL CHECK (dimension IN ('COMPLETENESS','TIMELINESS','CONSISTENCY','VALIDITY','INTEGRITY')),
  severity VARCHAR(10) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW','MEDIUM','HIGH')),
  description TEXT NOT NULL,
  corrective_action TEXT NULL,
  owner_user_id BIGINT NULL,
  due_date DATE NULL,
  status VARCHAR(15) NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')),
  closed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dqa_findings_assessment FOREIGN KEY (assessment_id) REFERENCES dqa_assessments(id) ON DELETE CASCADE,
  CONSTRAINT fk_dqa_findings_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_dqa_findings_assessment ON dqa_findings(assessment_id);

CREATE TABLE IF NOT EXISTS evaluations (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  eval_type VARCHAR(15) NOT NULL DEFAULT 'ADHOC' CHECK (eval_type IN ('MID_TERM','ENDLINE','ADHOC')),
  status VARCHAR(15) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED')),
  start_date DATE NULL,
  end_date DATE NULL,
  summary TEXT NULL,
  report_file_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_eval_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_report_file FOREIGN KEY (report_file_id) REFERENCES evidence_files(id)
);
CREATE INDEX IF NOT EXISTS idx_eval_project ON evaluations(project_id);

CREATE TABLE IF NOT EXISTS lessons_learned (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  lesson_date DATE NOT NULL,
  title VARCHAR(500) NOT NULL,
  detail TEXT NOT NULL,
  created_by_user_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_lessons_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_lessons_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_lessons_project ON lessons_learned(project_id);

CREATE TABLE IF NOT EXISTS strategy_adjustments (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  status VARCHAR(15) NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','APPROVED','IMPLEMENTED')),
  title VARCHAR(500) NOT NULL,
  rationale TEXT NOT NULL,
  evidence_reference TEXT NULL,
  approved_by_user_id BIGINT NULL,
  approved_at TIMESTAMP NULL,
  implemented_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_adjust_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_adjust_approved_by FOREIGN KEY (approved_by_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_adjust_project ON strategy_adjustments(project_id);

CREATE TABLE IF NOT EXISTS budgets (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  fiscal_year SMALLINT NOT NULL,
  funding_source_id BIGINT NULL,
  currency VARCHAR(5) NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','EUR','ETB','CDF','XOF','ZAR','NGN','KES','UGX','TZS','GHS','OTHER')),
  status VARCHAR(15) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','IN_REVIEW','APPROVED','LOCKED')),
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_by_user_id BIGINT NOT NULL,
  approved_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_budget_project_year UNIQUE (project_id, fiscal_year, funding_source_id),
  CONSTRAINT fk_budget_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_funding FOREIGN KEY (funding_source_id) REFERENCES funding_sources(id),
  CONSTRAINT fk_budget_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_budget_status ON budgets(status);

CREATE TABLE IF NOT EXISTS budget_lines (
  id BIGSERIAL PRIMARY KEY,
  budget_id BIGINT NOT NULL,
  sap_budget_code_id BIGINT NOT NULL,
  workplan_item_id BIGINT NULL,
  result_id BIGINT NULL,
  description VARCHAR(600) NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  cost_center VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_budget_lines_budget FOREIGN KEY (budget_id) REFERENCES budgets(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_lines_sap FOREIGN KEY (sap_budget_code_id) REFERENCES sap_budget_codes(id),
  CONSTRAINT fk_budget_lines_wpi FOREIGN KEY (workplan_item_id) REFERENCES workplan_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_budget_lines_result FOREIGN KEY (result_id) REFERENCES results(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_budget_lines_budget ON budget_lines(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_sap ON budget_lines(sap_budget_code_id);

CREATE TABLE IF NOT EXISTS expenditures (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  sap_budget_code_id BIGINT NULL,
  transaction_date DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency VARCHAR(5) NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','EUR','ETB','CDF','XOF','ZAR','NGN','KES','UGX','TZS','GHS','OTHER')),
  source VARCHAR(10) NOT NULL DEFAULT 'SAP' CHECK (source IN ('SAP','MANUAL','OTHER')),
  reference VARCHAR(180) NULL,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_exp_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_exp_sap FOREIGN KEY (sap_budget_code_id) REFERENCES sap_budget_codes(id)
);
CREATE INDEX IF NOT EXISTS idx_exp_project_date ON expenditures(project_id, transaction_date);
