/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── indicatorDivisionReportRoutes integration tests ──
//
// Covers: GET /review-queue, GET /all, GET /summary, GET / (list),
//         GET /:planNodeId (detail + auto-init),
//         POST / (save draft), POST /:id/submit, POST /:id/approve,
//         POST /:id/reject, POST /:id/admin-set-status, GET /:id/history

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = global.__testUser || { id: 1, email: 'admin@africacdc.org', division_code: 'DCM' };
    next();
  },
}));

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(() => Promise.resolve({ allowed: true, scope: 'all' })),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: true, denies: [] }),
}));

jest.mock('../../src/services/divisionAliasService', () => ({
  scopeCoversDivision: jest.fn().mockResolvedValue(true),
  sameDivision: jest.fn().mockResolvedValue(false),
  getDirectoratesForUser: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../src/services/reporting/indicatorDivisionReportsService', () => ({
  getAllForIndicator: jest.fn().mockResolvedValue([]),
  getOrInit: jest.fn().mockResolvedValue({ id: 99, plan_node_id: 1, division_code: 'DCM', status: 'DRAFT' }),
  getHistory: jest.fn().mockResolvedValue([]),
  saveDraft: jest.fn().mockResolvedValue({ id: 10, plan_node_id: 1, division_code: 'DCM', status: 'DRAFT' }),
  submit: jest.fn().mockResolvedValue({ id: 10, status: 'IN_REVIEW' }),
  approve: jest.fn().mockResolvedValue({ id: 10, status: 'APPROVED' }),
  reject: jest.fn().mockResolvedValue({ id: 10, status: 'REJECTED' }),
  markNotApplicable: jest.fn().mockResolvedValue({ id: 10, status: 'NOT_APPLICABLE' }),
  forceSetStatus: jest.fn().mockResolvedValue({ id: 10, status: 'DRAFT' }),
}));

jest.mock('../../src/services/reporting/divisionContribution', () => ({
  getReportRole: jest.fn().mockResolvedValue(null),
  isCoveredByOwner: jest.fn().mockResolvedValue(false),
}));

const request = require('supertest');
const app = require('../../src/app');
const rbacService = require('../../src/services/rbacService');
const svc = require('../../src/services/reporting/indicatorDivisionReportsService');
const { isCoveredByOwner } = require('../../src/services/reporting/divisionContribution');
const { scopeCoversDivision } = require('../../src/services/divisionAliasService');
const chain = sharedDb.__chain;

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.delete.mockReset().mockResolvedValue(1);
  chain.del.mockReset().mockResolvedValue(1);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'whereNotIn', 'orderBy', 'leftJoin', 'join',
    'whereNull', 'whereNotNull', 'pluck', 'whereNotExists', 'whereRaw',
    'andOn', 'on', 'limit', 'orderByRaw', 'whereExists', 'andWhere', 'orWhere',
    'from', 'raw'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
    else chain[m] = jest.fn().mockReturnValue(chain);
  });
  // db.raw used inline in the route for COALESCE etc.
  sharedDb.raw = jest.fn().mockReturnValue(chain);
}

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org', division_code: 'DCM' };

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  global.__testUser = ADMIN_USER;
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  isCoveredByOwner.mockResolvedValue(false);
  scopeCoversDivision.mockResolvedValue(true);
  svc.getAllForIndicator.mockResolvedValue([]);
  svc.getOrInit.mockResolvedValue({ id: 99, plan_node_id: 1, division_code: 'DCM', status: 'DRAFT' });
  svc.getHistory.mockResolvedValue([]);
  svc.saveDraft.mockResolvedValue({ id: 10, status: 'DRAFT' });
  svc.submit.mockResolvedValue({ id: 10, status: 'IN_REVIEW' });
  svc.approve.mockResolvedValue({ id: 10, status: 'APPROVED' });
  svc.reject.mockResolvedValue({ id: 10, status: 'REJECTED' });
  svc.forceSetStatus.mockResolvedValue({ id: 10, status: 'DRAFT' });
});

afterEach(() => {
  global.__testUser = null;
});

