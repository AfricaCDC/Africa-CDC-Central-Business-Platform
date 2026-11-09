/* eslint-disable no-restricted-syntax --
 * The string literals here ("Division", "Directorate") are CSV column-header
 * labels and report sample data used as test fixtures/assertions, not
 * ENTITY_TYPES references (CHARTER §11 CSV-header exception). */
// ── reporting/exportRoutes integration tests ──
//
// Covers GET /api/reporting/exports/quarterly-report:
//   - 401 unauthenticated (no token)        → handled by authMiddleware (not mocked here)
//   - 403 when the RBAC matrix denies export
//   - 200 XLSX (default) + CSV, correct Content-Type / Content-Disposition
//   - scope enforcement: non-`all` users are restricted to their division set,
//     and a requested division filter is intersected with that set.
//
// The DB aggregation is mocked (buildQuarterlyReportRows) so we assert the
// scope→divFilter wiring deterministically; the real CSV/XLSX encoders run.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    if (global.__testUser === null) {
      return res.status(401).json({ success: false, message: 'No token', code: 'TOKEN_MISSING' });
    }
    req.user = global.__testUser || { id: 1, email: 'me@africacdc.org', division_code: null };
    next();
  },
}));

jest.mock('../../../src/services/rbacService', () => ({
  checkPermission: jest.fn(() => Promise.resolve({ allowed: true, scope: 'all' })),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: true, denies: [] }),
}));

// Keep all real exports (other routes need DIVISION_ASSIGNMENT_ROLE_LIST etc.
// at app load); only stub the DB-backed division resolver.
jest.mock('@rbm/lib/user-divisions', () => ({
  ...jest.requireActual('@rbm/lib/user-divisions'),
  getUserDivisionCodes: jest.fn().mockResolvedValue([]),
}));

// Partial-mock the services: stub the DB aggregation, keep the real encoders.
jest.mock('../../../src/services/reporting/quarterlyReportExportService', () => {
  const actual = jest.requireActual('../../../src/services/reporting/quarterlyReportExportService');
  return { ...actual, buildQuarterlyReportRows: jest.fn() };
});
jest.mock('../../../src/services/reporting/planExportService', () => {
  const actual = jest.requireActual('../../../src/services/reporting/planExportService');
  return { ...actual, buildWorkplanRows: jest.fn(), buildPirsRows: jest.fn() };
});
jest.mock('../../../src/services/reporting/activityReportExportService', () => {
  const actual = jest.requireActual('../../../src/services/reporting/activityReportExportService');
  return { ...actual, buildActivityReportRows: jest.fn() };
});
jest.mock('../../../src/services/reporting/donorExportService', () => {
  const actual = jest.requireActual('../../../src/services/reporting/donorExportService');
  return { ...actual, buildDonorRows: jest.fn() };
});

const request = require('supertest');
const app = require('../../../src/app');
const rbacService = require('../../../src/services/rbacService');
const { getUserDivisionCodes } = require('@rbm/lib/user-divisions');
const { buildQuarterlyReportRows } = require('../../../src/services/reporting/quarterlyReportExportService');
const { buildWorkplanRows, buildPirsRows } = require('../../../src/services/reporting/planExportService');
const { buildActivityReportRows } = require('../../../src/services/reporting/activityReportExportService');
const { buildDonorRows } = require('../../../src/services/reporting/donorExportService');

const URL = '/api/reporting/exports/quarterly-report';
const WORKPLAN_URL = '/api/reporting/exports/workplan';
const PIRS_URL = '/api/reporting/exports/pirs';
const ACTIVITY_URL = '/api/reporting/exports/activity-report';
const DONOR_URL = '/api/reporting/exports/donor';
const SAMPLE = [{ 'Division': 'Eastern Africa RCC', 'Q1 target': 10, 'Q1 Achievement': 8 }];
const WORKPLAN_SAMPLE = [{ 'Type': 'Broad', 'Code': 'B1', 'Division': 'Workforce', 'Status': 'DRAFT' }];
const PIRS_SAMPLE = [{ 'Indicator code': 'IND.1', 'Tier': 'Outcome', 'Division': 'Public Health', 'Status': 'APPROVED' }];
const ACTIVITY_SAMPLE = [{ 'Fiscal year': '2026', 'Quarter': 'Q1', 'Division': 'WD', 'Status': 'SUBMITTED' }];
const DONOR_SAMPLE = [{ 'Type': 'Specific Activity', 'Code': '1.1.1.01.01', 'Funding source': 'Japan Funds', 'Status': 'DRAFT' }];

