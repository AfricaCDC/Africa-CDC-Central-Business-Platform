// ── /api/budget-execution (D-20261015-04) ──
//
// Read is scope-filtered; import / link / delete need scope `all`.
// Services are mocked: no DB, no file system.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, email: 'me@africacdc.org' };
    next();
  },
}));
jest.mock('../../src/middleware/auditLog', () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: false, denies: [] }),
}));
jest.mock('../../src/services/budgetExecution/budgetExecutionQuery', () => {
  const actual = jest.requireActual('../../src/services/budgetExecution/budgetExecutionQuery');
  return { ...actual, resolveImport: jest.fn(), activityExecution: jest.fn(), activityDetail: jest.fn() };
});
jest.mock('../../src/services/budgetExecution/budgetExecutionImports', () => ({
  importExport: jest.fn(), listImports: jest.fn(), deleteImport: jest.fn(),
}));
jest.mock('../../src/services/budgetExecution/budgetExecutionLinks', () => ({ unlinkedFundCenters: jest.fn(), linkFundCenter: jest.fn() }));
jest.mock('../../src/services/divisionAliasService', () => ({
  ...jest.requireActual('../../src/services/divisionAliasService'),
  getDirectorateChildren: jest.fn(async (code) => (code === 'APPM' ? ['APPM', 'CHSISD'] : [code])),
}));
jest.mock('../../src/services/budgetExecution/budgetExecutionScope', () => ({
  allowedDivisions: jest.fn(),
  effectiveDivisions: jest.requireActual('../../src/services/budgetExecution/budgetExecutionScope').effectiveDivisions,
}));
jest.mock('../../src/services/budgetExecution/budgetExecutionNotices', () => ({ notifyDivisions: jest.fn() }));
jest.mock('../../src/services/budgetExecution/budgetImportReminder', () => ({ importStatus: jest.fn(), notifyImportDone: jest.fn() }));
jest.mock('../../src/services/budgetExecution/budgetVariance', () => ({
  varianceRules: jest.fn(async () => ({ expectedPct: 75 })),
  withVariance: jest.fn((items, rules) => items.map((a) => ({ ...a, variance: 'OVER', expected_pct: rules.expectedPct }))),
  alertVariance: jest.fn(async () => ({ units: 2 })),
}));

const request = require('supertest');
const { ConflictError } = require('@rbm/lib/errors');
const { RBAC_SCOPES } = require('@rbm/lib/rbac');
const rbacService = require('../../src/services/rbacService');
const query = require('../../src/services/budgetExecution/budgetExecutionQuery');
const imports = require('../../src/services/budgetExecution/budgetExecutionImports');
const links = require('../../src/services/budgetExecution/budgetExecutionLinks');
const scope = require('../../src/services/budgetExecution/budgetExecutionScope');
const notices = require('../../src/services/budgetExecution/budgetExecutionNotices');
const reminder = require('../../src/services/budgetExecution/budgetImportReminder');
const variance = require('../../src/services/budgetExecution/budgetVariance');
const app = require('../../src/app');

const IMPORT = { id: 3, fiscal_year: '2026', as_of_date: '2026-10-13' };
const ACT = { id: 68, code: '1.1.1.02', division_code: 'NCD', released_budget: 100, committed: 20, spent: 30, balance: 50, fund_centers: [] };
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

beforeEach(() => {
  jest.clearAllMocks();
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.ALL });
  scope.allowedDivisions.mockResolvedValue(null);
  query.resolveImport.mockResolvedValue(IMPORT);
  query.activityExecution.mockResolvedValue([ACT]);
  query.activityDetail.mockImplementation(async ({ activity }) => ({ ...activity, detail: true }));
  imports.importExport.mockResolvedValue({ id: 4, fund_center_count: 253, line_count: 2325 });
  imports.listImports.mockResolvedValue([IMPORT]);
  imports.deleteImport.mockResolvedValue(IMPORT);
  links.unlinkedFundCenters.mockResolvedValue([{ fund_center: 'CDC1002013MB' }]);
  links.linkFundCenter.mockResolvedValue({ id: 9 });
  notices.notifyDivisions.mockResolvedValue({ divisions: 12 });
  reminder.importStatus.mockResolvedValue({ week_start: '2026-10-12', done: true, last_import: IMPORT });
  reminder.notifyImportDone.mockResolvedValue(undefined);
});