// ── GET /api/reporting/indicator-division-reports/review-queue ───────────────
describe('GET /api/reporting/indicator-division-reports/review-queue', () => {
  it('should return 200 with empty data when no rows', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const res = await request(app).get('/api/reporting/indicator-division-reports/review-queue');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should filter out covered CONTRIB rows', async () => {
    const rows = [
      { role: 'CONTRIB', plan_node_id: 1, division_code: 'DCM' },
      { role: 'OWNER', plan_node_id: 1, division_code: 'WHC' },
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    isCoveredByOwner.mockResolvedValueOnce(true); // CONTRIB is covered
    const res = await request(app).get('/api/reporting/indicator-division-reports/review-queue');
    expect(res.status).toBe(200);
    // CONTRIB filtered out, only OWNER remains
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].role).toBe('OWNER');
  });

  it('should apply quarter and fiscal_year filters', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const res = await request(app)
      .get('/api/reporting/indicator-division-reports/review-queue?quarter=Q2&fiscal_year=2026');
    expect(res.status).toBe(200);
  });

  it('should scope by division filter for admin', async () => {
    chain.pluck = jest.fn().mockReturnValue(chain);
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const res = await request(app)
      .get('/api/reporting/indicator-division-reports/review-queue?division=DCM');
    expect(res.status).toBe(200);
  });

  it('should pass through is_big_ticket on rows', async () => {
    const rows = [{ report_id: 1, role: 'OWNER', plan_node_id: 5, is_big_ticket: 1 }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const res = await request(app)
      .get('/api/reporting/indicator-division-reports/review-queue?quarter=Q1&fiscal_year=2026');
    expect(res.status).toBe(200);
    expect(res.body.data[0].is_big_ticket).toBe(1);
  });
});

