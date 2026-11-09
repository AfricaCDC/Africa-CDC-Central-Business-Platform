// ── activityReportsRoutes (reporting) integration tests ──
//
// Covers: GET/POST /api/reporting/activity-reports and submit/approve/reject

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = global.__testUser || { id: 1, email: 'admin@africacdc.org' };
    next();
  },
}));

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(() => Promise.resolve(global.__rbacPermission || { allowed: true, scope: 'all' })),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: true, denies: [] }),
}));

jest.mock('../../src/services/divisionAliasService', () => ({
  scopeCoversDivision: jest.fn().mockResolvedValue(true),
  sameDivision: jest.fn().mockResolvedValue(false),
  resolveAliases: jest.fn().mockResolvedValue([]),
  getDirectoratesForUser: jest.fn().mockResolvedValue([]),
  getUserDivisionScope: jest.fn(async () => new Set()), // fresh Set per call — a shared instance leaks route-side add() between tests
}));

jest.mock('../../src/services/eventBusService', () => ({
  emitEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/contribFlowDerivation', () => ({
  deriveContribFlowForActivityReport: jest.fn().mockResolvedValue({ isContribFlow: false }),
  // Same semantics as the real parseContribList (JSON array / array → upper-cased codes)
  parseContribList: (raw) => {
    try {
      const a = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(a) ? a.filter(Boolean).map((c) => String(c).toUpperCase()) : [];
    } catch { return []; }
  },
}));

jest.mock('../../src/services/contributorWorkflowEngine', () => ({
  startContributorWorkflow: jest.fn().mockResolvedValue({}),
}));

// D-20260818-01: the single write path lives in activityReportsService.
// POST create-only, PUT by primary key, by-activity returns a list.
jest.mock('../../src/services/reporting/activityReportsService', () => ({
  createReport: jest.fn().mockResolvedValue({ id: 11, status: 'DRAFT' }),
  updateReport: jest.fn().mockResolvedValue({ id: 11, status: 'DRAFT' }),
  deleteDraft: jest.fn().mockResolvedValue({ id: 11, plan_node_id: 5, evidence: 0 }),
  listByActivity: jest.fn().mockResolvedValue([]),
  resolvePeriodFilters: jest.fn().mockResolvedValue({ quarter: 'Q2', fiscal_year: '2026' }),
  withSignOffNames: jest.fn((r) => Promise.resolve({ ...r, prepared_by_name: 'Jane Doe', approved_by_name: null })),
  // Real rule (pure function): author or admin, draft or rejected only.
  assertCanSubmit: jest.requireActual('../../src/services/reporting/activityReportsService').assertCanSubmit,
}));

jest.mock('../../src/services/reporting/activityReportPreparerService', () => ({
  listChanges: jest.fn().mockResolvedValue([]),
  changePreparer: jest.fn(),
}));

// D-20260817-02: owner submits start the DEFAULT chain; decisions go
// engine-first. Default handled:false keeps the direct-fallback behaviour
// the historical assertions pin.
jest.mock('../../src/services/workflowEngine', () => ({
  startWorkflow: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../src/services/workflowDecisions', () => ({
  decideEntityStep: jest.fn().mockResolvedValue({ handled: false }),
}));

const request = require('supertest');
const app = require('../../src/app');
const chain = sharedDb.__chain;
const rbacService = require('../../src/services/rbacService');
const { scopeCoversDivision } = require('../../src/services/divisionAliasService');
const { emitEvent } = require('../../src/services/eventBusService');
const contribFlow = require('../../src/services/contribFlowDerivation');
const contribEngine = require('../../src/services/contributorWorkflowEngine');
const workflowEngine = require('../../src/services/workflowEngine');
const workflowDecisions = require('../../src/services/workflowDecisions');
const arService = require('../../src/services/reporting/activityReportsService');

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.del.mockReset().mockResolvedValue(1);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'orderBy', 'leftJoin', 'join'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
}

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org', roles: ['SYSTEM_ADMIN'], division_code: 'DCM' };

// A report that satisfies the submission gate (D-20260818-01): dates,
// location, lead organiser, narrative and actual_spend all present. The
// evidence-file requirement is queued separately as the count read.
const COMPLETE_REPORT = Object.freeze({
  id: 5,
  plan_node_id: 10,
  status: 'DRAFT',
  start_date: '2026-07-01',
  end_date: '2026-07-03',
  location: 'Addis Ababa (HQ)',
  lead_organiser: 'Jane Doe',
  narrative: 'Key achievements',
  actual_spend: 1200,
});

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  global.__testUser = ADMIN_USER;
  global.__rbacPermission = { allowed: true, scope: 'all' };
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  scopeCoversDivision.mockResolvedValue(true);
  emitEvent.mockResolvedValue(undefined);
  contribFlow.deriveContribFlowForActivityReport.mockResolvedValue({ isContribFlow: false });
  contribEngine.startContributorWorkflow.mockResolvedValue({});
  // clearMocks wipes implementations between tests — restore the service defaults.
  arService.createReport.mockResolvedValue({ id: 11, status: 'DRAFT' });
  arService.updateReport.mockResolvedValue({ id: 11, status: 'DRAFT' });
  arService.listByActivity.mockResolvedValue([]);
  arService.resolvePeriodFilters.mockResolvedValue({ quarter: 'Q2', fiscal_year: '2026' });
});

afterEach(() => {
  global.__testUser = null;
  global.__rbacPermission = null;
});

