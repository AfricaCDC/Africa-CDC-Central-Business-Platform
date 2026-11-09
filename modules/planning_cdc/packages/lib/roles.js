/**
 * @rbm/lib/roles — Role definitions for Africa CDC RBM Platform.
 *
 * Source of truth: services/api-server/src/db/seeds/01_reference_data.js
 * (the `roles` table seed). When you add a role to the seed, ALSO add it
 * here.
 *
 * Per CLAUDE.md "Zero Hardcoded Values" — NEVER inline role string literals
 * or role arrays in services. Always import from this module.
 */

const ROLES = Object.freeze({
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  RBM_ADMIN: 'RBM_ADMIN',
  ME_OFFICER: 'ME_OFFICER',
  HEAD_OF_DIVISION: 'HEAD_OF_DIVISION',
  FOCAL_PERSON: 'FOCAL_PERSON',
  STAFF: 'STAFF',
  DIRECTOR: 'DIRECTOR',
  // Mailing role, no permission: holders receive the server-error digest.
  TECH_ALERTS: 'TECH_ALERTS',
});

/**
 * Human-readable labels per role code. Used by the user-management UI and
 * audit log.
 */
const ROLE_LABELS = Object.freeze({
  [ROLES.SYSTEM_ADMIN]:       'System Administrator',
  [ROLES.RBM_ADMIN]:          'RBM Administrator',
  [ROLES.ME_OFFICER]:         'M&E Officer',
  [ROLES.HEAD_OF_DIVISION]:   'Head of Division',
  [ROLES.FOCAL_PERSON]:       'Focal Person',
  [ROLES.STAFF]:              'Staff (Read-only)',
  [ROLES.DIRECTOR]:           'Director (Multi-division HOD)',
  [ROLES.TECH_ALERTS]:        'Technical alerts (error emails)',
});

/**
 * Compact admin set used for "is this user an admin?" checks across the api
 * (RBAC middleware) and the web-app (route guards).
 */
const ADMIN_ROLES = Object.freeze([
  ROLES.SYSTEM_ADMIN,
  ROLES.RBM_ADMIN,
]);

/**
 * Roles that should land on the admin dashboard (vs the focal report dashboard)
 * after login. Used by `App.jsx` `SmartRedirect` and the `ProtectedRoute`.
 */
const NAV_ADMIN_ROLES = Object.freeze([
  ROLES.SYSTEM_ADMIN,
  ROLES.RBM_ADMIN,
  ROLES.ME_OFFICER,
]);

/**
 * Roles that submit operational reports (workplans, broads, focal reports).
 * HEAD_OF_DIVISION belongs here because they share the same nav as focal
 * persons (workplan, broads, indicators, specifics) — they just don't
 * actually submit; they oversee + validate/reject what their focals submit.
 */
const REPORTER_ROLES = Object.freeze([
  ROLES.HEAD_OF_DIVISION,
  ROLES.FOCAL_PERSON,
  ROLES.STAFF,
  ROLES.DIRECTOR,
]);

/**
 * Roles allowed to validate/reject indicator reports submitted by focals.
 * Used by ProtectedRoute on /review-submissions and by inline action
 * buttons on the review pages.
 */
const REVIEWER_ROLES = Object.freeze([
  ROLES.SYSTEM_ADMIN,
  ROLES.RBM_ADMIN,
  ROLES.ME_OFFICER,
  ROLES.HEAD_OF_DIVISION,
  ROLES.DIRECTOR,
]);

/**
 * Order of priority when resolving the "primary" role of a user with
 * multiple role assignments. The first matching role wins.
 *
 * HEAD_OF_DIVISION sits above FOCAL_PERSON so a user with both roles
 * lands on the HOD nav (which includes Review Submissions) instead of
 * being locked into the bare focal nav.
 */
const ROLE_PRIORITY = Object.freeze([
  ROLES.SYSTEM_ADMIN,
  ROLES.RBM_ADMIN,
  ROLES.ME_OFFICER,
  ROLES.DIRECTOR,
  ROLES.HEAD_OF_DIVISION,
  ROLES.FOCAL_PERSON,
  ROLES.STAFF,
]);

const ROLE_GROUPS = Object.freeze({
  // Admin sets
  ADMINS: ADMIN_ROLES,
  NAV_ADMINS: NAV_ADMIN_ROLES,

  // Reporter set
  NAV_REPORTERS: REPORTER_ROLES,

  // Capability-based groups.
  REVIEWERS: [ROLES.ME_OFFICER, ROLES.RBM_ADMIN, ROLES.SYSTEM_ADMIN, ROLES.HEAD_OF_DIVISION, ROLES.DIRECTOR],
  PUBLISHERS: [ROLES.RBM_ADMIN, ROLES.SYSTEM_ADMIN],
  ARCHIVERS: [ROLES.RBM_ADMIN, ROLES.SYSTEM_ADMIN],
  REPORTERS: [ROLES.ME_OFFICER, ROLES.RBM_ADMIN, ROLES.SYSTEM_ADMIN],
  BUDGET_EDITORS: [ROLES.SYSTEM_ADMIN, ROLES.RBM_ADMIN],
  WORKPLAN_EDITORS: [ROLES.SYSTEM_ADMIN, ROLES.RBM_ADMIN],
  WORKPLAN_DELETERS: [ROLES.SYSTEM_ADMIN, ROLES.RBM_ADMIN],
  PORTFOLIO_EDITORS: [ROLES.SYSTEM_ADMIN, ROLES.RBM_ADMIN],

  // Org chart editors.
  ORG_EDITORS: [ROLES.SYSTEM_ADMIN, ROLES.RBM_ADMIN, ROLES.ME_OFFICER],
});

/**
 * `true` if `user.roles` (or a single role string) includes `role`.
 *
 * @param {{ roles?: string[], role?: string }|string|null|undefined} user
 * @param {string} role
 * @returns {boolean}
 */
function hasRole(user, role) {
  if (!user || !role) return false;
  if (typeof user === 'string') return user === role;
  if (Array.isArray(user.roles)) return user.roles.includes(role);
  if (user.role) return user.role === role;
  return false;
}

/**
 * `true` if `user` has any of the supplied roles.
 *
 * @param {{ roles?: string[], role?: string }|string|null|undefined} user
 * @param {string[]|string} roles
 * @returns {boolean}
 */
function hasAnyRole(user, roles) {
  if (!user) return false;
  const list = Array.isArray(roles) ? roles : [roles];
  return list.some((r) => hasRole(user, r));
}

module.exports = {
  ROLES,
  ROLE_LABELS,
  ADMIN_ROLES,
  NAV_ADMIN_ROLES,
  REPORTER_ROLES,
  REVIEWER_ROLES,
  ROLE_PRIORITY,
  ROLE_GROUPS,
  hasRole,
  hasAnyRole,
};