// ── GET /api/reporting/indicator-division-reports/all ────────────────────────
describe('GET /api/reporting/indicator-division-reports/all', () => {
  it('should return 200 with data for admin', async () => {
    const rows = [{ report_id: 1, division_code: 'DCM', status: 'DRAFT' }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const res = await request(app)
      .get('/api/reporting/indicator-division-reports/all?quarter=Q1&fiscal_year=2026');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return empty array for non-admin without division filter', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const res = await request(app)
      .get('/api/reporting/indicator-division-reports/all?quarter=Q1&fiscal_year=2026');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('should apply division filter when provided', async () => {
    const rows = [{ report_id: 2, division_code: 'DCM' }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const res = await request(app)
      .get('/api/reporting/indicator-division-reports/all?division=DCM');
    expect(res.status).toBe(200);
  });

  it('should filter by status when provided', async () => {
    const rows = [{ report_id: 3, status: 'NOT_APPLICABLE' }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const res = await request(app)
      .get('/api/reporting/indicator-division-reports/all?status=NOT_APPLICABLE');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(rows);
  });

  it('should return data without quarter/fiscal_year filters when they are omitted (admin)', async () => {
    const rows = [{ report_id: 1 }, { report_id: 2 }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const res = await request(app)
      .get('/api/reporting/indicator-division-reports/all?status=NOT_APPLICABLE');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('should pass through flagged_by_* fields for a NOT_APPLICABLE indicator dispute', async () => {
    const rows = [{
      report_id: 4, status: 'NOT_APPLICABLE',
      flagged_by_first_name: 'Dennis', flagged_by_last_name: 'Kibiye', flagged_by_email: 'kibiyed@africacdc.org',
    }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const res = await request(app)
      .get('/api/reporting/indicator-division-reports/all?status=NOT_APPLICABLE');
    expect(res.status).toBe(200);
    expect(res.body.data[0].flagged_by_first_name).toBe('Dennis');
    expect(res.body.data[0].flagged_by_last_name).toBe('Kibiye');
    expect(res.body.data[0].flagged_by_email).toBe('kibiyed@africacdc.org');
  });

  it('should pass through is_big_ticket on rows', async () => {
    const rows = [{ report_id: 2, is_big_ticket: 1 }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const res = await request(app)
      .get('/api/reporting/indicator-division-reports/all?status=APPROVED');
    expect(res.status).toBe(200);
    expect(res.body.data[0].is_big_ticket).toBe(1);
  });
});

// ── GET /api/reporting/indicator-division-reports/summary ────────────────────
describe('GET /api/reporting/indicator-division-reports/summary', () => {
  it('should return empty object when no plan_node_ids', async () => {
    const res = await request(app).get('/api/reporting/indicator-division-reports/summary');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({});
  });

  it('should return summary keyed by planNodeId__quarter', async () => {
    // nodes query
    chain.then
      .mockImplementationOnce((r) => Promise.resolve([
        { id: 1, responsible_division_code: 'DCM', contributing_divisions: '["WHC"]' },
      ]).then(r))
      // sas query
      .mockImplementationOnce((r) => Promise.resolve([]).then(r))
      // reports query
      .mockImplementationOnce((r) => Promise.resolve([
        { plan_node_id: 1, quarter: 'Q1', role: 'OWNER', status: 'APPROVED' },
        { plan_node_id: 1, quarter: 'Q1', role: 'CONTRIB', status: 'DRAFT' },
      ]).then(r));

    const res = await request(app)
      .get('/api/reporting/indicator-division-reports/summary?plan_node_ids=1&quarter=Q1&fiscal_year=2026');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data['1__Q1']).toBeDefined();
    expect(res.body.data['1__Q1'].owner_status).toBe('APPROVED');
    expect(res.body.data['1__Q1'].contribs_draft).toBe(1);
  });
});

// ── GET /api/reporting/indicator-division-reports (list) ─────────────────────
describe('GET /api/reporting/indicator-division-reports', () => {
  it('should return list of reports for division', async () => {
    const rows = [{ id: 1, plan_node_id: 1, division_code: 'DCM', status: 'DRAFT' }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const res = await request(app)
      .get('/api/reporting/indicator-division-reports?division_code=DCM&fiscal_year=2026');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ── GET /api/reporting/indicator-division-reports/:planNodeId (detail) ───────
describe('GET /api/reporting/indicator-division-reports/:planNodeId', () => {
  it('should return detail with null myReport and no auto-init when no role', async () => {
    // myReport lookup = null
    chain.first.mockResolvedValueOnce(null);
    svc.getAllForIndicator.mockResolvedValueOnce([]);
    // getReportRole returns null (no role → no init)
    const { getReportRole } = require('../../src/services/reporting/divisionContribution');
    getReportRole.mockResolvedValueOnce(null);
    // node lookup for expectedContributors
    chain.first.mockResolvedValueOnce({ id: 1, responsible_division_code: 'DCM', contributing_divisions: null });
    // sas query
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    // divRows
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    const res = await request(app)
      .get('/api/reporting/indicator-division-reports/1?quarter=Q1&fiscal_year=2026&division_code=DCM');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.myReport).toBeNull();
  });

  it('should auto-init when user has a role on the indicator', async () => {
    chain.first.mockResolvedValueOnce(null); // no myReport
    svc.getAllForIndicator.mockResolvedValueOnce([]);
    const { getReportRole } = require('../../src/services/reporting/divisionContribution');
    getReportRole.mockResolvedValueOnce('OWNER'); // has a role
    svc.getOrInit.mockResolvedValueOnce({ id: 99, plan_node_id: 1, division_code: 'DCM', status: 'DRAFT' });
    svc.getAllForIndicator.mockResolvedValueOnce([{ id: 99, role: 'OWNER', division_code: 'DCM', status: 'DRAFT' }]);
    // node
    chain.first.mockResolvedValueOnce({ id: 1, responsible_division_code: 'DCM', contributing_divisions: null });
    // approval_instances for workflow
    chain.first.mockResolvedValueOnce(null);
    // sas
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    // divRows
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    const res = await request(app)
      .get('/api/reporting/indicator-division-reports/1?quarter=Q1&fiscal_year=2026&division_code=DCM');
    expect(res.status).toBe(200);
    expect(svc.getOrInit).toHaveBeenCalled();
  });

  // Regression (H-4 lockout): once one division submits, its CONTRIBUTOR_CHAIN
  // leaves an UNASSIGNED pending step (approver_id IS NULL). A different
  // eligible division (here the OWNER) opening the SAME indicator must still
  // get its OWN report auto-initialised — the pre-existing pending step on
  // ANOTHER division's report must NOT suppress its init.
  it('should auto-init the user\'s own report even when another division has a pending unassigned step', async () => {
    const { getReportRole } = require('../../src/services/reporting/divisionContribution');
    // #1 myReport lookup → none yet for this (OWNER) division
    chain.first.mockResolvedValueOnce(null);
    // before-init: another division (CONTRIB) already has a report in review
    svc.getAllForIndicator.mockResolvedValueOnce([
      { id: 77, role: 'CONTRIB', division_code: 'XYZ', status: 'IN_REVIEW' },
    ]);
    // #2 the pendingApproval query finds an UNASSIGNED step on report 77
    chain.first.mockResolvedValueOnce({ step_id: 5, step_label: 'Review', report_id: 77, approver_id: null });
    // this user IS the OWNER of the indicator → must get its own report
    getReportRole.mockResolvedValueOnce('OWNER');
    svc.getOrInit.mockResolvedValueOnce({ id: 99, plan_node_id: 1, division_code: 'DCM', status: 'DRAFT' });
    // refresh after init
    svc.getAllForIndicator.mockResolvedValueOnce([
      { id: 99, role: 'OWNER', division_code: 'DCM', status: 'DRAFT' },
      { id: 77, role: 'CONTRIB', division_code: 'XYZ', status: 'IN_REVIEW' },
    ]);

    const res = await request(app)
      .get('/api/reporting/indicator-division-reports/1?quarter=Q1&fiscal_year=2026&division_code=DCM');
    expect(res.status).toBe(200);
    // The bug: with the `&& !pendingApproval` guard this is NOT called.
    expect(svc.getOrInit).toHaveBeenCalled();
    expect(res.body.data.myReport).toEqual(expect.objectContaining({ id: 99 }));
  });
});

// ── POST /api/reporting/indicator-division-reports (save draft) ──────────────
describe('POST /api/reporting/indicator-division-reports', () => {
  it('should save draft and return 200', async () => {
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports')
      .send({ plan_node_id: 1, division_code: 'DCM', quarter: 'Q1', fiscal_year: '2026', actual_value: 5 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(svc.saveDraft).toHaveBeenCalled();
  });

  // D-20261108-02: only someone who reports for that division writes its draft.
  it('should refuse a user outside the division (403)', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'division' });
    chain.first.mockResolvedValueOnce(undefined); // no user_divisions membership
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports')
      .send({ plan_node_id: 1, division_code: 'DCM', quarter: 'Q1', fiscal_year: '2026', actual_value: 9999 });
    expect(res.status).toBe(403);
    expect(svc.saveDraft).not.toHaveBeenCalled();
  });
});

// ── POST /api/reporting/indicator-division-reports/:id/submit ────────────────
describe('POST /api/reporting/indicator-division-reports/:id/submit', () => {
  it('should return 404 when report not found', async () => {
    chain.first.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/999/submit')
      .send({});
    expect(res.status).toBe(404);
  });

  it('should return 403 when user lacks permission', async () => {
    chain.first.mockResolvedValueOnce({ id: 10, division_code: 'DCM', status: 'DRAFT' });
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/10/submit')
      .send({});
    expect(res.status).toBe(403);
  });

  it('should submit and return 200 for admin (scope=all)', async () => {
    chain.first.mockResolvedValueOnce({ id: 10, division_code: 'DCM', status: 'DRAFT' });
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/10/submit')
      .send({});
    expect(res.status).toBe(200);
    expect(svc.submit).toHaveBeenCalled();
  });

  it('should submit when user has division membership', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 10, division_code: 'DCM', status: 'DRAFT' }) // report
      .mockResolvedValueOnce({ id: 7, user_id: 1, division_code: 'DCM', role: 'FOCAL_PERSON' }); // membership
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'division' });
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/10/submit')
      .send({});
    expect(res.status).toBe(200);
  });
});

// ── POST /api/reporting/indicator-division-reports/:id/not-applicable ────────
describe('POST /api/reporting/indicator-division-reports/:id/not-applicable', () => {
  it('should return 400 when reason is missing', async () => {
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/5/not-applicable')
      .send({ quarter: 'Q1', fiscal_year: '2026', division_code: 'DCM' });
    expect(res.status).toBe(400);
  });

  it('should return 400 when quarter or fiscal_year is missing', async () => {
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/5/not-applicable')
      .send({ reason: 'Not ours', division_code: 'DCM' });
    expect(res.status).toBe(400);
  });

  it('should return 404 when the indicator is not found', async () => {
    chain.first.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/999/not-applicable')
      .send({ reason: 'Not ours', quarter: 'Q1', fiscal_year: '2026', division_code: 'DCM' });
    expect(res.status).toBe(404);
  });

  it('should return 403 when user lacks permission', async () => {
    chain.first.mockResolvedValueOnce({ id: 5, code: 'IND-1', title: 'Test indicator' });
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/5/not-applicable')
      .send({ reason: 'Not ours', quarter: 'Q1', fiscal_year: '2026', division_code: 'DCM' });
    expect(res.status).toBe(403);
  });

  it('should mark not applicable and notify admins for admin (scope=all)', async () => {
    chain.first.mockResolvedValueOnce({ id: 5, code: 'IND-1', title: 'Test indicator' }); // plan_nodes
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    svc.markNotApplicable.mockResolvedValueOnce({ id: 10, status: 'NOT_APPLICABLE' });
    chain.then.mockImplementationOnce((r) => Promise.resolve([{ id: 2 }]).then(r)); // admin users query

    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/5/not-applicable')
      .send({ reason: 'Not our division', quarter: 'Q1', fiscal_year: '2026', division_code: 'DCM' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(svc.markNotApplicable).toHaveBeenCalledWith(
      expect.objectContaining({ planNodeId: 5, divisionCode: 'DCM', quarter: 'Q1', fiscalYear: '2026', reason: 'Not our division' })
    );
    expect(chain.insert).toHaveBeenCalled(); // notifications insert
  });

  it('should record an admin N/A under the main division, not the one sent (D-20261013-10)', async () => {
    chain.first.mockResolvedValueOnce({ id: 5, code: 'IND-1', title: 'Test indicator', responsible_division_code: 'SDI' });
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    svc.markNotApplicable.mockResolvedValueOnce({ id: 10, status: 'NOT_APPLICABLE' });
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await request(app)
      .post('/api/reporting/indicator-division-reports/5/not-applicable')
      .send({ reason: 'x', quarter: 'Q3', fiscal_year: '2026', division_code: 'MIS' });
    expect(svc.markNotApplicable).toHaveBeenCalledWith(expect.objectContaining({ divisionCode: 'SDI' }));
  });

  it('should surface the 403 when a contributor tries to mark N/A', async () => {
    const { ForbiddenError } = require('@rbm/lib/errors');
    chain.first
      .mockResolvedValueOnce({ id: 5, code: 'IND-1', title: 'Test indicator', responsible_division_code: 'SDI' })
      .mockResolvedValueOnce({ id: 7, user_id: 1, division_code: 'MIS', role: 'FOCAL_PERSON' });
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'division' });
    svc.markNotApplicable.mockRejectedValueOnce(new ForbiddenError('Only the main division (SDI) can mark this indicator as not applicable.'));
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/5/not-applicable')
      .send({ reason: 'x', quarter: 'Q3', fiscal_year: '2026', division_code: 'MIS' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, message: expect.stringContaining('main division (SDI)') });
  });

  it('should succeed when the user has division membership (non-admin scope)', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 5, code: 'IND-1', title: 'Test indicator' }) // plan_nodes
      .mockResolvedValueOnce({ id: 7, user_id: 1, division_code: 'DCM', role: 'FOCAL_PERSON' }); // membership
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'division' });
    svc.markNotApplicable.mockResolvedValueOnce({ id: 10, status: 'NOT_APPLICABLE' });
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r)); // no admins to notify

    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/5/not-applicable')
      .send({ reason: 'Not our division', quarter: 'Q1', fiscal_year: '2026', division_code: 'DCM' });
    expect(res.status).toBe(200);
  });

  it('should return 200 success even if notifications insert fails', async () => {
    chain.first.mockResolvedValueOnce({ id: 5, code: 'IND-1', title: 'Test indicator' }); // plan_nodes
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    svc.markNotApplicable.mockResolvedValueOnce({ id: 10, status: 'NOT_APPLICABLE' });
    // admin users query returns admin user
    chain.then.mockImplementationOnce((r) => Promise.resolve([{ id: 2 }]).then(r));
    // notifications insert rejects with a DB error
    chain.insert.mockRejectedValueOnce(new Error('Database connection lost'));

    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/5/not-applicable')
      .send({ reason: 'Not our division', quarter: 'Q1', fiscal_year: '2026', division_code: 'DCM' });

    // Core action succeeded, so still return 200 success
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ id: 10, status: 'NOT_APPLICABLE' });
  });
});

