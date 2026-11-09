/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── planNodeRoutes — APPROVAL WORKFLOW ──
//
// Covers the three transition endpoints:
//   POST /api/plan-nodes/specific-activity/:id/submit   (focal: DRAFT|REJECTED → IN_REVIEW)
//   POST /api/plan-nodes/specific-activity/:id/approve  (HOD/admin: IN_REVIEW → APPROVED)
//   POST /api/plan-nodes/specific-activity/:id/reject   (HOD/admin: IN_REVIEW → REJECTED + reason)
//
// Each endpoint goes through: id-validation → existence/type check →
// authorisation → status transition guard → DB update → enriched read-back.

// Force a single shared knex chain across all `require('knex')(...)` calls.
const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

// Submission requires an answered Decision Complexity Screening (D-20261026-04).
jest.mock('../../src/services/activityPlanning', () => ({
  ...jest.requireActual('../../src/services/activityPlanning'),
  hasScreening: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = global.__testUser || null;
    next();
  },
}));

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

// Mock workflow engine. Since cleaning Phase 1.1 (D-20260530-02) plan-node
// approval is a DIRECT single-HOD step — the submit endpoint must NOT call the
// template-driven workflow engine at all. This mock lets us assert that.
jest.mock('../../src/services/workflowEngine', () => ({
  startWorkflow: jest.fn(),
  decideWorkflowStep: jest.fn().mockResolvedValue({ isComplete: true }),
}));
const workflowEngine = require('../../src/services/workflowEngine');

