// ── GET /api/big-tickets/export (D-20261015-10) ──

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => { req.user = { id: 1, email: 'me@africacdc.org' }; next(); },
}));
jest.mock('../../src/middleware/auditLog', () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: false, denies: [] }),
}));
jest.mock('../../src/services/bigTickets/bigTicketsExport', () => ({
  ...jest.requireActual('../../src/services/bigTickets/bigTicketsExport'),
  bigTicketsExport: jest.fn(),
}));

const request = require('supertest');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const rbacService = require('../../src/services/rbacService');
const exporter = require('../../src/services/bigTickets/bigTicketsExport');
const app = require('../../src/app');

const { exportHeaders } = jest.requireActual('../../src/services/bigTickets/bigTicketsExport');

beforeEach(() => {
  jest.clearAllMocks();
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  const headers = exportHeaders('2026', 'Q3');
  exporter.bigTicketsExport.mockResolvedValue({ headers, rows: [Object.fromEntries(headers.map((h) => [h, 'x']))] });
});

describe('GET /api/big-tickets/export', () => {
  it('should send an xlsx of the year and quarter', async () => {
    const res = await request(app).get('/api/big-tickets/export?fiscal_year=2026&quarter=Q3');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheetml/);
    expect(res.headers['content-disposition']).toContain('big-tickets-2026-Q3.xlsx');
    expect(exporter.bigTicketsExport).toHaveBeenCalledWith({ fiscalYear: '2026', quarter: 'Q3', includeDrafts: true });
    expect(rbacService.checkPermission).toHaveBeenCalledWith(1, RBAC_MODULES.BIG_TICKET, RBAC_ACTIONS.EXPORT);
  });

  it('should leave the drafts out for a business-unit export scope', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'own' });
    expect((await request(app).get('/api/big-tickets/export?fiscal_year=2026&quarter=Q3')).status).toBe(200);
    expect(exporter.bigTicketsExport).toHaveBeenCalledWith({ fiscalYear: '2026', quarter: 'Q3', includeDrafts: false });
  });

  it('should return 403 without the export permission', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    expect((await request(app).get('/api/big-tickets/export?fiscal_year=2026&quarter=Q3')).status).toBe(403);
  });

  it('should return 400 on a bad format', async () => {
    expect((await request(app).get('/api/big-tickets/export?format=pdf')).status).toBe(400);
  });
});

describe('exportHeaders', () => {
  it('should follow the PR&A workbook, with every quarter and the chosen one', () => {
    const h = exportHeaders('2026', 'Q3');
    expect(h.slice(0, 7)).toEqual(['Ticket #', 'AHSS Pillar', 'Big Ticket', 'Result(s)', 'PIRS Indicator & Code', 'Tier', '2026 Target']);
    expect(h).toEqual(expect.arrayContaining(['Q1 Achieved', 'Q4 Achieved', 'Q3 Performance (%)', 'Q3 Narration', 'Lead BU', 'Contributing BU']));
  });
});