// ── GET /api/reporting/activity-reports ───────────────────────────────────────
describe('GET /api/reporting/activity-reports', () => {
  it('should return list of activity reports', async () => {
    const rows = [{ id: 1, plan_node_id: 5, status: 'DRAFT' }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const res = await request(app).get('/api/reporting/activity-reports');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should resolve period_id into quarter/fiscal_year (no phantom column)', async () => {
    // activity_reports has NO reporting_period_id column — the period is
    // resolved to its quarter + FY by the service (D-20260818-01).
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await request(app).get('/api/reporting/activity-reports?period_id=3');
    expect(arService.resolvePeriodFilters).toHaveBeenCalledWith('3');
    expect(chain.where).toHaveBeenCalledWith('activity_reports.quarter', 'Q2');
    expect(chain.where).toHaveBeenCalledWith('activity_reports.fiscal_year', '2026');
    expect(chain.where).not.toHaveBeenCalledWith(
      'activity_reports.reporting_period_id', expect.anything(),
    );
  });

  it('should return an empty list when period_id resolves to nothing', async () => {
    arService.resolvePeriodFilters.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/reporting/activity-reports?period_id=999');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should filter by division', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await request(app).get('/api/reporting/activity-reports?division=DCM');
    expect(chain.where).toHaveBeenCalledWith('plan_nodes.responsible_division_code', 'DCM');
  });

  it('should filter by status', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await request(app).get('/api/reporting/activity-reports?status=SUBMITTED');
    expect(chain.where).toHaveBeenCalledWith('activity_reports.status', 'SUBMITTED');
  });
});

// ── GET /api/reporting/activity-reports/:id ───────────────────────────────────
describe('GET /api/reporting/activity-reports/:id', () => {
  it('should return 404 when not found', async () => {
    chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app).get('/api/reporting/activity-reports/999');
    expect(res.status).toBe(404);
  });

  it('should return the report when found', async () => {
    chain.first.mockResolvedValueOnce({ id: 5, plan_node_id: 10, status: 'DRAFT' });
    const res = await request(app).get('/api/reporting/activity-reports/5');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(5);
  });

  it('should carry the sign-off names of the activity reporting template', async () => {
    chain.first.mockResolvedValueOnce({ id: 5, plan_node_id: 10, status: 'DRAFT', user_id: 7 });
    const res = await request(app).get('/api/reporting/activity-reports/5');
    expect(res.body.prepared_by_name).toBe('Jane Doe');
    expect(res.body).toHaveProperty('approved_by_name', null);
  });
});

// ── GET /api/reporting/activity-reports/by-activity/:itemId ──────────────────
describe('GET /api/reporting/activity-reports/by-activity/:itemId', () => {
  // D-20260818-01: an activity carries any number of reports per quarter, so
  // this endpoint returns a list (was row|null) — empty array, never null.
  it('should return an empty array when no report found', async () => {
    const res = await request(app).get('/api/reporting/activity-reports/by-activity/42');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should return every report for the activity, filtered by quarter/fiscal_year', async () => {
    arService.listByActivity.mockResolvedValueOnce([{ id: 7 }, { id: 3 }]);
    const res = await request(app).get('/api/reporting/activity-reports/by-activity/42?quarter=Q1&fiscal_year=2026');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 7 }, { id: 3 }]);
    expect(arService.listByActivity).toHaveBeenCalledWith(expect.objectContaining({
      planNodeId: 42, quarter: 'Q1', fiscalYear: '2026',
    }));
  });
});