// ── POST /api/reporting/indicator-division-reports/:id/approve ───────────────
describe('POST /api/reporting/indicator-division-reports/:id/approve', () => {
  it('should return 404 when report not found', async () => {
    chain.first.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/999/approve')
      .send({ comment: 'ok' });
    expect(res.status).toBe(404);
  });

  it('should return 403 when not allowed', async () => {
    chain.first.mockResolvedValueOnce({ id: 10, division_code: 'DCM' });
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/10/approve')
      .send({});
    expect(res.status).toBe(403);
  });

  it('should approve and return 200', async () => {
    chain.first.mockResolvedValueOnce({ id: 10, division_code: 'DCM', status: 'IN_REVIEW' });
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    scopeCoversDivision.mockResolvedValueOnce(true);
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/10/approve')
      .send({ comment: 'LGTM' });
    expect(res.status).toBe(200);
    expect(svc.approve).toHaveBeenCalled();
  });
});

// ── POST /api/reporting/indicator-division-reports/:id/reject ────────────────
describe('POST /api/reporting/indicator-division-reports/:id/reject', () => {
  it('should return 404 when report not found', async () => {
    chain.first.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/999/reject')
      .send({});
    expect(res.status).toBe(404);
  });

  it('should return 403 when not allowed', async () => {
    chain.first.mockResolvedValueOnce({ id: 10, division_code: 'DCM' });
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/10/reject')
      .send({});
    expect(res.status).toBe(403);
  });

  it('should reject and return 200', async () => {
    chain.first.mockResolvedValueOnce({ id: 10, division_code: 'DCM', status: 'IN_REVIEW' });
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    scopeCoversDivision.mockResolvedValueOnce(true);
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/10/reject')
      .send({ comment: 'Not complete' });
    expect(res.status).toBe(200);
    expect(svc.reject).toHaveBeenCalled();
  });
});