beforeEach(() => {
  jest.clearAllMocks();
  global.__testUser = { id: 7, email: 'me@africacdc.org', division_code: 'EARCC' };
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  getUserDivisionCodes.mockResolvedValue([]);
  buildQuarterlyReportRows.mockResolvedValue(SAMPLE);
  buildWorkplanRows.mockResolvedValue(WORKPLAN_SAMPLE);
  buildPirsRows.mockResolvedValue(PIRS_SAMPLE);
  buildActivityReportRows.mockResolvedValue(ACTIVITY_SAMPLE);
  buildDonorRows.mockResolvedValue(DONOR_SAMPLE);
});

afterEach(() => { global.__testUser = null; });

describe('GET /api/reporting/exports/quarterly-report', () => {
  it('should return 401 when unauthenticated', async () => {
    global.__testUser = null;
    const res = await request(app).get(URL);
    expect(res.status).toBe(401);
  });

  it('should return 403 when the user lacks quarterly_report:export', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    const res = await request(app).get(`${URL}?fiscal_year=2026&quarter=Q1`);
    expect(res.status).toBe(403);
    expect(buildQuarterlyReportRows).not.toHaveBeenCalled();
  });

  it('should return an XLSX attachment by default for an export:all user', async () => {
    const res = await request(app).get(`${URL}?fiscal_year=2026&quarter=Q1`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('quarterly-report-2026-Q1.xlsx');
    // scope=all → no division restriction
    expect(buildQuarterlyReportRows).toHaveBeenCalledWith(
      expect.objectContaining({ fiscalYear: '2026', quarter: 'Q1', divFilter: [] }),
    );
  });

  it('should return a CSV attachment with a UTF-8 BOM when format=csv', async () => {
    const res = await request(app).get(`${URL}?fiscal_year=2026&quarter=Q1&format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('quarterly-report-2026-Q1.csv');
    expect(res.text.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(res.text).toContain('Division');
  });

  it('should restrict a division-scoped user to their assigned divisions', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'division' });
    getUserDivisionCodes.mockResolvedValue(['earcc']); // resolver may return lowercase
    const res = await request(app).get(`${URL}?fiscal_year=2026&quarter=Q1&format=csv`);
    expect(res.status).toBe(200);
    expect(buildQuarterlyReportRows).toHaveBeenCalledWith(
      expect.objectContaining({ divFilter: ['EARCC'] }),
    );
  });

  it('should intersect a requested division filter with the allowed set', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'division' });
    getUserDivisionCodes.mockResolvedValue(['EARCC']);
    const res = await request(app).get(`${URL}?quarter=Q1&division=EARCC,WD&format=csv`);
    expect(res.status).toBe(200);
    // WD is outside the user's set → dropped
    expect(buildQuarterlyReportRows).toHaveBeenCalledWith(
      expect.objectContaining({ divFilter: ['EARCC'] }),
    );
  });

  it('should produce an empty export (no aggregation) for a scoped user with no divisions', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'division' });
    getUserDivisionCodes.mockResolvedValue([]);
    global.__testUser = { id: 7, email: 'x@africacdc.org', division_code: null };
    const res = await request(app).get(`${URL}?quarter=Q1&format=csv`);
    expect(res.status).toBe(200);
    expect(buildQuarterlyReportRows).not.toHaveBeenCalled();
    // header-only CSV (BOM + canonical headers, no data rows)
    expect(res.text).toContain('Directorate');
  });
});

describe('GET /api/reporting/exports/workplan', () => {
  it('should return 403 when the user lacks workplan:export', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    const res = await request(app).get(`${WORKPLAN_URL}?fiscal_year=2026`);
    expect(res.status).toBe(403);
    expect(buildWorkplanRows).not.toHaveBeenCalled();
  });

  it('should return an XLSX attachment by default for an export:all user', async () => {
    const res = await request(app).get(`${WORKPLAN_URL}?fiscal_year=2026`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('workplan-2026.xlsx');
    expect(buildWorkplanRows).toHaveBeenCalledWith(
      expect.objectContaining({ fiscalYear: '2026', divFilter: [] }),
    );
  });

  it('should return a CSV attachment with a UTF-8 BOM when format=csv', async () => {
    const res = await request(app).get(`${WORKPLAN_URL}?fiscal_year=2026&format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('workplan-2026.csv');
    expect(res.text.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(res.text).toContain('Type');
  });

  it('should restrict a division-scoped user to their assigned divisions', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'division' });
    getUserDivisionCodes.mockResolvedValue(['wd']); // resolver may return lowercase
    const res = await request(app).get(`${WORKPLAN_URL}?fiscal_year=2026`);
    expect(res.status).toBe(200);
    expect(buildWorkplanRows).toHaveBeenCalledWith(
      expect.objectContaining({ divFilter: ['WD'] }),
    );
  });
});

