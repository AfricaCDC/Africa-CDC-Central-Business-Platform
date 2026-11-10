/**
 * @rbm/lib/rbac — Dynamic RBAC constants and helpers.
 *
 * Source of truth for module codes, action codes, and scope levels used by
 * the database-driven permission matrix (rbac_modules, rbac_actions,
 * rbac_permissions tables).
 *
 * Per CLAUDE.md "Zero Hardcoded Values" — NEVER inline module/action strings
 * in services or components. Always import from this module.
 */

'use strict';

// ── Module codes ─────────────────────────────────────────────────────────────
// Each code maps to a row in the `rbac_modules` table.

const RBAC_MODULES = Object.freeze({
  // Core
  DASHBOARD: 'dashboard',

  // Planning
  IMPACT: 'impact',
  OUTCOME: 'outcome',
  SHORT_TERM_OUTCOME: 'short_term_outcome',
  ACTIVITIES: 'activities',
  WORKPLAN: 'workplan',
  GANTT: 'gantt',
  BUDGET: 'budget',
  LOGFRAME: 'logframe',
  TASKS: 'tasks',

  // PIRS / Indicators
  PIRS: 'pirs',
  INDICATOR_TRACKING: 'indicator_tracking',
  INDICATOR_MAPPING: 'indicator_mapping',
  INDICATOR_CONTRIBUTIONS: 'indicator_contributions',

  // Reporting
  ACTIVITY_REPORT: 'activity_report',
  QUARTERLY_REPORT: 'quarterly_report',
  DIVISION_REPORT: 'division_report',

  // Strategy / Portfolio
  PORTFOLIO: 'portfolio',
  PLANS: 'plans',
  PROGRAMS: 'programs',

  // Reference
  STRATEGIC_PLAN: 'strategic_plan',
  MEMBER_STATES: 'member_states',
  PARTNERS: 'partners',
  ORG_STRUCTURE: 'org_structure',

  // Governance
  INBOX: 'inbox',
  AUDIT_LOG: 'audit_log',

  // Admin
  USERS: 'users',
  SETTINGS: 'settings',
  WORKFLOWS: 'workflows',

  // Approval reporting (contributor chain — D-20260415-05)
  REPORTS: 'reports',

  // Big Tickets — leadership priorities (D-20261015-02)
  BIG_TICKET: 'big_ticket',

  // Budget execution from the MIS export (D-20261015-04)
  BUDGET_EXECUTION: 'budget_execution',

  // Data health checks of the year (D-20261105-11)
  DATA_HEALTH: 'data_health',
});

// ── Action codes ─────────────────────────────────────────────────────────────
// Each code maps to a row in the `rbac_actions` table.

const RBAC_ACTIONS = Object.freeze({
  READ: 'read',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  APPROVE: 'approve',
  REJECT: 'reject',
  SUBMIT: 'submit',
  EXPORT: 'export',

  // Contributor approval chain (D-20260415-05).
  // Fine-grained per-step gates on the `reports` module.
  APPROVE_STEP1: 'approve_step1',
  APPROVE_STEP2: 'approve_step2',
  APPROVE_STEP3: 'approve_step3',
  APPROVE_ADMIN_BYPASS: 'approve_admin_bypass',
  REJECT_STEP1: 'reject_step1',
  REJECT_STEP2: 'reject_step2',
  REJECT_STEP3: 'reject_step3',
  READ_HISTORY: 'read_history',
});

// ── Scope levels ─────────────────────────────────────────────────────────────
// Scope defines the row-level access boundary when a permission is granted.
//   own         → user's own records only
//   division    → records in user's division
//   directorate → every child division under the user's directorate
//   all         → unrestricted access
//   deny        → absolute denial; wins over any ALLOW and overrides
//                 the admin-by-default short-circuit (D-20260416-09).

const RBAC_SCOPES = Object.freeze({
  OWN: 'own',
  DIVISION: 'division',
  DIRECTORATE: 'directorate',
  ALL: 'all',
  DENY: 'deny',
});

/**
 * Scope hierarchy ordered from least to most permissive.
 * Higher index = more permissive. When a user has multiple roles, the
 * most permissive scope wins.
 *
 * `directorate` sits between `division` (1 division) and `all`: it
 * covers every child division under the user's own directorate (parent
 * chain in division_codes).
 *
 * NOTE: 'deny' is deliberately excluded from this ladder — it is not a
 * permissiveness level but an absolute negation. The merge resolver in
 * rbacService handles it as a sticky special case.
 */
const SCOPE_HIERARCHY = Object.freeze(['own', 'division', 'directorate', 'all']);

/**
 * Numeric rank for each scope. Used for "most permissive wins" resolution.
 * 'deny' is intentionally absent — see SCOPE_HIERARCHY note.
 */
const SCOPE_RANK = Object.freeze({ own: 1, division: 2, directorate: 3, all: 4 });

/**
 * Check if `userScope` is at least as permissive as `requiredScope`.
 *
 * @param {string} userScope - the scope the user has (e.g. 'division')
 * @param {string} requiredScope - the minimum scope needed (e.g. 'own')
 * @returns {boolean}
 * @example
 * scopeIncludes('all', 'division') // true
 * scopeIncludes('own', 'division') // false
 */
function scopeIncludes(userScope, requiredScope) {
  return (SCOPE_RANK[userScope] || 0) >= (SCOPE_RANK[requiredScope] || 0);
}

/**
 * Given multiple scopes, return the most permissive one.
 *
 * @param {string[]} scopes
 * @returns {string|null}
 * @example
 * mostPermissiveScope(['own', 'division', 'own']) // 'division'
 */
function mostPermissiveScope(scopes) {
  if (!scopes || !scopes.length) return null;
  let best = null;
  let bestRank = 0;
  for (const s of scopes) {
    const rank = SCOPE_RANK[s] || 0;
    if (rank > bestRank) { bestRank = rank; best = s; }
  }
  return best;
}

module.exports = {
  RBAC_MODULES,
  RBAC_ACTIONS,
  RBAC_SCOPES,
  SCOPE_HIERARCHY,
  SCOPE_RANK,
  scopeIncludes,
  mostPermissiveScope,
};
