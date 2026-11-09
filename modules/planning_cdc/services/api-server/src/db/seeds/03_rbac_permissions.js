/**
 * Seed: RBAC dynamic permission matrix.
 *
 * Populates rbac_modules, rbac_actions, and rbac_permissions.
 * Idempotent — uses INSERT IGNORE to skip existing rows.
 *
 * The permission matrix mirrors the current ROLE_GROUPS behavior:
 *   SYSTEM_ADMIN / RBM_ADMIN → scope 'all' on everything
 *   ME_OFFICER               → scope 'all' on most read + indicators, 'division' on reports
 *   FINANCE_OFFICER          → scope 'all' on budget, 'all' read on most
 *   HEAD_OF_DIVISION         → scope 'division' on reports/indicators, approve/reject
 *   FOCAL_PERSON             → scope 'own' on reports, submit
 *   etc.
 */

const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');

// ── Module definitions (code → { name, category, sort_order }) ──────────────
const MODULES = [
  // Core
  { code: 'dashboard',                name: 'Dashboard',                    category: 'core',       sort: 0 },

  // Planning
  { code: 'impact',                   name: 'Impact',                       category: 'planning',   sort: 10 },
  { code: 'outcome',                  name: 'Outcomes',                     category: 'planning',   sort: 11 },
  { code: 'short_term_outcome',       name: 'Short-term Outcomes (T3/T4)',  category: 'planning',   sort: 12 },
  { code: 'activities',               name: 'Broad Activities',             category: 'planning',   sort: 13 },
  { code: 'workplan',                 name: 'Workplan',                     category: 'planning',   sort: 14 },
  { code: 'gantt',                    name: 'Gantt Workplan',               category: 'planning',   sort: 15 },
  { code: 'budget',                   name: 'Budget & Funding',             category: 'planning',   sort: 16 },
  { code: 'logframe',                 name: 'Logframe',                     category: 'planning',   sort: 17 },
  { code: 'tasks',                    name: 'Specific Activities',          category: 'planning',   sort: 18 },

  // PIRS / Indicators
  { code: 'pirs',                     name: 'PIRS Indicators',              category: 'pirs',       sort: 20 },
  { code: 'indicator_tracking',       name: 'Indicator Tracking Table',     category: 'pirs',       sort: 21 },
  { code: 'indicator_mapping',        name: 'Indicator Mapping',            category: 'pirs',       sort: 22 },
  { code: 'indicator_contributions',  name: 'Indicator Contributions',      category: 'pirs',       sort: 23 },

  // Reporting
  { code: 'activity_report',          name: 'Activity Reports',             category: 'reporting',  sort: 30 },
  { code: 'quarterly_report',         name: 'Quarterly Reports',            category: 'reporting',  sort: 31 },
  { code: 'division_report',          name: 'Division Reports',             category: 'reporting',  sort: 32 },

  // Strategy / Portfolio
  { code: 'portfolio',                name: 'Portfolio Tree',               category: 'strategy',   sort: 40 },
  { code: 'plans',                    name: 'Plans',                        category: 'strategy',   sort: 41 },
  { code: 'programs',                 name: 'Programs',                     category: 'strategy',   sort: 42 },

  // Reference
  { code: 'strategic_plan',           name: 'Strategic Plan',               category: 'reference',  sort: 50 },
  { code: 'member_states',            name: 'Member States',                category: 'reference',  sort: 51 },
  { code: 'partners',                 name: 'Partners',                     category: 'reference',  sort: 52 },
  { code: 'org_structure',            name: 'Org Structure',                category: 'reference',  sort: 53 },

  // Governance
  { code: 'inbox',                    name: 'Governance Inbox',             category: 'governance', sort: 60 },
  { code: 'audit_log',               name: 'Audit Log',                    category: 'governance', sort: 61 },

  // Admin
  { code: 'users',                    name: 'User Management',              category: 'admin',      sort: 70 },
  { code: 'settings',                 name: 'Platform Settings',            category: 'admin',      sort: 71 },
  { code: 'workflows',               name: 'Workflow Templates',           category: 'admin',      sort: 72 },
];

// ── Action definitions ──────────────────────────────────────────────────────
const ACTIONS = [
  { code: 'read',    name: 'Read / View',   sort: 1 },
  { code: 'create',  name: 'Create',        sort: 2 },
  { code: 'update',  name: 'Update / Edit', sort: 3 },
  { code: 'delete',  name: 'Delete',        sort: 4 },
  { code: 'approve', name: 'Approve',       sort: 5 },
  { code: 'reject',  name: 'Reject',        sort: 6 },
  { code: 'submit',  name: 'Submit',        sort: 7 },
  { code: 'export',  name: 'Export',        sort: 8 },
];