// ── GET /api/reporting/activity-reports/history/:itemId ───────────────────────
describe('GET /api/reporting/activity-reports/history/:itemId', () => {
  it('should return history array', async () => {
    const rows = [{ id: 1, period_label: 'Q1 2026', quarter: 'Q1', fiscal_year: '2026' }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const res = await request(app).get('/api/reporting/activity-reports/history/42');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── POST /api/reporting/activity-reports ──────────────────────────────────────
describe('POST /api/reporting/activity-reports', () => {
  it('should return 400 when plan_node_id is missing', async () => {
    const res = await request(app)
      .post('/api/reporting/activity-reports')
      .send({ quarter: 'Q1' });
    expect(res.status).toBe(400);
  });

  // D-20260818-01: POST is create-only. The old upsert (200 + UPDATE on a
  // second POST for the same tuple) is gone — every POST yields a new DRAFT.
  it('should CREATE a report through the service', async () => {
    arService.createReport.mockResolvedValueOnce({ id: 10, plan_node_id: 5, status: 'DRAFT' });
    const res = await request(app)
      .post('/api/reporting/activity-reports')
      .send({ plan_node_id: 5, quarter: 'Q1', fiscal_year: '2026' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(10);
    expect(arService.createReport).toHaveBeenCalledTimes(1);
  });

  it('should CREATE a second report for a tuple that already has one', async () => {
    // Previously this returned 200 + UPDATE, silently overwriting the first
    // report. It must now insert an independent submission.
    arService.createReport.mockResolvedValueOnce({ id: 12, plan_node_id: 5, status: 'DRAFT' });
    const res = await request(app)
      .post('/api/reporting/activity-reports')
      .send({ plan_node_id: 5, quarter: 'Q1', actual_spend: 500 });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(12);
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('should return 403 when non-admin user reports on wrong division', async () => {
    const focalUser = { id: 2, email: 'focal@org.org', roles: ['FOCAL_PERSON'], division_code: 'WHC' };
    global.__testUser = focalUser;
    // allowed=false => isAdmin=false → ownership check fires
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'own' });
    // Ownership check: db('plan_nodes').where('id', nodeId).first() → DCM (≠ WHC)
    chain.first.mockResolvedValueOnce({ id: 5, responsible_division_code: 'DCM' });
    const res = await request(app)
      .post('/api/reporting/activity-reports')
      .send({ plan_node_id: 5, quarter: 'Q1' });
    expect(res.status).toBe(403);
  });

  it('should allow a CONTRIBUTOR division to create a report (D-20260708-01)', async () => {
    const { sameDivision } = require('../../src/services/divisionAliasService');
    const contribUser = { id: 3, email: 'cpi@org.org', roles: ['FOCAL_PERSON'], division_code: 'CPI' };
    global.__testUser = contribUser;
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'own' });
    sameDivision.mockImplementation(async (a, b) => String(a).toUpperCase() === String(b).toUpperCase());
    const node = { id: 5, responsible_division_code: 'IMZ', contributing_divisions: '["CPI"]' };
    chain.first.mockResolvedValueOnce(node); // ownership check node fetch
    arService.createReport.mockResolvedValueOnce({ id: 11, plan_node_id: 5, status: 'DRAFT' });
    const res = await request(app)
      .post('/api/reporting/activity-reports')
      .send({ plan_node_id: 5, quarter: 'Q1', fiscal_year: '2026' });
    expect(res.status).toBe(201);
    expect(arService.createReport).toHaveBeenCalledTimes(1);
    sameDivision.mockResolvedValue(false);
  });

  it('should 403 a division that is neither responsible nor contributor', async () => {
    const { sameDivision } = require('../../src/services/divisionAliasService');
    const otherUser = { id: 4, email: 'whc@org.org', roles: ['FOCAL_PERSON'], division_code: 'WHC' };
    global.__testUser = otherUser;
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'own' });
    sameDivision.mockImplementation(async (a, b) => String(a).toUpperCase() === String(b).toUpperCase());
    chain.first.mockResolvedValueOnce({ id: 5, responsible_division_code: 'IMZ', contributing_divisions: '["CPI"]' });
    const res = await request(app)
      .post('/api/reporting/activity-reports')
      .send({ plan_node_id: 5, quarter: 'Q1' });
    expect(res.status).toBe(403);
    sameDivision.mockResolvedValue(false);
  });
});

// ── D-20260818-01: multi-report model ─────────────────────────────────────────
describe('multi-report model (D-20260818-01)', () => {
  it('POST creates a new report even when one exists for the tuple', async () => {
    const res = await request(app).post('/api/reporting/activity-reports')
      .send({ plan_node_id: 5, quarter: 'Q3', fiscal_year: '2026' });
    expect(res.status).toBe(201);
    expect(arService.createReport).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ plan_node_id: 5 }) }),
    );
  });

  it('POST ignores a status passed in the body (no direct-submit)', async () => {
    await request(app).post('/api/reporting/activity-reports')
      .send({ plan_node_id: 5, quarter: 'Q3', status: 'SUBMITTED' });
    const arg = arService.createReport.mock.calls.at(-1)[0];
    expect(arg.data.status).toBeUndefined();
  });

  it('POST no longer emits activity_report.submitted (the submit route owns it)', async () => {
    await request(app).post('/api/reporting/activity-reports')
      .send({ plan_node_id: 5, quarter: 'Q3', status: 'SUBMITTED' });
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('PUT /:id updates by PK via the service', async () => {
    const res = await request(app).put('/api/reporting/activity-reports/11')
      .send({ narrative: 'x' });
    expect(res.status).toBe(200);
    expect(arService.updateReport).toHaveBeenCalledWith(
      expect.objectContaining({ id: 11 }),
    );
  });

  it('PUT /:id forwards isAdmin only for scope=all', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'own' });
    await request(app).put('/api/reporting/activity-reports/11').send({ narrative: 'x' });
    expect(arService.updateReport).toHaveBeenCalledWith(
      expect.objectContaining({ isAdmin: false, userId: ADMIN_USER.id }),
    );
  });

  it('PUT /:id surfaces the service 403 for a non-author', async () => {
    const { ForbiddenError } = require('@rbm/lib/errors');
    arService.updateReport.mockRejectedValueOnce(new ForbiddenError('Only the author can edit this report'));
    const res = await request(app).put('/api/reporting/activity-reports/11').send({ narrative: 'x' });
    expect(res.status).toBe(403);
  });

  it('GET by-activity returns an array with quarter/fy/mine filters', async () => {
    arService.listByActivity.mockResolvedValueOnce([{ id: 2 }, { id: 1 }]);
    const res = await request(app)
      .get('/api/reporting/activity-reports/by-activity/5?quarter=Q3&fiscal_year=2026&mine=1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 2 }, { id: 1 }]);
    expect(arService.listByActivity).toHaveBeenCalledWith(expect.objectContaining({
      planNodeId: 5, quarter: 'Q3', fiscalYear: '2026', mine: true,
    }));
  });

  it('GET list resolves period_id instead of filtering a phantom column', async () => {
    const res = await request(app).get('/api/reporting/activity-reports?period_id=3');
    expect(res.status).toBe(200);
    expect(arService.resolvePeriodFilters).toHaveBeenCalledWith('3');
  });

  it('submit emits activity_report.submitted with the report metadata', async () => {
    chain.update.mockResolvedValueOnce(1);
    chain.first
      .mockResolvedValueOnce(COMPLETE_REPORT)  // gate: load report
      .mockResolvedValueOnce({ c: 1 })         // gate: evidence count
      .mockResolvedValueOnce({ id: 5, plan_node_id: 10, status: 'SUBMITTED', quarter: 'Q3', fiscal_year: '2026' })
      .mockResolvedValueOnce({ id: 10, code: 'ACT-001', title: 'Test', responsible_division_code: 'DCM' });
    const res = await request(app).post('/api/reporting/activity-reports/5/submit');
    expect(res.status).toBe(200);
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'activity_report.submitted',
      metadata: expect.objectContaining({ quarter: 'Q3', fiscalYear: '2026', code: 'ACT-001' }),
    }));
  });
});

