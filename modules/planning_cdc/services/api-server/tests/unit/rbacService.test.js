// ── rbacService unit tests ──
//
// Focus: admin-by-default resolution + DENY-wins merge (D-20260416-09, task #32).
//
// The service caches per-user permissions for 5 minutes; tests call
// `invalidateUserPermissions()` between scenarios to reset state.

/* eslint-disable no-restricted-syntax --
 * Test fixtures mirror the rbac_modules.module_key column-enum space
 * ('workplan', 'budget', 'reports', 'tasks') — these are NOT ENTITY_TYPES
 * identifiers, they are opaque test strings fed into the RBAC resolver.
 * Swapping them for ENTITY_TYPES would be semantically wrong because the
 * resolver keys off module codes, not entity types. (D-20260416-09)
 */

// Mock the knex db module BEFORE requiring the service.
jest.mock('../../src/config/db', () => global.__makeKnexMock());

const db = require('../../src/config/db');
const rbacService = require('../../src/services/rbacService');

// Helper: stub loadUserPermissions's 2 queries (user_roles JOIN + permissions JOIN).
// `userRoleRows` shape: [{ role_id, role_code }, ...]
// `permissionRows` shape: [{ module, action, scope }, ...]
function stubQueries(userRoleRows, permissionRows) {
  const calls = [];
  db.mockImplementation((tableExpr) => {
    calls.push(tableExpr);
    const chain = global.__makeKnexMock().__chain;
    // First query: user_roles join. Resolve via chain.select() returning rows.
    if (tableExpr === 'user_roles as ur') {
      chain.select = jest.fn().mockResolvedValue(userRoleRows);
      return chain;
    }
    // Second query: rbac_permissions join. Resolve via chain.select() returning rows.
    if (tableExpr === 'rbac_permissions as p') {
      chain.select = jest.fn().mockResolvedValue(permissionRows);
      return chain;
    }
    // Default pass-through (cache invalidation queries hit 'user_roles').
    return chain;
  });
}

describe('rbacService.checkPermission — admin-by-default (task #32)', () => {
  beforeEach(() => {
    rbacService.invalidateUserPermissions(); // clear per-user cache
    jest.clearAllMocks();
  });

  it('returns allowed=true, scope=all for admin with NO explicit permission in matrix', async () => {
    stubQueries(
      [{ role_id: 1, role_code: 'SYSTEM_ADMIN' }],
      [], // empty matrix — no rows at all
    );

    const result = await rbacService.checkPermission(42, 'workplan', 'create');
    expect(result).toEqual({ allowed: true, scope: 'all' });
  });

  it('returns allowed=true with the explicit scope when admin has ALLOW in matrix', async () => {
    stubQueries(
      [{ role_id: 1, role_code: 'SYSTEM_ADMIN' }],
      [{ module: 'workplan', action: 'create', scope: 'division' }],
    );

    const result = await rbacService.checkPermission(42, 'workplan', 'create');
    expect(result).toEqual({ allowed: true, scope: 'division' });
  });

  it('returns allowed=false when admin has explicit DENY — DENY overrides admin short-circuit', async () => {
    stubQueries(
      [{ role_id: 1, role_code: 'SYSTEM_ADMIN' }],
      [{ module: 'budget', action: 'delete', scope: 'deny' }],
    );

    const result = await rbacService.checkPermission(42, 'budget', 'delete');
    expect(result).toEqual({ allowed: false, scope: null });
  });

  it('returns allowed=false for non-admin with no matching permission row', async () => {
    stubQueries(
      [{ role_id: 2, role_code: 'FOCAL_PERSON' }],
      [{ module: 'workplan', action: 'read', scope: 'own' }],
    );

    const result = await rbacService.checkPermission(7, 'workplan', 'create');
    expect(result).toEqual({ allowed: false, scope: null });
  });

  it('recognises RBM_ADMIN as an admin role', async () => {
    stubQueries([{ role_id: 3, role_code: 'RBM_ADMIN' }], []);
    const result = await rbacService.checkPermission(99, 'any_module', 'any_action');
    expect(result).toEqual({ allowed: true, scope: 'all' });
  });

  it('DENY wins over ALLOW when user has both roles on the same (module, action)', async () => {
    stubQueries(
      [
        { role_id: 1, role_code: 'SYSTEM_ADMIN' },
        { role_id: 5, role_code: 'STAFF' },
      ],
      [
        { module: 'reports', action: 'export', scope: 'all' },
        { module: 'reports', action: 'export', scope: 'deny' },
      ],
    );

    const result = await rbacService.checkPermission(11, 'reports', 'export');
    expect(result).toEqual({ allowed: false, scope: null });
  });

  it('most permissive ALLOW wins when user has multiple ALLOW rows (no deny)', async () => {
    stubQueries(
      [
        { role_id: 2, role_code: 'FOCAL_PERSON' },
        { role_id: 4, role_code: 'HEAD_OF_DIVISION' },
      ],
      [
        { module: 'tasks', action: 'update', scope: 'own' },
        { module: 'tasks', action: 'update', scope: 'division' },
      ],
    );

    const result = await rbacService.checkPermission(12, 'tasks', 'update');
    expect(result).toEqual({ allowed: true, scope: 'division' });
  });

  it('returns allowed=false for user with zero roles', async () => {
    stubQueries([], []);
    const result = await rbacService.checkPermission(999, 'anything', 'anything');
    expect(result).toEqual({ allowed: false, scope: null });
  });
});

describe('rbacService.getPermissionMap — frontend contract', () => {
  beforeEach(() => {
    rbacService.invalidateUserPermissions();
    jest.clearAllMocks();
  });

  it('exposes isAdmin=true and separates denies from permissions map', async () => {
    stubQueries(
      [{ role_id: 1, role_code: 'SYSTEM_ADMIN' }],
      [
        { module: 'workplan', action: 'create', scope: 'all' },
        { module: 'budget', action: 'delete', scope: 'deny' },
      ],
    );

    const map = await rbacService.getPermissionMap(42);
    expect(map.isAdmin).toBe(true);
    expect(map.permissions).toEqual({ 'workplan.create': 'all' });
    expect(map.denies).toEqual(['budget.delete']);
    expect(map.modules).toEqual(expect.arrayContaining(['workplan', 'budget']));
  });

  it('exposes isAdmin=false for non-admin users', async () => {
    stubQueries(
      [{ role_id: 2, role_code: 'FOCAL_PERSON' }],
      [{ module: 'workplan', action: 'read', scope: 'own' }],
    );

    const map = await rbacService.getPermissionMap(7);
    expect(map.isAdmin).toBe(false);
    expect(map.permissions).toEqual({ 'workplan.read': 'own' });
    expect(map.denies).toEqual([]);
  });
});