// ── Permission matrix ────────────────────────────────────────────────────────
// Format: { roleCode: { moduleCode: { actionCode: scope } } }
// Absent entries = denied (deny-by-default).

// Helper: generate read-all for a set of modules
const readAll = (mods) => {
  const out = {};
  mods.forEach(m => { out[m] = { read: 'all' }; });
  return out;
};

// Helper: generate full CRUD + extras with scope 'all'
const fullAccess = (mods, extra = []) => {
  const out = {};
  const acts = ['read', 'create', 'update', 'delete', ...extra];
  mods.forEach(m => {
    out[m] = {};
    acts.forEach(a => { out[m][a] = 'all'; });
  });
  return out;
};

const ALL_MODULES = MODULES.map(m => m.code);
const PLANNING_MODULES = ['impact', 'outcome', 'short_term_outcome', 'activities', 'workplan', 'gantt', 'budget', 'logframe', 'tasks'];
const PIRS_MODULES = ['pirs', 'indicator_tracking', 'indicator_mapping', 'indicator_contributions'];
const REPORTING_MODULES = ['activity_report', 'quarterly_report', 'division_report'];
const REFERENCE_MODULES = ['strategic_plan', 'member_states', 'partners', 'org_structure'];
const ADMIN_MODULES = ['users', 'settings', 'workflows'];