// ── GET /api/reporting/indicator-aggregate ────────────────────────────────────
describe('GET /api/reporting/indicator-aggregate (D-20260818-01)', () => {
  it('indicator-aggregate sums APPROVED reports and counts activities once', async () => {
    // A(id 5): approved(10) + approved(5) + draft(99) — the draft must not
    // count. B(id 6): a single SUBMITTED report — counted as "reported"
    // but contributes 0 until approved.
    const specs = [
      { id: 5, code: 'SA.05', title: 'Activity A', responsible_division_code: 'DCM' },
      { id: 6, code: 'SA.06', title: 'Activity B', responsible_division_code: 'DCM' },
    ];
    const reports = [
      { id: 101, plan_node_id: 5, contribution_value: 10, status: 'APPROVED', created_at: '2026-07-03', narrative: 'latest' },
      { id: 102, plan_node_id: 5, contribution_value: 5, status: 'APPROVED', created_at: '2026-07-02' },
      { id: 103, plan_node_id: 5, contribution_value: 99, status: 'DRAFT', created_at: '2026-07-01' },
      { id: 104, plan_node_id: 6, contribution_value: 7, status: 'SUBMITTED', created_at: '2026-07-04' },
    ];
    chain.first.mockResolvedValueOnce({ id: 1, code: 'IND.01', title: 'Indicator 1', tier_id: 2 });
    chain.then
      .mockImplementationOnce((r) => Promise.resolve(specs).then(r))
      .mockImplementationOnce((r) => Promise.resolve(reports).then(r));

    const res = await request(app)
      .get('/api/reporting/indicator-aggregate?indicator_id=1&quarter=Q3&fiscal_year=2026');

    expect(res.status).toBe(200);
    const agg = res.body.data.aggregate;
    expect(agg.total_contribution).toBe(15); // 10 + 5, draft + submitted excluded
    expect(agg.reported_count).toBe(2); // A and B each count once
    const a = agg.activities.find((x) => x.plan_node_id === 5);
    expect(a.report_count).toBe(3);
    expect(a.report_status).toBe('APPROVED'); // best status
    expect(a.contribution_value).toBe(15);
    const b = agg.activities.find((x) => x.plan_node_id === 6);
    expect(b.report_count).toBe(1);
    expect(b.report_status).toBe('SUBMITTED');
    expect(b.contribution_value).toBe(0); // no APPROVED row yet
  });

  it('orders reports newest-first so `latest` is the most recent row', async () => {
    chain.first.mockResolvedValueOnce({ id: 1, code: 'IND.01', title: 'Indicator 1' });
    chain.then
      .mockImplementationOnce((r) => Promise.resolve([
        { id: 5, code: 'SA.05', title: 'A', responsible_division_code: 'DCM' },
      ]).then(r))
      .mockImplementationOnce((r) => Promise.resolve([
        { id: 101, plan_node_id: 5, contribution_value: 4, status: 'APPROVED', narrative: 'newest', created_at: '2026-07-09' },
        { id: 100, plan_node_id: 5, contribution_value: 1, status: 'APPROVED', narrative: 'oldest', created_at: '2026-07-01' },
      ]).then(r));

    const res = await request(app)
      .get('/api/reporting/indicator-aggregate?indicator_id=1&quarter=Q3&fiscal_year=2026');

    expect(res.status).toBe(200);
    expect(chain.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    const a = res.body.data.aggregate.activities[0];
    expect(a.narrative).toBe('newest');
    expect(a.activity_report_id).toBe(101);
    expect(a.contribution_value).toBe(5);
  });

  it('leaves unreported activities at null contribution and null status', async () => {
    chain.first.mockResolvedValueOnce({ id: 1, code: 'IND.01', title: 'Indicator 1' });
    chain.then
      .mockImplementationOnce((r) => Promise.resolve([
        { id: 7, code: 'SA.07', title: 'Unreported', responsible_division_code: 'DCM' },
      ]).then(r))
      .mockImplementationOnce((r) => Promise.resolve([]).then(r));

    const res = await request(app)
      .get('/api/reporting/indicator-aggregate?indicator_id=1&quarter=Q3&fiscal_year=2026');

    expect(res.status).toBe(200);
    const agg = res.body.data.aggregate;
    expect(agg.total_contribution).toBe(0);
    expect(agg.reported_count).toBe(0);
    expect(agg.unreported_count).toBe(1);
    expect(agg.activities[0]).toEqual(expect.objectContaining({
      has_report: false, report_count: 0, contribution_value: null, report_status: null,
    }));
  });
});

// ── POST /api/reporting/activity-reports/:id/not-applicable ───────────────────
describe('POST /api/reporting/activity-reports/:id/not-applicable', () => {
  it('should resolve admin recipients through the roles join (not user_roles.role)', async () => {
    // LIVE BUG fix: user_roles has role_id (FK → roles.id); `whereIn('role', …)`
    // referenced a column that does not exist and 500'd at runtime.
    const { ROLES } = require('@rbm/lib/roles');
    chain.first
      .mockResolvedValueOnce({ id: 7, code: 'ACT-9', title: 'Spec' }) // plan node
      .mockResolvedValueOnce(undefined) // no open reporting period
      .mockResolvedValueOnce(undefined) // no existing NOT_APPLICABLE row
      .mockResolvedValueOnce({ id: 21, plan_node_id: 7, status: 'NOT_APPLICABLE' }); // created
    chain.insert.mockResolvedValueOnce([21]);
    chain.then.mockImplementationOnce((r) => Promise.resolve([{ id: 2 }, { id: 3 }]).then(r));
    const res = await request(app)
      .post('/api/reporting/activity-reports/7/not-applicable')
      .send({ reason: 'Not our division' });
    expect(res.status).toBe(200);
    expect(chain.join).toHaveBeenCalledWith('roles', 'roles.id', 'user_roles.role_id');
    expect(chain.whereIn).toHaveBeenCalledWith(
      'roles.code', [ROLES.SYSTEM_ADMIN, ROLES.RBM_ADMIN],
    );
    expect(chain.whereIn).not.toHaveBeenCalledWith('role', expect.anything());
    // notifications actually inserted for the resolved admins
    const notifInsert = chain.insert.mock.calls.find((c) => Array.isArray(c[0]) && c[0][0]?.user_id);
    expect(notifInsert[0]).toHaveLength(2);
  });

  it('should scope the existing-row lookup to the NOT_APPLICABLE status', async () => {
    // Without the status filter this could hijack a member's real report now
    // that multiple reports share a (activity, quarter, FY) tuple.
    chain.first
      .mockResolvedValueOnce({ id: 7, code: 'ACT-9', title: 'Spec' })
      .mockResolvedValueOnce(undefined) // no open reporting period
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 21, plan_node_id: 7, status: 'NOT_APPLICABLE' });
    chain.insert.mockResolvedValueOnce([21]);
    await request(app)
      .post('/api/reporting/activity-reports/7/not-applicable')
      .send({ reason: 'Not our division' });
    expect(chain.where).toHaveBeenCalledWith(
      expect.objectContaining({ plan_node_id: 7, status: 'NOT_APPLICABLE' }),
    );
  });

  // D-20261013-01: the wall clock filed flags made in the Q3 window under Q4.
  it('should file the flag under the OPEN reporting period and the activity year', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 7, code: 'ACT-9', title: 'Spec', fiscal_year: '2026' })
      .mockResolvedValueOnce({ quarter: 'Q3' }) // open period
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 21, plan_node_id: 7, status: 'NOT_APPLICABLE' });
    chain.insert.mockResolvedValueOnce([21]);
    await request(app)
      .post('/api/reporting/activity-reports/7/not-applicable')
      .send({ reason: 'Not our division' });
    const row = chain.insert.mock.calls.find((c) => c[0] && c[0].plan_node_id === 7)[0];
    expect(row).toEqual(expect.objectContaining({ quarter: 'Q3', fiscal_year: '2026' }));
  });

  it('should honour a valid quarter sent by the client', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 7, code: 'ACT-9', title: 'Spec', fiscal_year: '2026' })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 21, plan_node_id: 7, status: 'NOT_APPLICABLE' });
    chain.insert.mockResolvedValueOnce([21]);
    await request(app)
      .post('/api/reporting/activity-reports/7/not-applicable')
      .send({ reason: 'Not our division', quarter: 'q2' });
    const row = chain.insert.mock.calls.find((c) => c[0] && c[0].plan_node_id === 7)[0];
    expect(row.quarter).toBe('Q2');
  });

  it('should return 400 when the reason is missing', async () => {
    const res = await request(app)
      .post('/api/reporting/activity-reports/7/not-applicable')
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── POST /api/reporting/activity-reports/:id/dismiss-dispute ──────────────────
describe('POST /api/reporting/activity-reports/:id/dismiss-dispute', () => {
  // D-20260818-01: dismissing used to POST a DRAFT and rely on the upsert to
  // flip the NA row. POST is create-only now, so the dedicated endpoint
  // DELETEs the NOT_APPLICABLE rows instead.
  it('should delete every NOT_APPLICABLE row for the activity (all quarters)', async () => {
    const { STATUSES } = require('@rbm/lib/enums');
    chain.first.mockResolvedValueOnce({ id: 7, code: 'ACT-9', title: 'Spec' }); // plan node
    chain.del.mockResolvedValueOnce(2);
    const res = await request(app).post('/api/reporting/activity-reports/7/dismiss-dispute');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { deleted: 2 } });
    expect(chain.del).toHaveBeenCalled();
    expect(chain.where).toHaveBeenCalledWith({
      plan_node_id: 7, status: STATUSES.NOT_APPLICABLE,
    });
    // NA verdicts die with the dispute across every period — no quarter filter.
    expect(chain.where).not.toHaveBeenCalledWith(expect.objectContaining({ quarter: expect.anything() }));
  });

  it('should return 403 when the approve scope is not "all"', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'own' });
    const res = await request(app).post('/api/reporting/activity-reports/7/dismiss-dispute');
    expect(res.status).toBe(403);
    expect(chain.del).not.toHaveBeenCalled();
  });

  it('should return 403 when the user lacks the approve permission', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const res = await request(app).post('/api/reporting/activity-reports/7/dismiss-dispute');
    expect(res.status).toBe(403);
  });

  it('should return 404 when the activity does not exist', async () => {
    chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app).post('/api/reporting/activity-reports/999/dismiss-dispute');
    expect(res.status).toBe(404);
    expect(chain.del).not.toHaveBeenCalled();
  });

  it('should return 400 on a non-numeric activity id', async () => {
    const res = await request(app).post('/api/reporting/activity-reports/abc/dismiss-dispute');
    expect(res.status).toBe(400);
  });

  it('should audit the dismissal with the deleted count', async () => {
    const { audit } = require('../../src/middleware/auditLog');
    chain.first.mockResolvedValueOnce({ id: 7, code: 'ACT-9', title: 'Spec' });
    chain.del.mockResolvedValueOnce(1);
    await request(app).post('/api/reporting/activity-reports/7/dismiss-dispute');
    expect(audit).toHaveBeenCalledWith(
      expect.anything(), 'OWNERSHIP_DISPUTE_DISMISSED', 'plan_node', 7, { deleted: 1 },
    );
  });
});

