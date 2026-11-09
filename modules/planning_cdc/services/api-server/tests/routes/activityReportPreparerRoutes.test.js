// ── POST /api/reporting/activity-reports/:id/preparer (D-20261013-03) ──
//
// Administrators and M&E officers (activity_report:approve at scope `all`)
// change who prepared a report; the change is audited.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, email: 'admin@africacdc.org' };
    next();
  },
}));

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: true, denies: [] }),
}));

jest.mock('../../src/services/eventBusService', () => ({
  emitEvent: jest.fn().mockResolvedValue({ matched: 2, recipients: [5, 7] }),
}));

jest.mock('../../src/services/reporting/activityReportPreparerService', () => ({
  changePreparer: jest.fn(),
  listChanges: jest.fn(),
  listCandidates: jest.fn(),
  REASON_MAX: 1000,
}));

const request = require('supertest');
const { ValidationError } = require('@rbm/lib/errors');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const rbacService = require('../../src/services/rbacService');
const { audit } = require('../../src/middleware/auditLog');
const preparerService = require('../../src/services/reporting/activityReportPreparerService');
const { emitEvent } = require('../../src/services/eventBusService');
const app = require('../../src/app');

const URL = '/api/reporting/activity-reports/12/preparer';

beforeEach(() => {
  jest.clearAllMocks();
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  preparerService.changePreparer.mockResolvedValue({
    report: { id: 12, user_id: 7, plan_node_id: 4, quarter: 'Q3', fiscal_year: '2026' },
    change: { from_user_id: 5, to_user_id: 7, reason: 'Jane wrote it' },
  });
  preparerService.listChanges.mockResolvedValue([{ id: 1, from_name: 'A', to_name: 'Jane', reason: 'Jane wrote it' }]);
});

describe('POST /api/reporting/activity-reports/:id/preparer', () => {
  it('should change the preparer, audit it and return the history', async () => {
    const res = await request(app).post(URL).send({ user_id: '7', reason: 'Jane wrote it' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { changes: [expect.objectContaining({ to_name: 'Jane' })] } });
    expect(rbacService.checkPermission).toHaveBeenCalledWith(1, RBAC_MODULES.ACTIVITY_REPORT, RBAC_ACTIONS.APPROVE);
    expect(preparerService.changePreparer).toHaveBeenCalledWith({ reportId: 12, toUserId: 7, reason: 'Jane wrote it', actorId: 1 });
    expect(audit).toHaveBeenCalledWith(expect.anything(), 'ACTIVITY_REPORT_PREPARER_CHANGED', 'activity_report', 12,
      expect.objectContaining({ from_user_id: 5, to_user_id: 7 }));
  });

  it('should notify the new and the previous preparer (D-20261013-07)', async () => {
    await request(app).post(URL).send({ user_id: 7, reason: 'Jane wrote it' });
    await new Promise(setImmediate);
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'activity_report.preparer_changed',
      entity: expect.objectContaining({ id: 12, owner_user_id: 7, previous_owner_user_id: 5 }),
      metadata: expect.objectContaining({ reason: 'Jane wrote it', toName: 'Jane', reportUrl: expect.stringMatching(/\/activity-report\/4\/report\/12$/) }),
    }));
  });

  it('should not notify when the change is refused', async () => {
    preparerService.changePreparer.mockRejectedValueOnce(new ValidationError('A reason is required to change who prepared the report'));
    await request(app).post(URL).send({ user_id: 7 });
    await new Promise(setImmediate);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('should return 403 when the approve scope is not "all"', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'own' });
    const res = await request(app).post(URL).send({ user_id: 7, reason: 'x' });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false });
    expect(preparerService.changePreparer).not.toHaveBeenCalled();
  });

  it('should return 403 without the permission', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const res = await request(app).post(URL).send({ user_id: 7, reason: 'x' });
    expect(res.status).toBe(403);
  });

  it('should return 400 with the service message on invalid input', async () => {
    preparerService.changePreparer.mockRejectedValueOnce(new ValidationError('A reason is required to change who prepared the report'));
    const res = await request(app).post(URL).send({ user_id: 7 });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, message: 'A reason is required to change who prepared the report' });
    expect(audit).not.toHaveBeenCalled();
  });

  it('should return 400 on a non-numeric report id', async () => {
    const res = await request(app).post('/api/reporting/activity-reports/abc/preparer').send({ user_id: 7, reason: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/reporting/activity-report-preparers', () => {
  it('should list active users for administrators and M&E', async () => {
    preparerService.listCandidates.mockResolvedValueOnce([{ id: 7, name: 'Jane', email: 'j@x.org' }]);
    const res = await request(app).get('/api/reporting/activity-report-preparers');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ id: 7, name: 'Jane', email: 'j@x.org' }] });
  });

  it('should return 403 for a division-scoped user', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: true, scope: 'own' });
    const res = await request(app).get('/api/reporting/activity-report-preparers');
    expect(res.status).toBe(403);
    expect(preparerService.listCandidates).not.toHaveBeenCalled();
  });
});
