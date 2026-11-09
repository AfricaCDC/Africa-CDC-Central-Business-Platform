/**
 * @rbm/lib/rbac — ESM mirror of rbac.js.
 * Keep in sync with the CJS version.
 */

/* eslint-disable no-restricted-syntax --
 * This file is the source of truth for RBAC_MODULES / RBAC_ACTIONS string
 * literals. P-31 flags any inline entity-type string expecting a lookup into
 * @rbm/lib/enums, but the lookup target *is* this module. Suppress at file
 * scope rather than decorating every key. (CHARTER §2, D-20260415-05)
 */

export const RBAC_MODULES = Object.freeze({
  DASHBOARD: 'dashboard',
  IMPACT: 'impact',
  OUTCOME: 'outcome',
  SHORT_TERM_OUTCOME: 'short_term_outcome',
  ACTIVITIES: 'activities',
  WORKPLAN: 'workplan',
  GANTT: 'gantt',
  BUDGET: 'budget',
  LOGFRAME: 'logframe',
  TASKS: 'tasks',
  PIRS: 'pirs',
  INDICATOR_TRACKING: 'indicator_tracking',
  INDICATOR_MAPPING: 'indicator_mapping',
  INDICATOR_CONTRIBUTIONS: 'indicator_contributions',
  ACTIVITY_REPORT: 'activity_report',
  QUARTERLY_REPORT: 'quarterly_report',
  DIVISION_REPORT: 'division_report',
  PORTFOLIO: 'portfolio',
  PLANS: 'plans',
  PROGRAMS: 'programs',
  STRATEGIC_PLAN: 'strategic_plan',
  MEMBER_STATES: 'member_states',
  PARTNERS: 'partners',
  ORG_STRUCTURE: 'org_structure',
  INBOX: 'inbox',
  AUDIT_LOG: 'audit_log',
  USERS: 'users',
  SETTINGS: 'settings',
  WORKFLOWS: 'workflows',
  REPORTS: 'reports',

  // Big Tickets — leadership priorities (D-20261015-02)
  BIG_TICKET: 'big_ticket',

  // Budget execution from the MIS export (D-20261015-04)
  BUDGET_EXECUTION: 'budget_execution',

  // Data health checks of the year (D-20261105-11)
  DATA_HEALTH: 'data_health',
});

export const RBAC_ACTIONS = Object.freeze({
  READ: 'read',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  APPROVE: 'approve',
  REJECT: 'reject',
  SUBMIT: 'submit',
  EXPORT: 'export',
  APPROVE_STEP1: 'approve_step1',
  APPROVE_STEP2: 'approve_step2',
  APPROVE_STEP3: 'approve_step3',
  APPROVE_ADMIN_BYPASS: 'approve_admin_bypass',
  REJECT_STEP1: 'reject_step1',
  REJECT_STEP2: 'reject_step2',
  REJECT_STEP3: 'reject_step3',
  READ_HISTORY: 'read_history',
});

export const RBAC_SCOPES = Object.freeze({
  OWN: 'own',
  DIVISION: 'division',
  DIRECTORATE: 'directorate',
  ALL: 'all',
  DENY: 'deny',
});

// SCOPE_HIERARCHY + SCOPE_RANK intentionally exclude 'deny' — it is an
// absolute negation handled as a sticky special case by rbacService,
// not a point on the permissiveness ladder. (D-20260416-09)
export const SCOPE_HIERARCHY = Object.freeze(['own', 'division', 'directorate', 'all']);
export const SCOPE_RANK = Object.freeze({ own: 1, division: 2, directorate: 3, all: 4 });

export function scopeIncludes(userScope, requiredScope) {
  return (SCOPE_RANK[userScope] || 0) >= (SCOPE_RANK[requiredScope] || 0);
}

export function mostPermissiveScope(scopes) {
  if (!scopes || !scopes.length) return null;
  let best = null;
  let bestRank = 0;
  for (const s of scopes) {
    const rank = SCOPE_RANK[s] || 0;
    if (rank > bestRank) { bestRank = rank; best = s; }
  }
  return best;
}