describe('GET /api/budget-execution/summary', () => {
  it('should return the totals and divisions of the latest import', async () => {
    const res = await request(app).get('/api/budget-execution/summary?fiscal_year=2026');
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toMatchObject({ released_budget: 100, committed: 20, spent: 30, balance: 50, execution_pct: 50 });
    expect(res.body.data.divisions).toEqual([expect.objectContaining({ division_code: 'NCD', activity_count: 1 })]);
  });

  it('should return empty figures before any import', async () => {
    query.resolveImport.mockResolvedValue(undefined);
    const res = await request(app).get('/api/budget-execution/summary?fiscal_year=2026');
    expect(res.body.data).toMatchObject({ import: null, divisions: [], totals: { balance: 0 } });
  });

  it('should return 403 without read permission', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    expect((await request(app).get('/api/budget-execution/summary')).status).toBe(403);
  });
});

describe('GET /api/budget-execution/activities', () => {
  it('should flag each activity against the pace of the import date', async () => {
    const res = await request(app).get('/api/budget-execution/activities?fiscal_year=2026');
    expect(variance.varianceRules).toHaveBeenCalledWith('2026-10-13');
    expect(res.body.data.items[0]).toMatchObject({ id: 68, variance: 'OVER', expected_pct: 75 });
  });

  it('should limit a BU user to its own divisions', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.DIVISION });
    scope.allowedDivisions.mockResolvedValue(['EPR']);
    await request(app).get('/api/budget-execution/activities?fiscal_year=2026');
    expect(query.activityExecution).toHaveBeenCalledWith({ importId: 3, fiscalYear: '2026', divisions: ['EPR'] });
  });

  it('should give a BU user nothing for a division outside its scope', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.DIVISION });
    scope.allowedDivisions.mockResolvedValue(['EPR']);
    await request(app).get('/api/budget-execution/activities?fiscal_year=2026&division=NCD');
    expect(query.activityExecution).toHaveBeenCalledWith(expect.objectContaining({ divisions: [] }));
  });

  it('should include the units under a directorate', async () => {
    await request(app).get('/api/budget-execution/activities?fiscal_year=2026&division=APPM');
    expect(query.activityExecution).toHaveBeenCalledWith(expect.objectContaining({ divisions: ['APPM', 'CHSISD'] }));
  });

  it('should return 400 on a bad year', async () => {
    expect((await request(app).get('/api/budget-execution/activities?fiscal_year=26')).status).toBe(400);
  });
});

describe('GET /api/budget-execution/activities/:id', () => {
  it('should return the GL detail of an activity in scope', async () => {
    const res = await request(app).get('/api/budget-execution/activities/68?fiscal_year=2026');
    expect(res.status).toBe(200);
    expect(res.body.data.activity).toMatchObject({ id: 68, detail: true });
  });

  it('should return 404 for an activity outside the scope', async () => {
    query.activityExecution.mockResolvedValue([]);
    expect((await request(app).get('/api/budget-execution/activities/68?fiscal_year=2026')).status).toBe(404);
  });
});

