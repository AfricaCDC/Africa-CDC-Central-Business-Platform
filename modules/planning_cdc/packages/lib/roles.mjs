/**
 * @rbm/lib/roles — ESM source.
 *
 * Mirror of ./roles.js (CJS) for frontend bundlers (Vite/Rollup) that
 * cannot interop a CJS `module.exports = { ... }` shape via ESM `import`.
 *
 * IMPORTANT: keep this file in lockstep with ./roles.js. Both files
 * intentionally hold the same data — splitting the data into a JSON file
 * would have worked too, but keeping it inline lets each format stay
 * self-contained and tree-shakable.
 */

export const ROLES = Object.freeze({
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  RBM_ADMIN: 'RBM_ADMIN',
  PLANNER: 'PLANNER',
  PROGRAM_OWNER: 'PROGRAM_OWNER',
  PROGRAM_MANAGER: 'PROGRAM_MANAGER',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  ME_OFFICER: 'ME_OFFICER',
  FINANCE_OFFICER: 'FINANCE_OFFICER',
  APPROVER: 'APPROVER',
  EXECUTIVE_VIEWER: 'EXECUTIVE_VIEWER',
  EXECUTIVE_DIRECTOR: 'EXECUTIVE_DIRECTOR',
  PARTNER_VIEWER: 'PARTNER_VIEWER',
  HEAD_OF_DIVISION: 'HEAD_OF_DIVISION',
  FOCAL_PERSON: 'FOCAL_PERSON',
  STAFF: 'STAFF',
  DIRECTOR: 'DIRECTOR',
  // Mailing role, no permission: holders receive the server-error digest.
  TECH_ALERTS: 'TECH_ALERTS',
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.SYSTEM_ADMIN]:       'System Administrator',
  [ROLES.RBM_ADMIN]:          'RBM Administrator',
  [ROLES.PLANNER]:            'Planner',
  [ROLES.PROGRAM_OWNER]:      'Program Owner',
  [ROLES.PROGRAM_MANAGER]:    'Program Manager',
  [ROLES.PROJECT_MANAGER]:    'Project Manager',
  [ROLES.ME_OFFICER]:         'M&E Officer',
  [ROLES.FINANCE_OFFICER]:    'Finance Officer',
  [ROLES.APPROVER]:           'Approver',
  [ROLES.EXECUTIVE_VIEWER]:   'Executive Viewer',
  [ROLES.EXECUTIVE_DIRECTOR]: 'Executive Director',
  [ROLES.PARTNER_VIEWER]:     'Partner Viewer',
  [ROLES.HEAD_OF_DIVISION]:   'Head of Division',
  [ROLES.FOCAL_PERSON]:       'Focal Person',
  [ROLES.STAFF]:              'Staff (Read-only)',
  [ROLES.DIRECTOR]:           'Director (Multi-division HOD)',
  [ROLES.TECH_ALERTS]:        'Technical alerts (error emails)',
});

// eslint-disable-next-line no-restricted-syntax -- definition site of the deprecated ADMIN_ROLES (P-02); legacy consumers still import it until they move to the RBAC matrix
export const ADMIN_ROLES = Object.freeze([
  ROLES.SYSTEM_ADMIN,
  ROLES.RBM_ADMIN,
]);

export const NAV_ADMIN_ROLES = Object.freeze([
  ROLES.SYSTEM_ADMIN,
  ROLES.RBM_ADMIN,
  ROLES.ME_OFFICER,
  ROLES.FINANCE_OFFICER,
  ROLES.APPROVER,
  ROLES.EXECUTIVE_VIEWER,
]);

export const REPORTER_ROLES = Object.freeze([
  ROLES.PLANNER,
  ROLES.PROJECT_MANAGER,
  ROLES.PROGRAM_OWNER,
  ROLES.HEAD_OF_DIVISION,
  ROLES.FOCAL_PERSON,
  ROLES.STAFF,
  ROLES.DIRECTOR,
]);

export const REVIEWER_ROLES = Object.freeze([
  ROLES.SYSTEM_ADMIN,
  ROLES.RBM_ADMIN,
  ROLES.ME_OFFICER,
  ROLES.APPROVER,
  ROLES.HEAD_OF_DIVISION,
]);