// Mock rbacService — approval routes use checkPermission(tasks,approve/reject)
// and isAdmin() uses checkPermission(pirs,delete).
// global.__rbacPermission controls tasks:* calls
// global.__isAdmin controls whether pirs:delete is allowed
jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn((_userId, module) => {
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
const HOD_USER = { id: 20, email: 'hod@x.com', roles: ['HEAD_OF_DIVISION'], bu_id: 1 };
const OTHER_FOCAL = { id: 30, email: 'other@x.com', roles: ['FOCAL_PERSON'], bu_id: 1 };
const OTHER_HOD = { id: 40, email: 'other.hod@x.com', roles: ['HEAD_OF_DIVISION'], bu_id: 1 };
const ADMIN_USER = { id: 99, email: 'admin@x.com', roles: ['SYSTEM_ADMIN'], bu_id: 1 };

beforeEach(() => {
  resetChain();
  global.__testUser = null;
  global.__rbacPermission = { allowed: true, scope: 'own' };
  global.__isAdmin = false;
  global.__focalDivisions = [];
  global.__hodDivisions = [];
});

// ─────────────────────────────────────────────────────────────────
//   POST /api/plan-nodes/specific-activity/:id/submit
// ─────────────────────────────────────────────────────────────────
describe('POST /api/plan-nodes/specific-activity/:id/submit', () => {
  it('should return 400 when the id path param is not a positive integer', async () => {
    global.__testUser = FOCAL_USER;
    const res = await request(app).post('/api/plan-nodes/specific-activity/abc/submit');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid id/);
  });

  it('should return 404 when the id does not resolve to any plan node', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app).post('/api/plan-nodes/specific-activity/9999/submit');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/);
  });

  it('should return 404 when the id resolves to a non-SPECIFIC_ACTIVITY node', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 5,
      node_type: 'BROAD_ACTIVITY',
    });
    const res = await request(app).post('/api/plan-nodes/specific-activity/5/submit');
    expect(res.status).toBe(404);
  });

  it('should return 403 when a focal who is not the creator tries to submit', async () => {
    global.__testUser = OTHER_FOCAL;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'DRAFT',
      created_by_user_id: FOCAL_USER.id,
      responsible_division_code: 'DPHI',
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/submit');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/only the creator/);
  });

  it('should return 400 when the row is in APPROVED (cannot submit from APPROVED)', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'APPROVED',
      created_by_user_id: FOCAL_USER.id,
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/submit');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot submit from status APPROVED/);
  });

  it('should return 400 when the row is already IN_REVIEW', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'IN_REVIEW',
      created_by_user_id: FOCAL_USER.id,
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/submit');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot submit from status IN_REVIEW/);
  });

  it('should return 400 when the row is CANCELLED (cannot resurrect a cancelled row)', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'CANCELLED',
      created_by_user_id: FOCAL_USER.id,
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/submit');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot submit from status CANCELLED/);
  });

  it('should return 422 when the Decision Complexity Screening is not answered', async () => {
    global.__testUser = FOCAL_USER;
    require('../../src/services/activityPlanning').hasScreening.mockResolvedValueOnce(false);
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42, node_type: 'SPECIFIC_ACTIVITY', status: 'DRAFT',
      created_by_user_id: FOCAL_USER.id, focal_user_id: FOCAL_USER.id,
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/submit');
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/Decision Complexity Screening/);
    expect(workflowEngine.startWorkflow).not.toHaveBeenCalled();
  });

  it('should transition a DRAFT row to IN_REVIEW when submitted by the creator', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'DRAFT',
        created_by_user_id: FOCAL_USER.id,
        responsible_division_code: 'DPHI',
        focal_user_id: FOCAL_USER.id, // submit requires a designated focal
      })
      .mockResolvedValueOnce({
        id: 42,
        status: 'IN_REVIEW',
      });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/submit');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_REVIEW');

    // D-20260817-02 (supersedes D-20260530-02): submit IS template-driven —
    // the engine materialises the PLAN_NODE approval chain.
    expect(workflowEngine.startWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'PLAN_NODE', entityId: 42, submittedById: FOCAL_USER.id,
      divisionCode: 'DPHI',
    }));
    // The engine stamps status; the route completes the plan_nodes-specific
    // submit columns (no status key when the engine handled it).
    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.status).toBeUndefined();
    expect(updateArg.submitted_at).toBeInstanceOf(Date);
    expect(updateArg.reviewed_by_user_id).toBeNull();
    expect(updateArg.reviewed_at).toBeNull();
    expect(updateArg.rejection_reason).toBeNull();
  });

  it('should transition a REJECTED row back to IN_REVIEW (resubmit-after-fix flow)', async () => {
    global.__testUser = FOCAL_USER;
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'REJECTED',
        created_by_user_id: FOCAL_USER.id,
        focal_user_id: FOCAL_USER.id, // submit requires a designated focal
      })
      .mockResolvedValueOnce({ id: 42, status: 'IN_REVIEW' });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/submit');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_REVIEW');
  });

  it('should let an admin submit even when they are not the creator', async () => {
    global.__testUser = ADMIN_USER;
    global.__isAdmin = true; // admin bypass for isAdmin() check in submit
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'DRAFT',
        created_by_user_id: FOCAL_USER.id, // owned by someone else
        focal_user_id: FOCAL_USER.id, // submit requires a designated focal
      })
      .mockResolvedValueOnce({ id: 42, status: 'IN_REVIEW' });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/submit');
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────
//   POST /api/plan-nodes/specific-activity/:id/approve
// ─────────────────────────────────────────────────────────────────
describe('POST /api/plan-nodes/specific-activity/:id/approve', () => {
  it('should return 400 when the id is not a positive integer', async () => {
    global.__testUser = HOD_USER;
    const res = await request(app).post('/api/plan-nodes/specific-activity/abc/approve');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid id/);
  });

  it('should return 404 when the id does not resolve', async () => {
    global.__testUser = HOD_USER;
    sharedDb.__chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app).post('/api/plan-nodes/specific-activity/9999/approve');
    expect(res.status).toBe(404);
  });

  it('should return 404 when the id resolves to the wrong node_type', async () => {
    global.__testUser = HOD_USER;
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 5,
      node_type: 'OUTCOME_INDICATOR',
    });
    const res = await request(app).post('/api/plan-nodes/specific-activity/5/approve');
    expect(res.status).toBe(404);
  });

  it('should return 403 when a focal person tries to approve their own row', async () => {
    global.__testUser = FOCAL_USER;
    // FOCAL_USER has own-scope; hodHere=false; scopeCoversDivision=false → 403
    global.__rbacPermission = { allowed: true, scope: 'own' };
    global.__hodDivisions = [];
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'IN_REVIEW',
      responsible_division_code: 'DPHI',
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/approve');
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/No permission/);
  });

  it('should return 403 when a HOD of a DIFFERENT division tries to approve', async () => {
    global.__testUser = OTHER_HOD;
    // OTHER_HOD is not HOD of DPHI
    global.__hodDivisions = []; // not responsible for DPHI
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'IN_REVIEW',
      responsible_division_code: 'DPHI',
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/approve');
    expect(res.status).toBe(403);
  });

  it('should return 400 when the row is not in IN_REVIEW (cannot approve from DRAFT)', async () => {
    global.__testUser = HOD_USER;
    global.__hodDivisions = ['DPHI']; // HOD_USER is responsible for DPHI
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'DRAFT',
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 42, status: 'DRAFT' }); // unused read-back

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/approve');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot approve from status DRAFT/);
  });

  it('should return 400 when trying to approve an already-APPROVED row', async () => {
    global.__testUser = HOD_USER;
    global.__hodDivisions = ['DPHI'];
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'APPROVED',
      responsible_division_code: 'DPHI',
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/approve');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot approve from status APPROVED/);
  });

  it('should return 400 when the row is REJECTED (must be resubmitted first)', async () => {
    global.__testUser = HOD_USER;
    global.__hodDivisions = ['DPHI'];
    sharedDb.__chain.first.mockResolvedValueOnce({
      id: 42,
      node_type: 'SPECIFIC_ACTIVITY',
      status: 'REJECTED',
      responsible_division_code: 'DPHI',
    });

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/approve');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot approve from status REJECTED/);
  });

  it('should transition IN_REVIEW to APPROVED when called by the assigned HOD', async () => {
    global.__testUser = HOD_USER;
    global.__hodDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'IN_REVIEW',
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce(undefined) // no open approval instance → direct fallback
      .mockResolvedValueOnce({ id: 42, status: 'APPROVED' }); // read-back

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/approve');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');

    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.status).toBe('APPROVED');
    expect(updateArg.reviewed_by_user_id).toBe(HOD_USER.id);
    expect(updateArg.reviewed_at).toBeInstanceOf(Date);
    // Previous rejection_reason (if any) must be cleared on approval
    expect(updateArg.rejection_reason).toBeNull();
    expect(updateArg.updated_at).toBeInstanceOf(Date);
  });

  it('should let an admin approve without being the assigned HOD', async () => {
    global.__testUser = ADMIN_USER;
    global.__rbacPermission = { allowed: true, scope: 'all' }; // admin gets all-scope
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'IN_REVIEW',
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce(undefined) // no open approval instance → direct fallback
      .mockResolvedValueOnce({ id: 42, status: 'APPROVED' }); // read-back

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/approve');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');

    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.reviewed_by_user_id).toBe(ADMIN_USER.id);
  });

  it('should decide through the engine when an approval instance is open (D-20260817-02)', async () => {
    global.__testUser = HOD_USER;
    global.__hodDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'IN_REVIEW',
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 5 }) // open approval instance
      .mockResolvedValueOnce({ step_id: 11, step_label: 'Head of Division approval', step_order: 1 })
      .mockResolvedValueOnce({ id: 42, status: 'APPROVED' }); // read-back (engine finalised)

    const res = await request(app).post('/api/plan-nodes/specific-activity/42/approve');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
    expect(workflowEngine.decideWorkflowStep)
      .toHaveBeenCalledWith(11, 'APPROVED', null, HOD_USER.id, expect.anything());
    // The engine owns the entity update — the route must NOT run its direct
    // APPROVED fallback update.
    const directApprove = sharedDb.__chain.update.mock.calls.find(
      (c) => c[0] && c[0].status === 'APPROVED');
    expect(directApprove).toBeFalsy();
  });
});