describe('POST /api/budget-execution/imports', () => {
  const send = () => request(app).post('/api/budget-execution/imports')
    .field('fiscal_year', '2026').field('as_of_date', '2026-10-13')
    .attach('file', Buffer.from('xlsx'), { filename: 'EXPORT.xlsx', contentType: XLSX_TYPE });

  it('should import, email the business units and confirm to the finance team', async () => {
    const res = await send();
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: 4, fund_center_count: 253, line_count: 2325, notified_divisions: 12 });
    expect(imports.importExport).toHaveBeenCalledWith(expect.objectContaining({ fiscalYear: '2026', asOfDate: '2026-10-13', fileName: 'EXPORT.xlsx' }));
    expect(notices.notifyDivisions).toHaveBeenCalled();
    expect(reminder.notifyImportDone).toHaveBeenCalledWith(expect.objectContaining({ notifiedDivisions: 12 }));
    expect(variance.alertVariance).toHaveBeenCalledWith(expect.objectContaining({ importRow: IMPORT }));
  });

  it('should not email the business units when notify=0', async () => {
    const res = await request(app).post('/api/budget-execution/imports')
      .field('fiscal_year', '2026').field('as_of_date', '2026-10-13').field('notify', '0')
      .attach('file', Buffer.from('xlsx'), { filename: 'EXPORT.xlsx', contentType: XLSX_TYPE });
    expect(res.status).toBe(201);
    expect(notices.notifyDivisions).not.toHaveBeenCalled();
    expect(variance.alertVariance).not.toHaveBeenCalled();
  });

  it('should return 400 without a file or with a bad date', async () => {
    expect((await request(app).post('/api/budget-execution/imports').field('fiscal_year', '2026').field('as_of_date', '2026-10-13')).status).toBe(400);
    const bad = await request(app).post('/api/budget-execution/imports').field('fiscal_year', '2026').field('as_of_date', '13/10/2026')
      .attach('file', Buffer.from('xlsx'), { filename: 'EXPORT.xlsx', contentType: XLSX_TYPE });
    expect(bad.status).toBe(400);
  });

  it('should refuse a file that is not .xlsx', async () => {
    const res = await request(app).post('/api/budget-execution/imports').field('fiscal_year', '2026').field('as_of_date', '2026-10-13')
      .attach('file', Buffer.from('a,b'), { filename: 'export.csv', contentType: 'text/csv' });
    expect(res.status).toBe(400);
    expect(imports.importExport).not.toHaveBeenCalled();
  });

  it('should return 403 when create is not granted at scope all', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.DIVISION });
    expect((await send()).status).toBe(403);
    expect(imports.importExport).not.toHaveBeenCalled();
  });
});

describe('import status, history, unlinked, links, delete', () => {
  it('should say whether the export was imported this week', async () => {
    const res = await request(app).get('/api/budget-execution/import-status');
    expect(res.body.data).toMatchObject({ week_start: '2026-10-12', done: true });
  });

  it('should list the imports of the year', async () => {
    const res = await request(app).get('/api/budget-execution/imports?fiscal_year=2026');
    expect(res.body.data).toEqual([IMPORT]);
  });

  it('should hide the import history and its institution-wide totals from business units', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.DIVISION });
    expect((await request(app).get('/api/budget-execution/imports?fiscal_year=2026')).status).toBe(403);
    expect(imports.listImports).not.toHaveBeenCalled();
  });

  it('should list unlinked fund centers for managers only', async () => {
    expect((await request(app).get('/api/budget-execution/unlinked?fiscal_year=2026')).body.data.items).toHaveLength(1);
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.DIRECTORATE });
    expect((await request(app).get('/api/budget-execution/unlinked?fiscal_year=2026')).status).toBe(403);
  });

  it('should link a fund center, and return 409 when it is taken', async () => {
    const body = { fund_center: 'CDC1002013MB', plan_node_id: 68, fiscal_year: '2026' };
    expect((await request(app).post('/api/budget-execution/links').send(body)).status).toBe(201);
    links.linkFundCenter.mockRejectedValue(new ConflictError('already linked'));
    expect((await request(app).post('/api/budget-execution/links').send(body)).status).toBe(409);
    expect((await request(app).post('/api/budget-execution/links').send({ fund_center: 'X' })).status).toBe(400);
  });

  it('should delete an import for managers only', async () => {
    expect((await request(app).delete('/api/budget-execution/imports/3')).status).toBe(200);
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.DIVISION });
    expect((await request(app).delete('/api/budget-execution/imports/3')).status).toBe(403);
  });
});
