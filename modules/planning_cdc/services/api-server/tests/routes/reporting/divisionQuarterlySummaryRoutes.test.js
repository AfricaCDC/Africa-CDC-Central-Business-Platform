/* eslint-disable no-restricted-syntax --
 * String literals ("Indicator code", route-path segments, division codes) are
 * test fixtures / CSV-header labels, not ENTITY_TYPES references (CHARTER §11). */
// ── reporting/divisionQuarterlySummaryRoutes integration tests ──
//
// Covers GET /api/reporting/division-quarterly-reports/:divisionCode (+ /export):
//   - 401 unauthenticated
//   - 403 when the RBAC matrix denies read/export
//   - 403 row-level scope: a non-`all` user requesting a foreign division
//   - 200 JSON summary + scoped 200 for an allowed division
//   - export: XLSX (default) + CSV, correct Content-Type / Content-Disposition
//
// The aggregation (summaryReportService) is mocked so we assert the routing,
// auth, RBAC and scope wiring deterministically; the real CSV/XLSX encoders run.

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

jest.mock('@rbm/lib/user-divisions', () => ({
  ...jest.requireActual('@rbm/lib/user-divisions'),
  getUserDivisionCodes: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../../src/services/reporting/summaryReportService', () => {
  const actual = jest.requireActual('../../../src/services/reporting/summaryReportService');
  return {
    ...actual,
    getDivisionQuarterlySummary: jest.fn(),
    buildDivisionSummaryRows: jest.fn(),
  };
});

jest.mock('../../../src/services/reporting/divisionDeckService', () => ({
  buildDivisionQuarterlyDeck: jest.fn(),
  PPTX_MIME: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}));

const request = require('supertest');
const app = require('../../../src/app');
const rbacService = require('../../../src/services/rbacService');
const { getUserDivisionCodes } = require('@rbm/lib/user-divisions');
const {
  getDivisionQuarterlySummary,
  buildDivisionSummaryRows,
} = require('../../../src/services/reporting/summaryReportService');
const { buildDivisionQuarterlyDeck } = require('../../../src/services/reporting/divisionDeckService');
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const BASE = '/api/reporting/division-quarterly-reports';
const SUMMARY = {
  division: { code: 'MIS', name: 'Division of MIS', directorate: 'Admin' },
  fiscal_year: '2026', quarter: 'Q1', period: { id: 1, quarter: 'Q1' },
  kpis: { total_indicators: 3, reported_count: 1, approved_count: 1, completion_pct: 33, achievement_pct: null },
  indicators: [{ code: 'MIS.1', role: 'OWNER' }],
  activities: [],
};
const ROWS = [{ 'Indicator code': 'MIS.1', Indicator: 'A', Tier: 3, Role: 'OWNER', 'Quarter target': 10, Actual: 8, 'Achievement %': 80, Status: 'APPROVED' }];

beforeEach(() => {
  jest.clearAllMocks();
  global.__testUser = { id: 7, email: 'me@africacdc.org', division_code: 'MIS' };
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  getUserDivisionCodes.mockResolvedValue([]);
  getDivisionQuarterlySummary.mockResolvedValue(SUMMARY);
  buildDivisionSummaryRows.mockResolvedValue(ROWS);
  buildDivisionQuarterlyDeck.mockResolvedValue({
    buffer: Buffer.from('PK fake pptx'),
    filename: 'division-summary-MIS-2026-Q1.pptx',
    mime: PPTX_MIME,
  });
});

afterEach(() => { global.__testUser = null; });

describe('GET /api/reporting/division-quarterly-reports/:divisionCode', () => {
  it('should return 401 when unauthenticated', async () => {
    global.__testUser = null;
    const res = await request(app).get(`${BASE}/MIS?fiscal_year=2026&quarter=Q1`);
    expect(res.status).toBe(401);
  });

  it('should return 403 when the user lacks quarterly_report:read', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    const res = await request(app).get(`${BASE}/MIS?fiscal_year=2026&quarter=Q1`);
    expect(res.status).toBe(403);
    expect(getDivisionQuarterlySummary).not.toHaveBeenCalled();
  });

  it('should return the summary for an all-scope user', async () => {
    const res = await request(app).get(`${BASE}/MIS?fiscal_year=2026&quarter=Q1`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { division: { code: 'MIS' } } });
    expect(getDivisionQuarterlySummary).toHaveBeenCalledWith(
      expect.objectContaining({ divisionCode: 'MIS', fiscalYear: '2026', quarter: 'Q1' }),
    );
  });

  it('should normalize the division code to upper case', async () => {
    const res = await request(app).get(`${BASE}/mis?fiscal_year=2026&quarter=q1`);
    expect(res.status).toBe(200);
    expect(getDivisionQuarterlySummary).toHaveBeenCalledWith(
      expect.objectContaining({ divisionCode: 'MIS', quarter: 'Q1' }),
    );
  });

  it('should return 403 when a scoped user requests a foreign division', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'division' });
    getUserDivisionCodes.mockResolvedValue(['WD']); // not MIS
    const res = await request(app).get(`${BASE}/MIS?fiscal_year=2026&quarter=Q1`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    expect(getDivisionQuarterlySummary).not.toHaveBeenCalled();
  });

  it('should allow a scoped user to read their own division', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'division' });
    getUserDivisionCodes.mockResolvedValue(['mis']); // resolver may lower-case
    const res = await request(app).get(`${BASE}/MIS?fiscal_year=2026&quarter=Q1`);
    expect(res.status).toBe(200);
    expect(getDivisionQuarterlySummary).toHaveBeenCalled();
  });
});