export const ROLE_PRIORITY = Object.freeze([
  ROLES.SYSTEM_ADMIN,
  ROLES.RBM_ADMIN,
  ROLES.ME_OFFICER,
  ROLES.FINANCE_OFFICER,
  ROLES.APPROVER,
  ROLES.PROGRAM_OWNER,
  ROLES.PROJECT_MANAGER,
  ROLES.PLANNER,
  ROLES.EXECUTIVE_VIEWER,
  ROLES.PARTNER_VIEWER,
  ROLES.DIRECTOR,
  ROLES.HEAD_OF_DIVISION,
  ROLES.FOCAL_PERSON,
  ROLES.STAFF,
]);

export const ROLE_GROUPS = Object.freeze({
  // eslint-disable-next-line no-restricted-syntax -- definition site of the deprecated ADMIN_ROLES (P-02); legacy consumers still import it until they move to the RBAC matrix
  ADMINS: ADMIN_ROLES,
  NAV_ADMINS: NAV_ADMIN_ROLES,
  NAV_REPORTERS: REPORTER_ROLES,
  REVIEWERS: [
    ROLES.ME_OFFICER, ROLES.FINANCE_OFFICER, ROLES.APPROVER,
    ROLES.RBM_ADMIN, ROLES.SYSTEM_ADMIN,
  ],
  EDITORS: [
    ROLES.PROGRAM_MANAGER, ROLES.PROGRAM_OWNER, ROLES.PROJECT_MANAGER,
    ROLES.RBM_ADMIN, ROLES.SYSTEM_ADMIN,
  ],
  PLANNERS: [
    ROLES.ME_OFFICER, ROLES.PLANNER, ROLES.PROGRAM_MANAGER, ROLES.PROGRAM_OWNER,
    ROLES.PROJECT_MANAGER, ROLES.RBM_ADMIN, ROLES.SYSTEM_ADMIN,
  ],
  PUBLISHERS: [ROLES.RBM_ADMIN, ROLES.APPROVER, ROLES.SYSTEM_ADMIN],
  ARCHIVERS: [ROLES.RBM_ADMIN, ROLES.SYSTEM_ADMIN],
  REPORTERS: [
    ROLES.ME_OFFICER, ROLES.PROJECT_MANAGER, ROLES.PROGRAM_MANAGER, ROLES.PROGRAM_OWNER,
    ROLES.PLANNER, ROLES.APPROVER, ROLES.RBM_ADMIN, ROLES.SYSTEM_ADMIN,
  ],
  BUDGET_EDITORS: [ROLES.SYSTEM_ADMIN, ROLES.RBM_ADMIN, ROLES.FINANCE_OFFICER],
  WORKPLAN_EDITORS: [ROLES.SYSTEM_ADMIN, ROLES.RBM_ADMIN, ROLES.PROJECT_MANAGER, ROLES.PLANNER],
  WORKPLAN_DELETERS: [ROLES.SYSTEM_ADMIN, ROLES.RBM_ADMIN, ROLES.PROJECT_MANAGER],
  PORTFOLIO_EDITORS: [ROLES.SYSTEM_ADMIN, ROLES.RBM_ADMIN, ROLES.PROGRAM_OWNER, ROLES.PROGRAM_MANAGER],

  // Org chart editors — added 2026-04-08. M&E Officers need to edit the
  // division hierarchy (create divisions, reparent, assign focal/responsible)
  // because that structure IS their dataset — but they must NOT be able to
  // create users or change role permissions.
  ORG_EDITORS: [ROLES.SYSTEM_ADMIN, ROLES.RBM_ADMIN, ROLES.ME_OFFICER],
});

export function hasRole(user, role) {
  if (!user || !role) return false;
  if (typeof user === 'string') return user === role;
  if (Array.isArray(user.roles)) return user.roles.includes(role);
  if (user.role) return user.role === role;
  return false;
}

export function hasAnyRole(user, roles) {
  if (!user) return false;
  const list = Array.isArray(roles) ? roles : [roles];
  return list.some((r) => hasRole(user, r));
}

export default {
  // eslint-disable-next-line no-restricted-syntax -- definition site of the deprecated ADMIN_ROLES (P-02); legacy consumers still import it until they move to the RBAC matrix
  ROLES, ROLE_LABELS, ADMIN_ROLES, NAV_ADMIN_ROLES, REPORTER_ROLES, REVIEWER_ROLES,
  ROLE_PRIORITY, ROLE_GROUPS, hasRole, hasAnyRole,
};