// ── POST /api/reporting/indicator-division-reports/:id/admin-set-status ──────
describe('POST /api/reporting/indicator-division-reports/:id/admin-set-status', () => {
  it('should return 403 when not admin (scope not all)', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'division' });
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/10/admin-set-status')
      .send({ status: 'DRAFT' });
    expect(res.status).toBe(403);
  });

  it('should force-set status and return 200 for admin', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    const res = await request(app)
      .post('/api/reporting/indicator-division-reports/10/admin-set-status')
      .send({ status: 'DRAFT', comment: 'admin override' });
    expect(res.status).toBe(200);
    expect(svc.forceSetStatus).toHaveBeenCalledWith(10, 'DRAFT', 1, 'admin override');
  });
});

// ── GET /api/reporting/indicator-division-reports/:id/history ────────────────
describe('GET /api/reporting/indicator-division-reports/:id/history', () => {
  it('should return history array', async () => {
    svc.getHistory.mockResolvedValueOnce([{ id: 1, action: 'SUBMITTED' }]);
    const res = await request(app)
      .get('/api/reporting/indicator-division-reports/10/history');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/reporting/indicator-division-reports/owner-not-applicable (D-20261013-10)', () => {
  it('should return the N/A rows set by each main division', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([{ plan_node_id: 6069, quarter: 'Q3', division_code: 'SDI', rejection_reason: 'No target' }]).then(r));
    const res = await request(app).get('/api/reporting/indicator-division-reports/owner-not-applicable?fiscal_year=2026');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [expect.objectContaining({ plan_node_id: 6069, division_code: 'SDI' })] });
    expect(chain.whereRaw).toHaveBeenCalledWith('UPPER(r.division_code) = UPPER(p.responsible_division_code)');
  });
});