describe('GET /api/reporting/exports/pirs', () => {
  it('should return 403 when the user lacks pirs:export', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    const res = await request(app).get(`${PIRS_URL}?fiscal_year=2026`);
    expect(res.status).toBe(403);
    expect(buildPirsRows).not.toHaveBeenCalled();
  });

  it('should return an XLSX attachment by default for an export:all user', async () => {
    const res = await request(app).get(`${PIRS_URL}?fiscal_year=2026`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('pirs-indicators-2026.xlsx');
    expect(buildPirsRows).toHaveBeenCalledWith(
      expect.objectContaining({ fiscalYear: '2026', divFilter: [] }),
    );
  });

  it('should return a CSV attachment with a UTF-8 BOM when format=csv', async () => {
    const res = await request(app).get(`${PIRS_URL}?fiscal_year=2026&format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('pirs-indicators-2026.csv');
    expect(res.text.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(res.text).toContain('Indicator code');
  });
});

describe('GET /api/reporting/exports/activity-report', () => {
  it('should return 403 when the user lacks activity_report:export', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    const res = await request(app).get(`${ACTIVITY_URL}?fiscal_year=2026`);
    expect(res.status).toBe(403);
    expect(buildActivityReportRows).not.toHaveBeenCalled();
  });

  it('should return an XLSX attachment by default for an export:all user', async () => {
    const res = await request(app).get(`${ACTIVITY_URL}?fiscal_year=2026&quarter=Q1`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('activity-reports-2026-Q1.xlsx');
    expect(buildActivityReportRows).toHaveBeenCalledWith(
      expect.objectContaining({ fiscalYear: '2026', quarter: 'Q1', divFilter: [] }),
    );
  });

  it('should return a CSV attachment with a UTF-8 BOM when format=csv (no quarter)', async () => {
    const res = await request(app).get(`${ACTIVITY_URL}?fiscal_year=2026&format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('activity-reports-2026.csv');
    expect(res.text.charCodeAt(0)).toBe(0xfeff); // BOM
    expect(res.text).toContain('Fiscal year');
    expect(buildActivityReportRows).toHaveBeenCalledWith(
      expect.objectContaining({ fiscalYear: '2026', quarter: undefined }),
    );
  });

  it('should restrict a division-scoped user to their assigned divisions', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'division' });
    getUserDivisionCodes.mockResolvedValue(['wd']);
    const res = await request(app).get(`${ACTIVITY_URL}?fiscal_year=2026`);
    expect(res.status).toBe(200);
    expect(buildActivityReportRows).toHaveBeenCalledWith(
      expect.objectContaining({ divFilter: ['WD'] }),
    );
  });
});

describe('GET /api/reporting/exports/donor', () => {
  it('should return 403 when the user lacks workplan:export', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    const res = await request(app).get(`${DONOR_URL}?fiscal_year=2026`);
    expect(res.status).toBe(403);
    expect(buildDonorRows).not.toHaveBeenCalled();
  });

  it('should pass the funding_source filter through and name the file from it', async () => {
    const res = await request(app).get(`${DONOR_URL}?fiscal_year=2026&funding_source=Japan%20Funds&format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('donor-japan-funds-2026.csv');
    expect(res.text).toContain('Funding source');
    expect(buildDonorRows).toHaveBeenCalledWith(
      expect.objectContaining({ fiscalYear: '2026', fundingSource: 'Japan Funds', grant: undefined }),
    );
  });

  it('should pass the grant filter through when no funding_source is given', async () => {
    const res = await request(app).get(`${DONOR_URL}?fiscal_year=2026&grant=GAVI-001`);
    expect(res.status).toBe(200);
    expect(buildDonorRows).toHaveBeenCalledWith(
      expect.objectContaining({ grant: 'GAVI-001', fundingSource: undefined }),
    );
  });

  it('should fall back to an "all" slug when no filter is supplied', async () => {
    const res = await request(app).get(`${DONOR_URL}?fiscal_year=2026`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('donor-all-2026.xlsx');
  });

  it('should restrict a division-scoped user to their assigned divisions', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'division' });
    getUserDivisionCodes.mockResolvedValue(['WD']);
    const res = await request(app).get(`${DONOR_URL}?fiscal_year=2026`);
    expect(res.status).toBe(200);
    expect(buildDonorRows).toHaveBeenCalledWith(
      expect.objectContaining({ divFilter: ['WD'] }),
    );
  });
});
