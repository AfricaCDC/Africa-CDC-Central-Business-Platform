/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── rbacMiddleware unit tests ──
//
// Covers: requireAnyRole, requireOwnerOrRole, loadEntity, authorize, withScope

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn().mockResolvedValue({ allowed: true, scope: 'all' }),
  applyScope: jest.fn((query) => query),
}));

const chain = sharedDb.__chain;

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['where', 'select'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
}

const {
  requireAnyRole,
  requireOwnerOrRole,
  loadEntity,
  authorize,
  withScope,
} = require('../../src/middleware/rbacMiddleware');
const rbacService = require('../../src/services/rbacService');

function makeRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
});

// ── requireAnyRole ────────────────────────────────────────────────────────────
describe('requireAnyRole', () => {
  it('calls next() when user has a required role', () => {
    const req = { user: { id: 1, roles: ['SYSTEM_ADMIN'] } };
    const res = makeRes();
    const next = jest.fn();
    requireAnyRole('SYSTEM_ADMIN', 'M_AND_E')(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when req.user is missing', () => {
    const req = {};
    const res = makeRes();
    const next = jest.fn();
    requireAnyRole('SYSTEM_ADMIN')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user has no matching role', () => {
    const req = { user: { id: 1, roles: ['FOCAL_PERSON'] } };
    const res = makeRes();
    const next = jest.fn();
    requireAnyRole('SYSTEM_ADMIN')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── requireOwnerOrRole ────────────────────────────────────────────────────────
describe('requireOwnerOrRole', () => {
  it('returns 401 when req.user is missing', () => {
    const req = {};
    const res = makeRes();
    const next = jest.fn();
    requireOwnerOrRole('user_id', 'SYSTEM_ADMIN')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when user has an escalation role', () => {
    const req = { user: { id: 1, roles: ['SYSTEM_ADMIN'] }, entity: { user_id: 99 } };
    const res = makeRes();
    const next = jest.fn();
    requireOwnerOrRole('user_id', 'SYSTEM_ADMIN')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('calls next() when user is the owner of the entity', () => {
    const req = { user: { id: 5, roles: ['FOCAL_PERSON'] }, entity: { user_id: 5 } };
    const res = makeRes();
    const next = jest.fn();
    requireOwnerOrRole('user_id', 'SYSTEM_ADMIN')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when user is neither owner nor has required role', () => {
    const req = { user: { id: 5, roles: ['FOCAL_PERSON'] }, entity: { user_id: 9 } };
    const res = makeRes();
    const next = jest.fn();
    requireOwnerOrRole('user_id', 'SYSTEM_ADMIN')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when entity is missing', () => {
    const req = { user: { id: 5, roles: ['FOCAL_PERSON'] } };
    const res = makeRes();
    const next = jest.fn();
    requireOwnerOrRole('user_id', 'SYSTEM_ADMIN')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── loadEntity ────────────────────────────────────────────────────────────────
describe('loadEntity', () => {
  it('loads entity onto req.entity and calls next', async () => {
    const entity = { id: 5, name: 'Test' };
    chain.first.mockResolvedValueOnce(entity);
    const req = { params: { id: '5' } };
    const res = makeRes();
    const next = jest.fn();
    await loadEntity('plan_nodes')(req, res, next);
    expect(req.entity).toEqual(entity);
    expect(next).toHaveBeenCalled();
  });

  it('returns 404 when entity not found', async () => {
    chain.first.mockResolvedValueOnce(undefined);
    const req = { params: { id: '999' } };
    const res = makeRes();
    const next = jest.fn();
    await loadEntity('plan_nodes')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('uses custom idParam', async () => {
    const entity = { id: 7 };
    chain.first.mockResolvedValueOnce(entity);
    const req = { params: { planId: '7' } };
    const res = makeRes();
    const next = jest.fn();
    await loadEntity('plan_nodes', 'planId')(req, res, next);
    expect(req.entity).toEqual(entity);
  });

  it('calls next(err) on DB error', async () => {
    const err = new Error('DB failure');
    chain.first.mockRejectedValueOnce(err);
    const req = { params: { id: '5' } };
    const res = makeRes();
    const next = jest.fn();
    await loadEntity('plan_nodes')(req, res, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});

// ── authorize ─────────────────────────────────────────────────────────────────
describe('authorize', () => {
  it('returns 401 when req.user is missing', async () => {
    const req = {};
    const res = makeRes();
    const next = jest.fn();
    await authorize({ module: 'workplan', action: 'read' })(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and sets req.rbac when permission allowed', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'own' });
    const req = { user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();
    await authorize({ module: 'workplan', action: 'read' })(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.rbac).toEqual({ scope: 'own', module: 'workplan', action: 'read' });
  });

  it('returns 403 when permission not allowed', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const req = { user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();
    await authorize({ module: 'workplan', action: 'delete' })(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Insufficient permissions: workplan:delete', code: 'FORBIDDEN' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next(err) when checkPermission throws', async () => {
    rbacService.checkPermission.mockRejectedValueOnce(new Error('RBAC error'));
    const req = { user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();
    await authorize({ module: 'workplan', action: 'read' })(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── withScope ─────────────────────────────────────────────────────────────────
describe('withScope', () => {
  it('attaches req.applyScope function and calls next', () => {
    const req = { rbac: { scope: 'own' }, user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();
    withScope()(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(typeof req.applyScope).toBe('function');
  });

  it('req.applyScope returns query unchanged when no rbac', () => {
    const req = { user: { id: 1 } }; // no req.rbac
    const res = makeRes();
    const next = jest.fn();
    withScope()(req, res, next);
    const fakeQuery = { where: jest.fn() };
    const result = req.applyScope(fakeQuery);
    expect(result).toBe(fakeQuery);
  });

  it('req.applyScope delegates to rbacService.applyScope when rbac present', () => {
    const req = { rbac: { scope: 'division' }, user: { id: 1 } };
    const res = makeRes();
    const next = jest.fn();
    withScope({ ownerColumn: 'created_by_user_id' })(req, res, next);
    const fakeQuery = {};
    req.applyScope(fakeQuery);
    expect(rbacService.applyScope).toHaveBeenCalledWith(
      fakeQuery, 'division', req.user, { ownerColumn: 'created_by_user_id' },
    );
  });
});