// ── POST /api/reporting/activity-reports/:id/submit ───────────────────────────
describe('POST /api/reporting/activity-reports/:id/submit', () => {
  // D-20261108-02: only the author (or an admin) submits, and only a draft or a rejected report.
  it('should refuse a user who is neither the author nor an admin (403)', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'own' });
    chain.first.mockResolvedValueOnce({ ...COMPLETE_REPORT, user_id: 999 });
    const res = await request(app).post('/api/reporting/activity-reports/5/submit');
    expect(res.status).toBe(403);
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('should refuse to send an approved report back to review, even for an admin (400)', async () => {
    chain.first.mockResolvedValueOnce({ ...COMPLETE_REPORT, status: 'APPROVED' });
    const res = await request(app).post('/api/reporting/activity-reports/5/submit');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/draft or rejected/);
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('should submit the report and return updated row', async () => {
    const updated = { id: 5, plan_node_id: 10, status: 'SUBMITTED' };
    chain.update.mockResolvedValueOnce(1);
    chain.first
      .mockResolvedValueOnce(COMPLETE_REPORT)  // gate: load report
      .mockResolvedValueOnce({ c: 1 })         // gate: evidence count
      .mockResolvedValueOnce(updated);         // re-fetch
    const res = await request(app).post('/api/reporting/activity-reports/5/submit');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');
  });

  // D-20260818-01 (required-fields gate): a report may be saved as DRAFT
  // freely, but submitting demands the minimal set below + ≥1 evidence file.
  it('should submit when every required field is present and one evidence file exists', async () => {
    chain.update.mockResolvedValueOnce(1);
    chain.first
      .mockResolvedValueOnce(COMPLETE_REPORT)          // gate: load report
      .mockResolvedValueOnce({ c: 1 })                 // gate: evidence count
      .mockResolvedValueOnce({ ...COMPLETE_REPORT, status: 'SUBMITTED' }); // re-fetch
    const res = await request(app).post('/api/reporting/activity-reports/5/submit');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');
    expect(workflowEngine.startWorkflow).toHaveBeenCalled();
  });

  it('should return 404 when the report to submit does not exist', async () => {
    chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app).post('/api/reporting/activity-reports/999/submit');
    expect(res.status).toBe(404);
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('should refuse submission and list every missing field', async () => {
    chain.first
      .mockResolvedValueOnce({ ...COMPLETE_REPORT, narrative: null }) // gate: load report
      .mockResolvedValueOnce({ c: 0 });                               // gate: no evidence
    const res = await request(app).post('/api/reporting/activity-reports/5/submit');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.message).toContain('narrative');
    expect(res.body.message).toContain('verification file');
    // Nothing must have moved: no status flip, no workflow, no notification.
    const flip = chain.update.mock.calls.find((c) => c[0] && c[0].status === 'SUBMITTED');
    expect(flip).toBeFalsy();
    expect(workflowEngine.startWorkflow).not.toHaveBeenCalled();
    expect(contribEngine.startContributorWorkflow).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('should treat actual_spend = 0 as provided (only NULL is missing)', async () => {
    chain.update.mockResolvedValueOnce(1);
    chain.first
      .mockResolvedValueOnce({ ...COMPLETE_REPORT, actual_spend: 0 })
      .mockResolvedValueOnce({ c: 2 })
      .mockResolvedValueOnce({ ...COMPLETE_REPORT, actual_spend: 0, status: 'SUBMITTED' });
    const res = await request(app).post('/api/reporting/activity-reports/5/submit');
    expect(res.status).toBe(200);
  });

  it('should count evidence rows scoped to this report', async () => {
    chain.update.mockResolvedValueOnce(1);
    chain.first
      .mockResolvedValueOnce(COMPLETE_REPORT)
      .mockResolvedValueOnce({ c: 1 })
      .mockResolvedValueOnce({ ...COMPLETE_REPORT, status: 'SUBMITTED' });
    await request(app).post('/api/reporting/activity-reports/5/submit');
    expect(chain.where).toHaveBeenCalledWith({ parent_type: 'activity_report', parent_id: 5 });
  });

  it('should start contrib workflow when isContribFlow is true', async () => {
    const updated = { id: 5, plan_node_id: 10, status: 'SUBMITTED' };
    chain.update.mockResolvedValueOnce(1);
    chain.first
      .mockResolvedValueOnce(COMPLETE_REPORT)
      .mockResolvedValueOnce({ c: 1 })
      .mockResolvedValueOnce(updated);
    contribFlow.deriveContribFlowForActivityReport.mockResolvedValueOnce({
      isContribFlow: true, contribOrgCode: 'WHC', mainOrgCode: 'DCM',
    });
    const res = await request(app).post('/api/reporting/activity-reports/5/submit');
    expect(res.status).toBe(200);
    expect(contribEngine.startContributorWorkflow).toHaveBeenCalled();
  });

  // Regression: entityType must be the canonical APPROVAL_ENTITIES.ACTIVITY_REPORT,
  // not the undefined ENTITY_TYPES.ACTIVITY_REPORT (that key lives in APPROVAL_ENTITIES).
  // Undefined silently broke CONTRIBUTOR_CHAIN template resolution for activity reports.
  it('should pass a defined APPROVAL_ENTITIES.ACTIVITY_REPORT entityType to the engine', async () => {
    const { APPROVAL_ENTITIES } = require('@rbm/lib/enums');
    chain.update.mockResolvedValueOnce(1);
    chain.first
      .mockResolvedValueOnce(COMPLETE_REPORT)
      .mockResolvedValueOnce({ c: 1 })
      .mockResolvedValueOnce({ id: 5, plan_node_id: 10, status: 'SUBMITTED' });
    contribFlow.deriveContribFlowForActivityReport.mockResolvedValueOnce({
      isContribFlow: true, contribOrgCode: 'WHC', mainOrgCode: 'DCM',
    });
    await request(app).post('/api/reporting/activity-reports/5/submit');
    const arg = contribEngine.startContributorWorkflow.mock.calls[0][0];
    expect(arg.entityType).toBeDefined();
    expect(arg.entityType).toBe(APPROVAL_ENTITIES.ACTIVITY_REPORT);
  });
});

// ── POST /api/reporting/activity-reports/:id/approve ──────────────────────────
describe('POST /api/reporting/activity-reports/:id/approve', () => {
  it('should return 404 when report not found', async () => {
    chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app).post('/api/reporting/activity-reports/999/approve');
    expect(res.status).toBe(404);
  });

  it('should return 403 when user lacks approve permission', async () => {
    chain.first
      .mockResolvedValueOnce({ id: 5, plan_node_id: 10 })
      .mockResolvedValueOnce({ id: 10, responsible_division_code: 'DCM' });
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const res = await request(app).post('/api/reporting/activity-reports/5/approve');
    expect(res.status).toBe(403);
  });

  it('should approve report and return updated row', async () => {
    const report = { id: 5, plan_node_id: 10, status: 'SUBMITTED', user_id: 8 };
    const node = { id: 10, responsible_division_code: 'DCM', code: 'ACT-001', title: 'Test' };
    chain.first
      .mockResolvedValueOnce(report)   // existing
      .mockResolvedValueOnce(node)     // plan node for division check
      .mockResolvedValueOnce({ ...report, status: 'APPROVED' }) // re-fetch after update
      .mockResolvedValueOnce(node);    // node for emitEvent
    chain.update.mockResolvedValueOnce(1);
    const res = await request(app).post('/api/reporting/activity-reports/5/approve');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APPROVED');
    // Outcome to the author and the business unit (D-20261015-01).
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'activity_report.approved',
      entity: expect.objectContaining({ owner_user_id: 8, main_division_code: 'DCM' }),
      metadata: expect.objectContaining({ decision: 'APPROVED', division: 'DCM', reportUrl: expect.stringMatching(/\/activity-report\/10\/report\/5$/) }),
    }));
  });

  it('should clear any stale rejection_reason when approving', async () => {
    const report = { id: 5, plan_node_id: 10, status: 'REJECTED', rejection_reason: 'old reason' };
    const node = { id: 10, responsible_division_code: 'DCM', code: 'ACT-001', title: 'Test' };
    chain.first
      .mockResolvedValueOnce(report)
      .mockResolvedValueOnce(node)
      .mockResolvedValueOnce({ ...report, status: 'APPROVED', rejection_reason: null })
      .mockResolvedValueOnce(node);
    chain.update.mockResolvedValueOnce(1);
    const res = await request(app).post('/api/reporting/activity-reports/5/approve');
    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'APPROVED', rejection_reason: null }),
    );
  });
});

