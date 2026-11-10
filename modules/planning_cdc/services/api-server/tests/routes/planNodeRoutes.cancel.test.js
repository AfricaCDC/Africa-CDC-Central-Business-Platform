/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── planNodeRoutes — DELETE + CANCEL ──
//
// Covers:
//   DELETE /api/plan-nodes/specific-activity/:id        (hard delete, focal+DRAFT only / admin any)
//   POST   /api/plan-nodes/specific-activity/:id/cancel (DRAFT → hard delete, others → status flip)
//
// Behaviour matrix for cancel:
//   status DRAFT     → row is HARD-DELETED, response { success: true, deleted: true }
//   status IN_REVIEW → row flipped to CANCELLED (kept for audit, hidden from lists)
//   status APPROVED  → flipped to CANCELLED
//   status REJECTED  → flipped to CANCELLED
//   status CANCELLED → 400 (already cancelled, no-op)

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = global.__testUser || null;
    next();
  },
}));

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

// Mock rbacService — cancel/delete routes use isAdmin() which calls checkPermission(pirs,delete)
// and also checkPermission(tasks,delete). Use a per-test configurable factory.
// global.__rbacPermission: default result for tasks:* (owns own rows)
// global.__isAdmin: controls whether pirs:delete is allowed (isAdmin check)
jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn((_userId, module) => {
    // isAdmin() calls checkPermission(userId, 'pirs', 'delete')
    if (module === 'pirs') return Promise.resolve(global.__isAdmin ? { allowed: true, scope: 'all' } : { allowed: false, scope: null });
    return Promise.resolve(global.__rbacPermission || { allowed: true, scope: 'own' });
  }),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: false, denies: [] }),
}));

// Mock divisionAliasService
jest.mock('../../src/services/divisionAliasService', () => ({
  sameDivision: jest.fn((a, b) => Promise.resolve(a === b)),
  resolveAliases: jest.fn((code) => Promise.resolve([code])),
  scopeCoversDivision: jest.fn((_user, scope) => Promise.resolve(scope === 'all')),
  getUserDivisionCodes: jest.fn(() => Promise.resolve([])),
  invalidateAliasCache: jest.fn(),
}));

// Mock @rbm/lib/user-divisions for isFocalFor / isHodFor
jest.mock('@rbm/lib/user-divisions', () => {
  const actual = jest.requireActual('@rbm/lib/user-divisions');
  return {
    ...actual,
    getUserDivisionCodes: jest.fn((_knex, _userId, opts = {}) => {
      const roles = opts.roles || [];
      if (roles.includes('FOCAL')) return Promise.resolve(global.__focalDivisions || []);
      if (roles.includes('RESPONSIBLE')) return Promise.resolve(global.__hodDivisions || []);
      return Promise.resolve([]);
    }),
  };
});

const request = require('supertest');
const app = require('../../src/app');

function resetChain() {
  const c = sharedDb.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.del.mockReset().mockResolvedValue(1);
  c.delete.mockReset().mockResolvedValue(1);
  c.pluck.mockReset().mockResolvedValue([]);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
}

const FOCAL_USER = { id: 10, email: 'focal@x.com', roles: ['FOCAL_PERSON'], bu_id: 1 };
const OTHER_FOCAL = { id: 30, email: 'other@x.com', roles: ['FOCAL_PERSON'], bu_id: 1 };
const ADMIN_USER = { id: 99, email: 'admin@x.com', roles: ['SYSTEM_ADMIN'], bu_id: 1 };

beforeEach(() => {
  resetChain();
  global.__testUser = null;
  global.__rbacPermission = { allowed: true, scope: 'own' };
  global.__isAdmin = false; // controls isAdmin() result (pirs:delete)
  global.__focalDivisions = [];
  global.__hodDivisions = [];
});