describe('GET /api/reporting/division-quarterly-reports/:divisionCode/export', () => {
  it('should return 403 when the user lacks quarterly_report:export', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    const res = await request(app).get(`${BASE}/MIS/export?fiscal_year=2026&quarter=Q1`);
    expect(res.status).toBe(403);
    expect(buildDivisionSummaryRows).not.toHaveBeenCalled();
  });

  it('should return an XLSX attachment by default', async () => {
    const res = await request(app).get(`${BASE}/MIS/export?fiscal_year=2026&quarter=Q1`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('division-summary-MIS-2026-Q1.xlsx');
    expect(buildDivisionSummaryRows).toHaveBeenCalledWith(
      expect.objectContaining({ divisionCode: 'MIS', fiscalYear: '2026', quarter: 'Q1' }),
    );
  });

  it('should return a CSV attachment with a UTF-8 BOM when format=csv', async () => {
    const res = await request(app).get(`${BASE}/MIS/export?fiscal_year=2026&quarter=Q1&format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('division-summary-MIS-2026-Q1.csv');
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text).toContain('Indicator code');
  });

  it('should return 403 on export for a foreign division (scope)', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'division' });
    getUserDivisionCodes.mockResolvedValue(['WD']);
    const res = await request(app).get(`${BASE}/MIS/export?fiscal_year=2026&quarter=Q1`);
    expect(res.status).toBe(403);
    expect(buildDivisionSummaryRows).not.toHaveBeenCalled();
  });

  it('should return a PPTX deck attachment when format=pptx', async () => {
    const res = await request(app).get(`${BASE}/MIS/export?fiscal_year=2026&quarter=Q1&format=pptx`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('presentationml.presentation');
    expect(res.headers['content-disposition']).toContain('division-summary-MIS-2026-Q1.pptx');
    expect(buildDivisionQuarterlyDeck).toHaveBeenCalledWith(
      expect.objectContaining({ divisionCode: 'MIS', fiscalYear: '2026', quarter: 'Q1' }),
    );
    // pptx path must NOT build the tabular rows
    expect(buildDivisionSummaryRows).not.toHaveBeenCalled();
  });

  it('should enforce scope (403) on a pptx export for a foreign division', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'division' });
    getUserDivisionCodes.mockResolvedValue(['WD']);
    const res = await request(app).get(`${BASE}/MIS/export?fiscal_year=2026&quarter=Q1&format=pptx`);
    expect(res.status).toBe(403);
    expect(buildDivisionQuarterlyDeck).not.toHaveBeenCalled();
  });
});