const MATRIX = {
  // ── SYSTEM_ADMIN — God mode ──────────────────────────────────────────
  SYSTEM_ADMIN: fullAccess(ALL_MODULES, ['approve', 'reject', 'submit', 'export']),

  // ── RBM_ADMIN — everything except user/settings management ──────────
  RBM_ADMIN: {
    ...fullAccess(ALL_MODULES, ['approve', 'reject', 'submit', 'export']),
    // Override: no user/settings delete
    users: { read: 'all', create: 'all', update: 'all' },
    settings: { read: 'all', update: 'all' },
  },

  // ── ME_OFFICER — indicators expert, reports reviewer ────────────────
  ME_OFFICER: {
    dashboard: { read: 'all' },
    ...fullAccess(PLANNING_MODULES, ['export']),
    ...fullAccess(PIRS_MODULES, ['export']),
    ...readAll(REPORTING_MODULES),
    activity_report: { read: 'all', export: 'all' },
    quarterly_report: { read: 'all', create: 'all', update: 'all', approve: 'all', reject: 'all', export: 'all' },
    division_report: { read: 'all', export: 'all' },
    ...readAll(['portfolio', 'plans', 'programs']),
    ...readAll(REFERENCE_MODULES),
    org_structure: { read: 'all', create: 'all', update: 'all' },
    inbox: { read: 'all' },
    audit_log: { read: 'all' },
  },

  // ── FINANCE_OFFICER — budget focus ──────────────────────────────────
  FINANCE_OFFICER: {
    dashboard: { read: 'all' },
    ...readAll(PLANNING_MODULES),
    budget: { read: 'all', create: 'all', update: 'all', delete: 'all', export: 'all' },
    ...readAll(PIRS_MODULES),
    ...readAll(REPORTING_MODULES),
    quarterly_report: { read: 'all', export: 'all' },
    ...readAll(['portfolio', 'plans', 'programs']),
    ...readAll(REFERENCE_MODULES),
    inbox: { read: 'all' },
    audit_log: { read: 'all' },
  },

  // ── APPROVER — read everything, approve/reject reports ──────────────
  APPROVER: {
    dashboard: { read: 'all' },
    ...readAll(PLANNING_MODULES),
    ...readAll(PIRS_MODULES),
    activity_report: { read: 'all', approve: 'all', reject: 'all' },
    quarterly_report: { read: 'all', approve: 'all', reject: 'all' },
    division_report: { read: 'all' },
    ...readAll(['portfolio', 'plans', 'programs']),
    ...readAll(REFERENCE_MODULES),
    inbox: { read: 'all' },
    audit_log: { read: 'all' },
  },

  // ── PLANNER — workplan + planning modules ───────────────────────────
  PLANNER: {
    dashboard: { read: 'division' },
    ...readAll(['impact', 'outcome']),
    short_term_outcome: { read: 'all' },
    activities: { read: 'division', create: 'division', update: 'division' },
    workplan: { read: 'division', create: 'division', update: 'division', export: 'division' },
    gantt: { read: 'division' },
    budget: { read: 'division' },
    logframe: { read: 'all' },
    tasks: { read: 'division', create: 'division', update: 'division' },
    ...readAll(PIRS_MODULES),
    activity_report: { read: 'division', create: 'division', update: 'division', submit: 'division' },
    quarterly_report: { read: 'division' },
    division_report: { read: 'division' },
    ...readAll(['portfolio', 'plans', 'programs']),
    ...readAll(REFERENCE_MODULES),
  },

  // ── PROGRAM_OWNER — portfolio + planning ────────────────────────────
  PROGRAM_OWNER: {
    dashboard: { read: 'division' },
    ...readAll(PLANNING_MODULES),
    activities: { read: 'division', create: 'division', update: 'division' },
    workplan: { read: 'division', update: 'division' },
    ...readAll(PIRS_MODULES),
    activity_report: { read: 'division', create: 'division', update: 'division', submit: 'division' },
    quarterly_report: { read: 'division' },
    division_report: { read: 'division' },
    portfolio: { read: 'all', create: 'all', update: 'all' },
    plans: { read: 'all', create: 'all', update: 'all' },
    programs: { read: 'all', create: 'all', update: 'all' },
    ...readAll(REFERENCE_MODULES),
  },

  // ── PROJECT_MANAGER — workplan CRUD ─────────────────────────────────
  PROJECT_MANAGER: {
    dashboard: { read: 'division' },
    ...readAll(['impact', 'outcome', 'short_term_outcome']),
    activities: { read: 'division', create: 'division', update: 'division' },
    workplan: { read: 'division', create: 'division', update: 'division', delete: 'division', export: 'division' },
    gantt: { read: 'division' },
    budget: { read: 'division' },
    logframe: { read: 'all' },
    tasks: { read: 'division', create: 'division', update: 'division', delete: 'division' },
    ...readAll(PIRS_MODULES),
    activity_report: { read: 'division', create: 'division', update: 'division', submit: 'division' },
    quarterly_report: { read: 'division' },
    division_report: { read: 'division' },
    ...readAll(['portfolio', 'plans', 'programs']),
    ...readAll(REFERENCE_MODULES),
  },

  // ── HEAD_OF_DIVISION — division oversight, approve/reject ───────────
  HEAD_OF_DIVISION: {
    dashboard: { read: 'division' },
    ...readAll(['impact', 'outcome', 'short_term_outcome']),
    activities: { read: 'division' },
    workplan: { read: 'division' },
    gantt: { read: 'division' },
    budget: { read: 'division' },
    logframe: { read: 'all' },
    tasks: { read: 'division', approve: 'division', reject: 'division' },
    pirs: { read: 'division' },
    indicator_tracking: { read: 'division' },
    indicator_mapping: { read: 'division' },
    indicator_contributions: { read: 'division' },
    activity_report: { read: 'division', approve: 'division', reject: 'division', export: 'division' },
    quarterly_report: { read: 'division', approve: 'division', reject: 'division' },
    division_report: { read: 'division', export: 'division' },
    ...readAll(['portfolio', 'plans', 'programs']),
    ...readAll(REFERENCE_MODULES),
  },

  // ── DIRECTOR — full admin rights across every child division ────────
  // Scope 'directorate' resolves to the user's home directorate + all
  // divisions with parent_code chain leading to it (resolved by
  // divisionAliasService.getDirectorateChildren).
  // A director can create/edit/delete AND approve/reject in every
  // division they oversee — essentially a scoped admin.
  DIRECTOR: {
    dashboard: { read: 'directorate' },
    ...readAll(['impact', 'outcome', 'short_term_outcome']),
    activities: { read: 'directorate', create: 'directorate', update: 'directorate', delete: 'directorate' },
    workplan: { read: 'directorate', create: 'directorate', update: 'directorate', delete: 'directorate' },
    gantt: { read: 'directorate' },
    budget: { read: 'directorate', update: 'directorate' },
    logframe: { read: 'all' },
    tasks: { read: 'directorate', create: 'directorate', update: 'directorate', delete: 'directorate', submit: 'directorate', approve: 'directorate', reject: 'directorate' },
    pirs: { read: 'directorate', update: 'directorate' },
    indicator_tracking: { read: 'directorate', update: 'directorate' },
    indicator_mapping: { read: 'directorate' },
    indicator_contributions: { read: 'directorate' },
    activity_report: { read: 'directorate', create: 'directorate', update: 'directorate', submit: 'directorate', approve: 'directorate', reject: 'directorate', export: 'directorate' },
    quarterly_report: { read: 'directorate', create: 'directorate', update: 'directorate', submit: 'directorate', approve: 'directorate', reject: 'directorate' },
    division_report: { read: 'directorate', export: 'directorate' },
    ...readAll(['portfolio', 'plans', 'programs']),
    ...readAll(REFERENCE_MODULES),
  },

  // ── FOCAL_PERSON — own reports, submit, export the plan + reports ───
  // VH-3: focal points can export the workplan ("the plan") and the activity /
  // quarterly / division reports, matching their existing read scope.
  FOCAL_PERSON: {
    dashboard: { read: 'own' },
    ...readAll(['impact', 'outcome', 'short_term_outcome']),
    activities: { read: 'division' },
    workplan: { read: 'division', export: 'division' },
    gantt: { read: 'division' },
    budget: { read: 'division' },
    logframe: { read: 'all' },
    tasks: { read: 'own', create: 'own', update: 'own', submit: 'own' },
    pirs: { read: 'division' },
    indicator_tracking: { read: 'division' },
    indicator_mapping: { read: 'division' },
    indicator_contributions: { read: 'division' },
    activity_report: { read: 'own', create: 'own', update: 'own', submit: 'own', export: 'own' },
    quarterly_report: { read: 'own', create: 'own', update: 'own', submit: 'own', export: 'own' },
    division_report: { read: 'division', export: 'division' },
    ...readAll(REFERENCE_MODULES),
  },

  // ── EXECUTIVE_VIEWER — read-only on everything ──────────────────────
  EXECUTIVE_VIEWER: {
    dashboard: { read: 'all' },
    ...readAll(PLANNING_MODULES),
    ...readAll(PIRS_MODULES),
    ...readAll(REPORTING_MODULES),
    ...readAll(['portfolio', 'plans', 'programs']),
    ...readAll(REFERENCE_MODULES),
    inbox: { read: 'all' },
    audit_log: { read: 'all' },
  },

  // ── STAFF — read-only views + activity reporting (VH-3) ─────────────
  // "Staff = viewing rights + activity reporting." Everything stays read-only
  // EXCEPT activity_report, where staff can create/update/submit their own.
  STAFF: {
    dashboard: { read: 'division' },
    ...readAll(['impact', 'outcome', 'short_term_outcome']),
    activities: { read: 'division' },
    workplan: { read: 'division' },
    gantt: { read: 'division' },
    budget: { read: 'division' },
    logframe: { read: 'all' },
    tasks: { read: 'division' },
    pirs: { read: 'division' },
    indicator_tracking: { read: 'division' },
    indicator_mapping: { read: 'division' },
    indicator_contributions: { read: 'division' },
    activity_report: { read: 'division', create: 'own', update: 'own', submit: 'own' },
    quarterly_report: { read: 'division' },
    division_report: { read: 'division' },
    ...readAll(REFERENCE_MODULES),
  },

  // ── PARTNER_VIEWER — limited read-only ──────────────────────────────
  PARTNER_VIEWER: {
    dashboard: { read: 'all' },
    ...readAll(['impact', 'outcome', 'short_term_outcome']),
    ...readAll(PIRS_MODULES),
    quarterly_report: { read: 'all' },
    ...readAll(REFERENCE_MODULES),
  },
};