// ─────────────────────────────────────────────────────────────────
//   POST /api/plan-nodes/specific-activity/:id/reject
// ─────────────────────────────────────────────────────────────────
describe('POST /api/plan-nodes/specific-activity/:id/reject', () => {
  it('should return 400 when the id is invalid', async () => {
    global.__testUser = HOD_USER;
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity/abc/reject')
      .send({ rejection_reason: 'meh' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid id/);
  });

  it('should return 400 when rejection_reason is missing entirely', async () => {
    global.__testUser = HOD_USER;
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity/42/reject')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/rejection_reason/);
  });

  it('should return 400 when rejection_reason is just whitespace', async () => {
    global.__testUser = HOD_USER;
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity/42/reject')
      .send({ rejection_reason: '     ' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/rejection_reason/);
  });

  it('should return 404 when the id does not resolve', async () => {
    global.__testUser = HOD_USER;
    sharedDb.__chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .post('/api/plan-nodes/specific-activity/9999/reject')
      .send({ rejection_reason: 'gone' });
    expect(res.status).toBe(404);
  });

  it('should return 403 when a focal person tries to reject', async () => {
    global.__testUser = FOCAL_USER;
    global.__hodDivisions = []; // FOCAL_USER is not HOD for any division
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'IN_REVIEW',
        responsible_division_code: 'DPHI',
      });

    const res = await request(app)
      .post('/api/plan-nodes/specific-activity/42/reject')
      .send({ rejection_reason: 'no thanks' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/No permission/);
  });

  it('should return 400 when trying to reject from a non-IN_REVIEW status (DRAFT)', async () => {
    global.__testUser = HOD_USER;
    global.__hodDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'DRAFT',
        responsible_division_code: 'DPHI',
      });

    const res = await request(app)
      .post('/api/plan-nodes/specific-activity/42/reject')
      .send({ rejection_reason: 'too soon' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot reject from status DRAFT/);
  });

  it('should return 400 when trying to reject an APPROVED row', async () => {
    global.__testUser = HOD_USER;
    global.__hodDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'APPROVED',
        responsible_division_code: 'DPHI',
      });

    const res = await request(app)
      .post('/api/plan-nodes/specific-activity/42/reject')
      .send({ rejection_reason: 'changed my mind' });
    expect(res.status).toBe(400);
  });

  it('should transition IN_REVIEW to REJECTED with a trimmed reason recorded', async () => {
    global.__testUser = HOD_USER;
    global.__hodDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'IN_REVIEW',
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 42, status: 'REJECTED' });

    const res = await request(app)
      .post('/api/plan-nodes/specific-activity/42/reject')
      .send({ rejection_reason: '   Budget too high — trim $50k first   ' });

    expect(res.status).toBe(200);
    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.status).toBe('REJECTED');
    expect(updateArg.rejection_reason).toBe('Budget too high — trim $50k first');
    expect(updateArg.reviewed_by_user_id).toBe(HOD_USER.id);
    expect(updateArg.reviewed_at).toBeInstanceOf(Date);
    expect(updateArg.updated_at).toBeInstanceOf(Date);
  });

  it('should let an admin reject without being the assigned HOD', async () => {
    global.__testUser = ADMIN_USER;
    global.__rbacPermission = { allowed: true, scope: 'all' };
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'IN_REVIEW',
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 42, status: 'REJECTED' });

    const res = await request(app)
      .post('/api/plan-nodes/specific-activity/42/reject')
      .send({ rejection_reason: 'admin override' });

    expect(res.status).toBe(200);
    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.reviewed_by_user_id).toBe(ADMIN_USER.id);
  });

  it('should coerce non-string rejection_reason values to a string before recording', async () => {
    // The route uses `String(req.body.rejection_reason).trim()` so a number
    // body should still pass validation and land as the string form.
    global.__testUser = HOD_USER;
    global.__hodDivisions = ['DPHI'];
    sharedDb.__chain.first
      .mockResolvedValueOnce({
        id: 42,
        node_type: 'SPECIFIC_ACTIVITY',
        status: 'IN_REVIEW',
        responsible_division_code: 'DPHI',
      })
      .mockResolvedValueOnce({ id: 42, status: 'REJECTED' });

    const res = await request(app)
      .post('/api/plan-nodes/specific-activity/42/reject')
      .send({ rejection_reason: 12345 });

    expect(res.status).toBe(200);
    const updateArg = sharedDb.__chain.update.mock.calls[0][0];
    expect(updateArg.rejection_reason).toBe('12345');
  });
});