// ── POST /api/reporting/activity-reports/:id/reject ───────────────────────────
describe('POST /api/reporting/activity-reports/:id/reject', () => {
  it('should return 404 when report not found', async () => {
    chain.first.mockResolvedValueOnce(undefined);
    const res = await request(app)
      .post('/api/reporting/activity-reports/999/reject')
      .send({ reason: 'Data incorrect' });
    expect(res.status).toBe(404);
  });

  it('should return 400 when reason is missing', async () => {
    const res = await request(app).post('/api/reporting/activity-reports/5/reject');
    expect(res.status).toBe(400);
  });

  it('should return 400 when reason is blank', async () => {
    const res = await request(app)
      .post('/api/reporting/activity-reports/5/reject')
      .send({ reason: '   ' });
    expect(res.status).toBe(400);
  });

  it('should reject report with reason', async () => {
    const report = { id: 5, plan_node_id: 10, user_id: 3, status: 'SUBMITTED' };
    const node = { id: 10, responsible_division_code: 'DCM', code: 'ACT-001', title: 'Test' };
    chain.first
      .mockResolvedValueOnce(report)
      .mockResolvedValueOnce(node)
      .mockResolvedValueOnce({ ...report, status: 'REJECTED' })
      .mockResolvedValueOnce(node);
    chain.update.mockResolvedValueOnce(1);
    const res = await request(app)
      .post('/api/reporting/activity-reports/5/reject')
      .send({ reason: 'Data incorrect' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJECTED');
  });

  it('should store the trimmed reason and clear approval stamps', async () => {
    const report = { id: 5, plan_node_id: 10, user_id: 3, status: 'APPROVED', approved_by: 9 };
    const node = { id: 10, responsible_division_code: 'DCM', code: 'ACT-001', title: 'Test' };
    chain.first
      .mockResolvedValueOnce(report)
      .mockResolvedValueOnce(node)
      .mockResolvedValueOnce({ ...report, status: 'REJECTED', approved_by: null })
      .mockResolvedValueOnce(node);
    chain.update.mockResolvedValueOnce(1);
    const res = await request(app)
      .post('/api/reporting/activity-reports/5/reject')
      .send({ reason: '  Wrong numbers  ' });
    expect(res.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'REJECTED',
        rejection_reason: 'Wrong numbers',
        approved_by: null,
        approved_at: null,
      }),
    );
  });
});