// ── Seed runner ──────────────────────────────────────────────────────────────

exports.seed = async function (knex) {
  // 1. Seed modules
  for (const m of MODULES) {
    const exists = await knex('rbac_modules').where('code', m.code).first();
    if (!exists) {
      await knex('rbac_modules').insert({
        code: m.code, name: m.name, category: m.category,
        sort_order: m.sort, is_active: true,
      });
    }
  }

  // 2. Seed actions
  for (const a of ACTIONS) {
    const exists = await knex('rbac_actions').where('code', a.code).first();
    if (!exists) {
      await knex('rbac_actions').insert({
        code: a.code, name: a.name, sort_order: a.sort,
      });
    }
  }

  // 3. Build lookup maps
  const moduleRows = await knex('rbac_modules').select('id', 'code');
  const actionRows = await knex('rbac_actions').select('id', 'code');
  const roleRows = await knex('roles').select('id', 'code');

  const modMap = {};
  moduleRows.forEach(r => { modMap[r.code] = r.id; });
  const actMap = {};
  actionRows.forEach(r => { actMap[r.code] = r.id; });
  const roleMap = {};
  roleRows.forEach(r => { roleMap[r.code] = r.id; });

  // 4. Seed permissions matrix
  let inserted = 0;
  for (const [roleCode, modules] of Object.entries(MATRIX)) {
    const roleId = roleMap[roleCode];
    if (!roleId) continue;

    for (const [modCode, actions] of Object.entries(modules)) {
      const moduleId = modMap[modCode];
      if (!moduleId) continue;

      for (const [actCode, scope] of Object.entries(actions)) {
        const actionId = actMap[actCode];
        if (!actionId) continue;

        const exists = await knex('rbac_permissions')
          .where({ role_id: roleId, module_id: moduleId, action_id: actionId })
          .first();
        if (!exists) {
          await knex('rbac_permissions').insert({
            role_id: roleId, module_id: moduleId, action_id: actionId, scope,
          });
          inserted++;
        }
      }
    }
  }

  console.log(`  RBAC seed: ${MODULES.length} modules, ${ACTIONS.length} actions, ${inserted} permissions inserted`);
};
