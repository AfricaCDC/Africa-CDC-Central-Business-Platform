/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── meRoutes integration tests ──
//
// Covers: GET /api/me/tasks, GET /api/me/divisions

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = global.__testUser || { id: 1, email: 'admin@africacdc.org', division_code: 'DCM' };
    next();
  },
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

jest.mock('@rbm/lib/user-divisions', () => ({
  ...jest.requireActual('@rbm/lib/user-divisions'),
  getUserDivisionCodes: jest.fn().mockResolvedValue([]),
}));

// Mock taskBuilders so we control what tasks are returned
jest.mock('../../src/routes/me/taskBuilders', () => ({
  fetchPendingSpecificActivities: jest.fn().mockResolvedValue([]),
  buildSaReviewTask: jest.fn().mockReturnValue(null),
  buildReportReviewTask: jest.fn().mockResolvedValue(null),
  buildOwnershipDisputesTask: jest.fn().mockResolvedValue(null),
  buildSaRejectedTasks: jest.fn().mockResolvedValue([]),
  buildNotificationTasks: jest.fn().mockResolvedValue([]),
  sortTasks: jest.fn(),
}));

// Mock divisionBuilders
jest.mock('../../src/routes/me/divisionBuilders', () => ({
  buildReasonMap: jest.fn().mockResolvedValue({ reasons: new Map(), junctionData: new Map() }),
  fetchDivisionRows: jest.fn().mockResolvedValue([]),
  hydrateDivisionRow: jest.fn().mockResolvedValue({}),
  sortDivisions: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const rbacService = require('../../src/services/rbacService');
const tasks = require('../../src/routes/me/taskBuilders');
const divisions = require('../../src/routes/me/divisionBuilders');
const { getUserDivisionCodes } = require('@rbm/lib/user-divisions');
const chain = sharedDb.__chain;

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.del.mockReset().mockResolvedValue(1);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'orderBy', 'leftJoin'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
}

const ADMIN_USER = { id: 1, email: 'admin@africacdc.org', division_code: 'DCM' };

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  global.__testUser = ADMIN_USER;
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  getUserDivisionCodes.mockResolvedValue([]);
  tasks.fetchPendingSpecificActivities.mockResolvedValue([]);
  tasks.buildSaReviewTask.mockReturnValue(null);
  tasks.buildReportReviewTask.mockResolvedValue(null);
  tasks.buildOwnershipDisputesTask.mockResolvedValue(null);
  tasks.buildSaRejectedTasks.mockResolvedValue([]);
  tasks.buildNotificationTasks.mockResolvedValue([]);
  divisions.buildReasonMap.mockResolvedValue({ reasons: new Map(), junctionData: new Map() });
  divisions.fetchDivisionRows.mockResolvedValue([]);
  divisions.hydrateDivisionRow.mockResolvedValue({});
});

afterEach(() => {
  global.__testUser = null;
});

// ── GET /api/me/tasks ─────────────────────────────────────────────────────────
describe('GET /api/me/tasks', () => {
  it('should return empty tasks list for user with no queues', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    // getResponsibleDivisions returns empty
    getUserDivisionCodes.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/me/tasks');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.tasks)).toBe(true);
    expect(res.body.data.total).toBe(0);
  });

  it('should include ownership disputes when user has scope=all', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'all' });
    getUserDivisionCodes.mockResolvedValueOnce([]);
    tasks.buildOwnershipDisputesTask.mockResolvedValueOnce({ type: 'ownership_dispute', count: 3 });

    const res = await request(app).get('/api/me/tasks');
    expect(res.status).toBe(200);
    expect(res.body.data.tasks).toEqual([{ type: 'ownership_dispute', count: 3 }]);
  });

  it('should include the reports waiting for the user, without any responsible unit', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    tasks.buildReportReviewTask.mockResolvedValueOnce({ type: 'report_review', count: 4 });

    const res = await request(app).get('/api/me/tasks');
    expect(res.body.data.tasks).toEqual([{ type: 'report_review', count: 4 }]);
    expect(tasks.buildReportReviewTask).toHaveBeenCalledWith(ADMIN_USER.id);
  });

  it('should include review queue tasks for HOD with responsible divisions', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: 'division' });
    getUserDivisionCodes.mockResolvedValueOnce(['DCM']);
    tasks.buildSaReviewTask.mockReturnValueOnce({ type: 'SA_REVIEW', count: 2 });
    tasks.fetchPendingSpecificActivities.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    const res = await request(app).get('/api/me/tasks');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should include notification tasks', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    tasks.buildNotificationTasks.mockResolvedValueOnce([{ type: 'NOTIFICATION', count: 1 }]);

    const res = await request(app).get('/api/me/tasks');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
  });

  it('should include rejected tasks for user', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    tasks.buildSaRejectedTasks.mockResolvedValueOnce([{ type: 'SA_REJECTED', count: 1 }]);

    const res = await request(app).get('/api/me/tasks');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
  });
});

// ── GET /api/me/divisions ─────────────────────────────────────────────────────
describe('GET /api/me/divisions', () => {
  it('should return empty divisions when user has no assignments', async () => {
    divisions.buildReasonMap.mockResolvedValueOnce({ reasons: new Map(), junctionData: new Map() });
    const res = await request(app).get('/api/me/divisions');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.divisions).toEqual([]);
    expect(res.body.data.directorates).toEqual([]);
  });

  it('should return hydrated divisions for user', async () => {
    const reasons = new Map([['DCM', ['FOCAL_PERSON']], ['WHC', ['HEAD_OF_DIVISION']]]);
    const junctionData = new Map();
    divisions.buildReasonMap.mockResolvedValueOnce({ reasons, junctionData });
    divisions.fetchDivisionRows.mockResolvedValueOnce([
      { code: 'DCM', division_name: 'Disease Control' },
      { code: 'WHC', division_name: 'Women Health' },
    ]);
    divisions.hydrateDivisionRow
      .mockResolvedValueOnce({ code: 'DCM', name: 'Disease Control' })
      .mockResolvedValueOnce({ code: 'WHC', name: 'Women Health' });
    const { getDirectoratesForUser } = require('../../src/services/divisionAliasService');
    getDirectoratesForUser.mockResolvedValueOnce(['DIR-DCPH']);

    const res = await request(app).get('/api/me/divisions');
    expect(res.status).toBe(200);
    expect(res.body.data.divisions.length).toBe(2);
    expect(res.body.data.directorates).toContain('DIR-DCPH');
  });
});