// ── D-20260817-02: template-driven submit + engine-first decisions ────────────
describe('workflow-engine wiring (D-20260817-02)', () => {
  it('owner submit starts the DEFAULT workflow with the main division', async () => {
    chain.update.mockResolvedValueOnce(1);
    chain.first
      .mockResolvedValueOnce(COMPLETE_REPORT)
      .mockResolvedValueOnce({ c: 1 })
      .mockResolvedValueOnce({ id: 5, plan_node_id: 10, status: 'SUBMITTED' });
    contribFlow.deriveContribFlowForActivityReport.mockResolvedValueOnce({
      isContribFlow: false, contribOrgCode: null, mainOrgCode: 'DCM',
    });
    const res = await request(app).post('/api/reporting/activity-reports/5/submit');
    expect(res.status).toBe(200);
    expect(workflowEngine.startWorkflow).toHaveBeenCalledWith(expect.objectContaining({
      entityId: 5, divisionCode: 'DCM',
    }));
    expect(contribEngine.startContributorWorkflow).not.toHaveBeenCalled();
  });

  it('submit degrades to the flat stamp when the template is toggled off', async () => {
    chain.update.mockResolvedValueOnce(1);
    chain.first
      .mockResolvedValueOnce(COMPLETE_REPORT)
      .mockResolvedValueOnce({ c: 1 })
      .mockResolvedValueOnce({ id: 5, plan_node_id: 10, status: 'SUBMITTED' });
    contribFlow.deriveContribFlowForActivityReport.mockResolvedValueOnce({
      isContribFlow: false, contribOrgCode: null, mainOrgCode: 'DCM',
    });
    workflowEngine.startWorkflow.mockRejectedValueOnce(
      Object.assign(new Error('no template'), { code: 'TEMPLATE_NOT_FOUND' }));
    const res = await request(app).post('/api/reporting/activity-reports/5/submit');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');
  });

  it('approve skips the direct update when the engine handled the step', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    scopeCoversDivision.mockResolvedValueOnce(true);
    workflowDecisions.decideEntityStep.mockResolvedValueOnce({ handled: true });
    chain.first
      .mockResolvedValueOnce({ id: 5, plan_node_id: 10, status: 'SUBMITTED' }) // existing
      .mockResolvedValueOnce({ id: 10, responsible_division_code: 'DCM' }) // node
      .mockResolvedValueOnce({ id: 5, plan_node_id: 10, status: 'IN_REVIEW' }); // read-back mid-chain
    const res = await request(app).post('/api/reporting/activity-reports/5/approve');
    expect(res.status).toBe(200);
    const directApprove = chain.update.mock.calls.find((c) => c[0] && c[0].status === 'APPROVED');
    expect(directApprove).toBeFalsy();
    // mid-chain (IN_REVIEW): the terminal APPROVED notification must NOT fire
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('reject routes the reason through the engine as the step comment', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    scopeCoversDivision.mockResolvedValueOnce(true);
    workflowDecisions.decideEntityStep.mockResolvedValueOnce({ handled: true });
    chain.first
      .mockResolvedValueOnce({ id: 5, plan_node_id: 10, status: 'SUBMITTED' })
      .mockResolvedValueOnce({ id: 10, responsible_division_code: 'DCM' })
      .mockResolvedValueOnce({ id: 5, plan_node_id: 10, status: 'REJECTED', rejection_reason: 'incomplete' })
      .mockResolvedValueOnce({ id: 10, responsible_division_code: 'DCM' }); // node for emitEvent
    const res = await request(app)
      .post('/api/reporting/activity-reports/5/reject')
      .send({ reason: 'incomplete' });
    expect(res.status).toBe(200);
    expect(workflowDecisions.decideEntityStep).toHaveBeenCalledWith(expect.objectContaining({
      decision: 'REJECTED', comment: 'incomplete',
    }));
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'activity_report.rejected',
      entity: expect.objectContaining({ main_division_code: 'DCM' }),
      metadata: expect.objectContaining({ decision: 'REJECTED', reason: 'incomplete' }),
    }));
  });
});

