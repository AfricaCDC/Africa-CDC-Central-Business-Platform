/**
 * AMERT v3 — Reference Data Seeds
 * Source: AMERT_Tech_Spec_v3.docx
 *
 * Seeds: tiers, strategic_plan, division_codes, partners, business_units, roles, users
 */

exports.seed = async function (knex) {
  // ═══════════════════════════════════════════
  // TIERS (5 fixed rows — Table 1 v3)
  // ═══════════════════════════════════════════
  await knex('tiers').del();
  await knex('tiers').insert([
    { tier_id: 1, tier_label: 'Tier 1', indicator_types: 'Impact, Long-term Outcome', sp_level: 'Priority Goals', timeframe: '5y+' },
    { tier_id: 2, tier_label: 'Tier 2', indicator_types: 'Intermediate Outcome', sp_level: 'Strategic & Enablers Objectives', timeframe: '1-3y' },
    { tier_id: 3, tier_label: 'Tier 3', indicator_types: 'Short-term Outcome', sp_level: 'Initiatives (Strategic & Enablers)', timeframe: '<1y' },
    { tier_id: 4, tier_label: 'Tier 4', indicator_types: 'Output', sp_level: 'Initiatives (Strategic & Enablers)', timeframe: 'Immediate' },
    { tier_id: 5, tier_label: 'Tier 5', indicator_types: 'Process, Input', sp_level: 'Annual Workplan (Activities & Tasks)', timeframe: 'Operational' },
  ]);

  // ═══════════════════════════════════════════
  // STRATEGIC PLAN — 13 Priority Areas (Table 2 v3)
  // ═══════════════════════════════════════════
  await knex('strategic_plan').del();
  await knex('strategic_plan').insert([
    { sp_type: 'priority', sp_code: 'P1', sp_number_int: 1, short_name: 'Health Systems', full_goal: 'Strengthen integrated health systems to prevent and control high-burden diseases' },
    { sp_type: 'priority', sp_code: 'P2', sp_number_int: 2, short_name: 'Surveillance', full_goal: 'Build up proactive surveillance, intelligence gathering and early warning systems' },
    { sp_type: 'priority', sp_code: 'P3', sp_number_int: 3, short_name: 'Emergency PPPR', full_goal: 'Ensure robust emergency preparedness and response capabilities for all public health emergencies' },
    { sp_type: 'priority', sp_code: 'P4', sp_number_int: 4, short_name: 'NPHIs', full_goal: 'Strengthen National Public Health Institutions' },
    { sp_type: 'priority', sp_code: 'P5', sp_number_int: 5, short_name: 'Laboratories', full_goal: 'Expand clinical and public health laboratory systems and networks' },
    { sp_type: 'priority', sp_code: 'P6', sp_number_int: 6, short_name: 'Manufacturing', full_goal: 'Expand health product and technology innovation and manufacturing' },
    { sp_type: 'enabler', sp_code: 'EA', sp_number_int: 7, short_name: 'Digital', full_goal: 'Enhanced and integrated digital and analytics approaches to public health in Africa' },
    { sp_type: 'enabler', sp_code: 'EB', sp_number_int: 8, short_name: 'Workforce', full_goal: 'Scaled up and best-in-class African public health workforce' },
    { sp_type: 'enabler', sp_code: 'EC', sp_number_int: 9, short_name: 'Financing', full_goal: 'Secured and sustainable financing for public health in Africa' },
    { sp_type: 'enabler', sp_code: 'ED', sp_number_int: 10, short_name: 'Research', full_goal: 'Strengthened public health research and innovation' },
    { sp_type: 'enabler', sp_code: 'EE', sp_number_int: 11, short_name: 'Partnerships', full_goal: 'Coordinated, respectful and action-oriented public health partnerships' },
    { sp_type: 'enabler', sp_code: 'EF', sp_number_int: 12, short_name: 'RCCs', full_goal: 'Strengthened engagement and support of Member States through RCCs and in-country presence' },
    { sp_type: 'enabler', sp_code: 'EG', sp_number_int: 13, short_name: 'Governance', full_goal: 'Strengthened governance, internal structures, processes and capacity to enable Africa CDC to deliver on its mandate' },
  ]);

  // ═══════════════════════════════════════════
  // DIVISION CODES — 63 codes (Table 27 v3)
  // ═══════════════════════════════════════════
  await knex('division_codes').del();
  await knex('division_codes').insert([
    { code: 'AfCDC', division_name: 'Africa CDC (institution-wide / vision)', directorate: null, office: null },
    { code: 'DG', division_name: 'Office of the Director General', directorate: null, office: 'Office of the DG' },
    // DDS merged into Legal (alias merge D-20260710-01) — do not reseed.
    { code: 'HEP', division_name: 'Division of Health Economics and Financing', directorate: null, office: 'Office of the DG' },
    { code: 'DIO', division_name: 'Division of Internal Oversight', directorate: null, office: 'Office of the DG' },
    { code: 'CPHIA', division_name: 'Africa Public Health Information Alliance', directorate: null, office: 'Office of the DG' },
    // MELP merged into PRA (D-20260709-02) — do not reseed it.
    { code: 'PRA', division_name: 'Division of Planning, Reporting and Accountability', directorate: null, office: 'Office of the DG' },
    { code: 'PHE', division_name: 'Office of the Director — Public Health Emergency', directorate: 'Centre for Public Health Emergency', office: null },
    { code: 'OneH', division_name: 'Division of One Health', directorate: 'Centre for Public Health Emergency', office: null },
    { code: 'EPR', division_name: 'Division of Preparedness and Resilience', directorate: 'Centre for Public Health Emergency', office: null },
    { code: 'RRR', division_name: 'Division of Response, Recovery and Rehabilitation', directorate: 'Centre for Public Health Emergency', office: null },
    { code: 'SDI', division_name: 'Division of Surveillance and Disease Intelligence', directorate: 'Centre for Public Health Emergency', office: null },
    { code: 'COMMS', division_name: 'Office of the Director — Communications', directorate: 'Directorate of Communications', office: null },
    { code: 'CPI_ASM', division_name: 'Division of Advocacy and Social Mobilization', directorate: 'Directorate of Communications', office: null },
    { code: 'CPI', division_name: 'Division of Strategic Communications and Public Information', directorate: 'Directorate of Communications', office: null },
    { code: 'CO', division_name: 'Country Offices', directorate: 'RCCs', office: null },
    { code: 'CARCC', division_name: 'Central Africa Regional Coordinating Centre', directorate: 'RCCs', office: null },
    { code: 'NARCC', division_name: 'Northern Africa Regional Coordinating Centre', directorate: 'RCCs', office: null },
    { code: 'EARCC', division_name: 'Eastern Africa Regional Coordinating Centre', directorate: 'RCCs', office: null },
    { code: 'SARCC', division_name: 'Southern Africa Regional Coordinating Centre', directorate: 'RCCs', office: null },
    { code: 'WARCC', division_name: 'Western Africa Regional Coordinating Centre', directorate: 'RCCs', office: null },
    { code: 'RCC', division_name: 'Regional Coordinating Centres (generic)', directorate: 'RCCs', office: null },
    { code: 'EO', division_name: 'Office of the SDO', directorate: null, office: 'Office of the SDO' },
    // ADIM merged into ASSET (alias merge D-20260710-01) — do not reseed.
    { code: 'ASSET', division_name: 'Division of Facility and Asset Management', directorate: 'Directorate of Administration', office: null },
    { code: 'HR', division_name: 'Division of Human Resource Management', directorate: 'Directorate of Administration', office: null },
    // HRMD merged into HR (alias merge D-20260710-01) — do not reseed.
    { code: 'MIS', division_name: 'Division of MIS', directorate: 'Directorate of Administration', office: null },
    { code: 'SCM', division_name: 'Division of Supply Chain Management', directorate: 'Directorate of Administration', office: null },
    { code: 'ADMIN', division_name: 'General Administration', directorate: 'Directorate of Administration', office: null },
    { code: 'SSS', division_name: 'Security and Safety Services', directorate: 'Directorate of Administration', office: null },
    { code: 'ERSE', division_name: 'Office of the Director — External Relations', directorate: 'Directorate of External Relations', office: null },
    { code: 'PIC', division_name: 'Division of Partnerships and International Cooperation', directorate: 'Directorate of External Relations', office: null },
    { code: 'PHD', division_name: 'Division of Policy and Health Diplomacy', directorate: 'Directorate of External Relations', office: null },
    { code: 'PIU', division_name: 'Programme Implementation Unit', directorate: 'Directorate of External Relations', office: null },
    { code: 'ACC', division_name: 'Division of Accounting and Reporting', directorate: 'Directorate of Finance', office: null },
    { code: 'FMG', division_name: 'Division of Financial Management', directorate: 'Directorate of Finance', office: null },
    { code: 'BGT', division_name: 'Division of Programme and Budgeting', directorate: 'Directorate of Finance', office: null },
    { code: 'DDG', division_name: 'Office of the DDG', directorate: null, office: 'Office of the DDG' },
    { code: 'CPHC', division_name: 'Office of the Director — CDPHP', directorate: 'Centre for Disease Control, Prevention and Health Promotion', office: null },
    { code: 'PHC-HP', division_name: 'Division of Health Promotion', directorate: 'Centre for Disease Control', office: null },
    { code: 'PHC-ID', division_name: 'Division of Infectious Diseases', directorate: 'Centre for Disease Control', office: null },
    { code: 'ID', division_name: 'Division of Infectious Diseases (alias)', directorate: 'Centre for Disease Control', office: null },
    { code: 'NCD', division_name: 'Division of NCDs, Injuries and Mental Health', directorate: 'Centre for Disease Control', office: null },
    { code: 'LSN', division_name: 'Office of the Director — LSN', directorate: 'Centre for Laboratory Systems and Networks', office: null },
    { code: 'CLSN', division_name: 'Centre for Laboratory Systems and Networks (global)', directorate: 'Priority 5 — Labs', office: null },
    { code: 'CLDS', division_name: 'Centre for Laboratory Diagnostics and Systems (alias)', directorate: 'Priority 5 — Labs', office: null },
    { code: 'RefLAB', division_name: 'Africa CDC Reference Laboratories', directorate: 'Centre for Laboratory Systems and Networks', office: null },
    { code: 'DIAG', division_name: 'Division of Diagnostic Access', directorate: 'Centre for Laboratory Systems and Networks', office: null },
    // LABNET merged into CLDS (alias merge D-20260710-01) — do not reseed.
    { code: 'PGI', division_name: 'Pathogen Genomics Institute', directorate: 'Centre for Laboratory Systems and Networks', office: null },
    { code: 'PHC', division_name: 'Office of the Director — Primary Health Care', directorate: 'Centre for Primary Healthcare', office: null },
    { code: 'CHSISD', division_name: 'Division of Community Health Systems and Integrated Service Delivery', directorate: 'Centre for Primary Healthcare', office: null },
    { code: 'IMZ', division_name: 'Division of Immunization', directorate: 'Centre for Primary Healthcare', office: null },
    { code: 'NUTRI', division_name: 'Division of Nutrition', directorate: 'Centre for Primary Healthcare', office: null },
    { code: 'SRH', division_name: 'Division of Sexual and Reproductive Health', directorate: 'Centre for Primary Healthcare', office: null },
    // PHIHSS merged into PHC (D-20260710-02) — do not reseed.
    { code: 'Wkf', division_name: 'Health Workforce Development', directorate: 'Centre for Primary Healthcare / Enabler B', office: null },
    { code: 'NPHI', division_name: 'National Public Health Institutes Division', directorate: 'Centre for Primary Healthcare / Priority 4', office: null },
    { code: 'YOUTH', division_name: 'Youth Division', directorate: 'Centre for Primary Healthcare', office: null },
    { code: 'KM', division_name: 'Division of Knowledge Management', directorate: 'Centre for Primary Healthcare', office: null },
    { code: 'Digital', division_name: 'Digital Health Division', directorate: 'Enabler A', office: null },
    { code: 'PHAHM', division_name: 'Platform for Harmonised African Health Manufacturing', directorate: 'Priority 6 + Enabler B', office: null },
    { code: 'SCI', division_name: 'Division of Science and Innovation / R&D', directorate: 'Enabler D', office: null },
    // HP merged into PHC-HP (alias merge D-20260710-01) — do not reseed.
    { code: 'LMHC', division_name: 'Local Manufacturing and Health Commodities (alias)', directorate: 'Priority 6', office: null },
    { code: 'Cross-cutting', division_name: 'Governance / institution-wide (Enabler G)', directorate: null, office: null },
  ]);

  // ═══════════════════════════════════════════
  // PARTNERS — 5 with dedicated RF (Table 12 v3)
  // ═══════════════════════════════════════════
  await knex('partners').del();
  await knex('partners').insert([
    { partner_name: 'African Development Bank (AfDB)', partner_type: 'donor', has_dedicated_rf: true },
    { partner_name: 'Gavi, The Vaccine Alliance', partner_type: 'donor', has_dedicated_rf: true },
    { partner_name: 'Mastercard Foundation', partner_type: 'donor', has_dedicated_rf: true },
    { partner_name: 'UNICEF', partner_type: 'donor', has_dedicated_rf: true },
    { partner_name: 'World Bank', partner_type: 'donor', has_dedicated_rf: true },
    { partner_name: 'African Union Commission (AUC)', partner_type: 'governance', has_dedicated_rf: false },
    { partner_name: 'WHO', partner_type: 'technical', has_dedicated_rf: false },
    { partner_name: 'GIZ', partner_type: 'donor', has_dedicated_rf: false },
    { partner_name: 'USAID', partner_type: 'donor', has_dedicated_rf: false },
    { partner_name: 'European Union', partner_type: 'donor', has_dedicated_rf: false },
  ]);

  // ═══════════════════════════════════════════
  // BUSINESS UNITS (top-level org structure)
  // ═══════════════════════════════════════════
  await knex('business_units').del();
  await knex('business_units').insert([
    { id: 1, code: 'ACDC', name: 'Africa CDC', parent_id: null },
    { id: 2, code: 'ODG', name: 'Office of the Director General', parent_id: 1 },
    { id: 3, code: 'CPHE', name: 'Centre for Public Health Emergency', parent_id: 1 },
    { id: 4, code: 'DCOMMS', name: 'Directorate of Communications', parent_id: 1 },
    { id: 5, code: 'DRCC', name: 'Regional Coordinating Centres', parent_id: 1 },
    { id: 6, code: 'OSDO', name: 'Office of the SDO', parent_id: 1 },
    { id: 7, code: 'DADMIN', name: 'Directorate of Administration', parent_id: 1 },
    { id: 8, code: 'DEXREL', name: 'Directorate of External Relations', parent_id: 1 },
    { id: 9, code: 'DFIN', name: 'Directorate of Finance', parent_id: 1 },
    { id: 10, code: 'ODDG', name: 'Office of the DDG', parent_id: 1 },
    { id: 11, code: 'CDPHP', name: 'Centre for Disease Control, Prevention and Health Promotion', parent_id: 1 },
    { id: 12, code: 'CLSN', name: 'Centre for Laboratory Systems and Networks', parent_id: 1 },
    { id: 13, code: 'CPHC', name: 'Centre for Primary Healthcare', parent_id: 1 },
  ]);

  // ═══════════════════════════════════════════
  // ROLES — main roles from the RBM spec
  // ═══════════════════════════════════════════
  await knex('roles').del();
  await knex('roles').insert([
    { id: 1,  code: 'SYSTEM_ADMIN',     name: 'System Administrator',    description: 'Full system administration, security, integrations, global audit', permissions: JSON.stringify(['admin.users', 'admin.roles', 'admin.settings', 'admin.audit', 'admin.integrations', 'all.archive', 'all.restore']) },
    { id: 2,  code: 'RBM_ADMIN',        name: 'RBM Administrator',       description: 'Planning structure, templates, workflow config, publishing', permissions: JSON.stringify(['rbm.structure', 'rbm.templates', 'rbm.workflow', 'rbm.publish']) },
    { id: 3,  code: 'PLANNER',          name: 'Planner',                 description: 'Strategic plans/objectives drafting', permissions: JSON.stringify(['plans.create', 'plans.edit', 'plans.submit', 'results.create', 'results.edit', 'logframe.create', 'logframe.edit']) },
    { id: 4,  code: 'PROGRAM_OWNER',    name: 'Program Owner/Manager',   description: 'Program + Projects packaging', permissions: JSON.stringify(['programs.create', 'programs.edit', 'programs.submit', 'projects.create', 'projects.edit']) },
    { id: 5,  code: 'PROJECT_MANAGER',  name: 'Project Manager',         description: 'Workplans, items, execution', permissions: JSON.stringify(['workplans.create', 'workplans.edit', 'workplans.submit', 'items.create', 'items.edit', 'items.status']) },
    { id: 6,  code: 'ME_OFFICER',       name: 'M&E Officer',             description: 'Indicators, baselines, targets, data collection, validation', permissions: JSON.stringify(['indicators.create', 'indicators.edit', 'baselines.edit', 'targets.edit', 'achievements.create', 'achievements.validate', 'dqa.create', 'dqa.edit', 'reports.review']) },
    { id: 7,  code: 'FINANCE_OFFICER',  name: 'Finance Officer',         description: 'Budget, SAP codes, expenditures, variances', permissions: JSON.stringify(['budgets.create', 'budgets.edit', 'budgets.submit', 'expenditures.create', 'expenditures.edit']) },
    { id: 8,  code: 'APPROVER',         name: 'Approver (Director)',     description: 'Final approval decisions on artifacts', permissions: JSON.stringify(['approvals.decide', 'approvals.view']) },
    { id: 9,  code: 'EXECUTIVE_VIEWER', name: 'Executive Viewer',        description: 'Read-only access to dashboards and reports', permissions: JSON.stringify(['dashboard.view', 'reports.view']) },
    { id: 10, code: 'PARTNER_VIEWER',   name: 'Partner Viewer/Commenter',description: 'Limited external access per partner scopes', permissions: JSON.stringify(['partner.view', 'partner.comment']) },
    { id: 11, code: 'FOCAL_PERSON',     name: 'Focal Person',            description: 'Division focal point — submits quarterly indicator reports for the division', permissions: JSON.stringify(['focal.report', 'reports.submit', 'workplan.view']) },
    { id: 12, code: 'HEAD_OF_DIVISION', name: 'Head of Division',        description: 'Oversees the division — sees the same workplan as the focal person, validates or rejects the focal person\'s quarterly reports, may reassign the focal person', permissions: JSON.stringify(['workplan.view', 'reports.view', 'reports.review', 'reports.validate', 'reports.reject', 'focal.assign']) },
    { id: 13, code: 'STAFF',              name: 'Staff (Read-only)',       description: 'Division staff member — read-only access to division workplan, activities, indicators, and reports. Cannot edit or submit anything.', permissions: JSON.stringify(['workplan.view', 'reports.view']) },
    { id: 14, code: 'DIRECTOR',           name: 'Director (Multi-division HOD)', description: 'Oversees multiple divisions. Has Head of Division rights (validate/reject reports) across every division assigned via user_divisions. Switches the active division via the top-nav DivisionSwitcher.', permissions: JSON.stringify(['workplan.view','reports.view','reports.review','reports.validate','reports.reject','focal.assign']) },
  ]);

  // ═══════════════════════════════════════════
  // USERS — Default admin + sample users
  // ═══════════════════════════════════════════
  await knex('users').del();
  // No password: users sign in with Microsoft (D-20261107-03).
  await knex('users').insert([
    { id: 1, email: 'lennyt@africacdc.org', full_name: 'Lenny Tandou', status: 'ACTIVE', user_type: 'STAFF', business_unit_id: 7 },
  ]);

  // Assign roles
  await knex('user_roles').del();
  await knex('user_roles').insert([
    { user_id: 1, role_id: 1 }, // Lenny = SYSTEM_ADMIN
  ]);
};