// ─────────────────────────────────────────────────────────────────
//   DELETE /api/plan-nodes/specific-activity/:id
// ─────────────────────────────────────────────────────────────────
describe('DELETE /api/plan-nodes/specific-activity/:id', () => {
  it('should return 400 when the id is not a positive integer', async () => {
    global.__testUser = FOCAL_USER;
    const res = await request(app).delete('/api/plan-nodes/specific-activity/abc');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid id/);
  });

  it('should return 404 when the id does not resolve', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app).delete('/api/plan-nodes/specific-activity/9999');
    expect(res.status).toBe(404);
  });

  it('should return 404 when the id resolves to the wrong node_type', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 5,
      node_type: 'BROAD_ACTIVITY',
    });
    const res = await request(app).delete('/api/plan-nodes/specific-activity/5');
    expect(res.status).toBe(404);
  });

  it('should return 403 when a focal who is not the creator tries to delete', async () => {
    global.__testUser = OTHER_FOCAL;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'DRAFT',
      created_by_user_id: FOCAL_USER.id,
    });

    const res = await request(app).delete('/api/plan-nodes/specific-activity/42');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/No permission/);
    expect(sharedDb.__chain.delete).not.toHaveBeenCalled();
  });

  it('should return 403 when the focal creator tries to delete a non-DRAFT row (IN_REVIEW)', async () => {
    // With own-scope: allowed = isOwner && status === DRAFT.
    // IN_REVIEW: allowed = false → 403.
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'IN_REVIEW',
      created_by_user_id: FOCAL_USER.id,
    });

    const res = await request(app).delete('/api/plan-nodes/specific-activity/42');
    expect(res.status).toBe(403);
    expect(sharedDb.__chain.delete).not.toHaveBeenCalled();
  });

  it('should return 403 when the focal creator tries to delete an APPROVED row', async () => {
    // With own-scope: allowed = isOwner && status === DRAFT → false for APPROVED.
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'APPROVED',
      created_by_user_id: FOCAL_USER.id,
    });

    const res = await request(app).delete('/api/plan-nodes/specific-activity/42');
    expect(res.status).toBe(403);
  });

  it('should return 403 when the focal creator tries to delete a REJECTED row', async () => {
    // With own-scope: allowed = isOwner && status === DRAFT → false for REJECTED.
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'REJECTED',
      created_by_user_id: FOCAL_USER.id,
    });

    const res = await request(app).delete('/api/plan-nodes/specific-activity/42');
    expect(res.status).toBe(403);
  });

  it('should hard-delete a DRAFT row owned by the caller', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'DRAFT',
      created_by_user_id: FOCAL_USER.id,
    });

    const res = await request(app).delete('/api/plan-nodes/specific-activity/42');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(sharedDb.__chain.delete).toHaveBeenCalled();
  });

  it('should let an admin delete an APPROVED row (admin bypass)', async () => {
    global.__testUser = ADMIN_USER;
    global.__rbacPermission = { allowed: true, scope: 'all' };
    global.__isAdmin = true;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'APPROVED',
      created_by_user_id: FOCAL_USER.id, // owned by focal but admin wins
    });

    const res = await request(app).delete('/api/plan-nodes/specific-activity/42');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(sharedDb.__chain.delete).toHaveBeenCalled();
  });

  it('should let an admin delete an IN_REVIEW row (admin bypass)', async () => {
    global.__testUser = ADMIN_USER;
    global.__rbacPermission = { allowed: true, scope: 'all' };
    global.__isAdmin = true;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'IN_REVIEW',
      created_by_user_id: FOCAL_USER.id,
    });

    const res = await request(app).delete('/api/plan-nodes/specific-activity/42');
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────
//   POST /api/plan-nodes/specific-activity/:id/cancel
// ─────────────────────────────────────────────────────────────────
describe('POST /api/plan-nodes/specific-activity/:id/cancel', () => {
  it('should return 400 when the id is invalid', async () => {
    global.__testUser = FOCAL_USER;
    const res = await request(app).post('/api/plan-nodes/specific-activity/abc/cancel');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid id/);
  });

  it('should return 404 when the id does not resolve', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app).post('/api/plan-nodes/specific-activity/9999/cancel');
    expect(res.status).toBe(404);
  });

  it('should return 404 when the id resolves to the wrong node_type', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 5,
      node_type: 'BROAD_ACTIVITY',
    });
    const res = await request(app).post('/api/plan-nodes/specific-activity/5/cancel');
    expect(res.status).toBe(404);
  });

  it('should return 403 when a non-creator non-admin tries to cancel', async () => {
    global.__testUser = OTHER_FOCAL;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'DRAFT',
      created_by_user_id: FOCAL_USER.id,
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/cancel');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/only the creator/);
  });

  it('should return 400 when the row is already CANCELLED (idempotency guard)', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'CANCELLED',
      created_by_user_id: FOCAL_USER.id,
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/cancel');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already cancelled/);
    expect(sharedDb.__chain.delete).not.toHaveBeenCalled();
    expect(sharedDb.__chain.update).not.toHaveBeenCalled();
  });

  it('should HARD-DELETE a DRAFT row when cancelled by the creator', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'DRAFT',
      created_by_user_id: FOCAL_USER.id,
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/cancel');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, deleted: true });
    expect(sharedDb.__chain.delete).toHaveBeenCalled();
    expect(sharedDb.__chain.update).not.toHaveBeenCalled();
  });

  it('should flip an IN_REVIEW row to CANCELLED (soft) instead of deleting', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'IN_REVIEW',
        created_by_user_id: FOCAL_USER.id,
      })
      .mockResolvedValueOnce({ id: 42, status: 'CANCELLED' });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/cancel');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');

    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.status).toBe('CANCELLED');
    expect(updateArg.updated_at).toBeInstanceOf(Date);
    expect(sharedDb.__chain.delete).not.toHaveBeenCalled();
  });

  it('should flip an APPROVED row to CANCELLED (soft) instead of deleting', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'APPROVED',
        created_by_user_id: FOCAL_USER.id,
      })
      .mockResolvedValueOnce({ id: 42, status: 'CANCELLED' });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/cancel');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');

    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.status).toBe('CANCELLED');
    expect(sharedDb.__chain.delete).not.toHaveBeenCalled();
  });

  it('should flip a REJECTED row to CANCELLED (soft)', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'REJECTED',
        created_by_user_id: FOCAL_USER.id,
      })
      .mockResolvedValueOnce({ id: 42, status: 'CANCELLED' });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/cancel');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });

  it('should let an admin cancel a non-creator DRAFT row (hard-delete branch)', async () => {
    global.__testUser = ADMIN_USER;
    global.__isAdmin = true;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'DRAFT',
      created_by_user_id: FOCAL_USER.id, // belongs to a focal
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/cancel');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, deleted: true });
    expect(sharedDb.__chain.delete).toHaveBeenCalled();
  });

  it('should let an admin cancel a non-creator APPROVED row (soft-cancel branch)', async () => {
    global.__testUser = ADMIN_USER;
    global.__isAdmin = true;
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'APPROVED',
        created_by_user_id: FOCAL_USER.id,
      })
      .mockResolvedValueOnce({ id: 42, status: 'CANCELLED' });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/cancel');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
  });
});