// ── DELETE /activity-reports/:id (D-20261013-04) ─────────────────────────────
describe('DELETE /api/reporting/activity-reports/:id', () => {
  const { audit } = require('../../src/middleware/auditLog');

  it('should delete the draft, audit it and answer the success envelope', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'own' });
    const res = await request(app).delete('/api/reporting/activity-reports/11');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { id: 11 } });
    expect(arService.deleteDraft).toHaveBeenCalledWith({ id: 11, userId: ADMIN_USER.id, isAdmin: false });
    expect(audit).toHaveBeenCalledWith(expect.anything(), 'ACTIVITY_REPORT_DRAFT_DELETED', 'activity_report', 11, expect.any(Object));
  });

  it('should pass isAdmin for scope all', async () => {
    await request(app).delete('/api/reporting/activity-reports/11');
    expect(arService.deleteDraft).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: true }));
  });

  it('should surface the service 400 for a submitted report', async () => {
    const { ValidationError } = require('@rbm/lib/errors');
    arService.deleteDraft.mockRejectedValueOnce(new ValidationError('Only a draft can be deleted'));
    const res = await request(app).delete('/api/reporting/activity-reports/11');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, message: 'Only a draft can be deleted' });
  });

  it('should return 400 on a non-numeric id', async () => {
    const res = await request(app).delete('/api/reporting/activity-reports/abc');
    expect(res.status).toBe(400);
    expect(arService.deleteDraft).not.toHaveBeenCalled();
  });
});

// ── "Not started yet" (D-20261013-08) ────────────────────────────────────────
describe('POST /activity-reports/:id/submit — activity not started yet', () => {
  const NOT_STARTED = Object.freeze({
    id: 5, plan_node_id: 10, status: 'DRAFT', quarter: 'Q3', fiscal_year: '2026',
    not_started: 1, expected_start_quarter: 'Q4', expected_start_year: '2026',
  });

  it('should submit with the expected start only: no dates, narrative or verification file', async () => {
    chain.update.mockResolvedValueOnce(1);
    chain.first
      .mockResolvedValueOnce(NOT_STARTED)                        // gate: load report
      .mockResolvedValueOnce({ c: 0 })                           // gate: no evidence
      .mockResolvedValueOnce({ ...NOT_STARTED, status: 'SUBMITTED' }); // re-fetch
    const res = await request(app).post('/api/reporting/activity-reports/5/submit');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUBMITTED');
  });

  it('should refuse without an expected start quarter', async () => {
    chain.first
      .mockResolvedValueOnce({ ...NOT_STARTED, expected_start_quarter: null })
      .mockResolvedValueOnce({ c: 0 });
    const res = await request(app).post('/api/reporting/activity-reports/5/submit');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('expected start quarter');
  });

  it('should refuse an expected start that is not after the reported quarter', async () => {
    chain.first
      .mockResolvedValueOnce({ ...NOT_STARTED, expected_start_quarter: 'Q3' })
      .mockResolvedValueOnce({ c: 0 });
    const res = await request(app).post('/api/reporting/activity-reports/5/submit');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('after Q3 2026');
  });

  it('should accept a start in the next fiscal year', async () => {
    chain.update.mockResolvedValueOnce(1);
    chain.first
      .mockResolvedValueOnce({ ...NOT_STARTED, quarter: 'Q4', expected_start_quarter: 'Q1', expected_start_year: '2027' })
      .mockResolvedValueOnce({ c: 0 })
      .mockResolvedValueOnce({ ...NOT_STARTED, status: 'SUBMITTED' });
    const res = await request(app).post('/api/reporting/activity-reports/5/submit');
    expect(res.status).toBe(200);
  });
});
