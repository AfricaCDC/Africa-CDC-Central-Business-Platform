// ── GET /api/public/pirs and /api/public/big-tickets (D-20261026-03) ──
//
// API-key gated. The row builders are mocked: their own tests cover the rows.
// Covers auth (401 / 403 per scope), validation (400), JSON and CSV output,
// published data only (statuses passed to the PIRS builder, no drafts for
// Big Tickets) and the default quarter.

jest.mock('../../src/services/apiKeyService', () => ({
  verifyKey: jest.fn(() => Promise.resolve(global.__apiKey || null)),
}));
jest.mock('../../src/services/reporting/planExportService', () => ({
  ...jest.requireActual('../../src/services/reporting/planExportService'),
  buildPirsRows: jest.fn(),
}));
jest.mock('../../src/services/bigTickets/bigTicketsExport', () => ({
  bigTicketsExport: jest.fn(),
  defaultQuarter: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const { PUBLIC_STATUSES } = require('../../src/routes/plan-nodes/_helpers');
const { buildPirsRows, PIRS_HEADERS } = require('../../src/services/reporting/planExportService');
const { bigTicketsExport, defaultQuarter } = require('../../src/services/bigTickets/bigTicketsExport');

const PIRS_ROW = { Level: 1, 'Indicator code': 'EPR.1.1', Indicator: 'Drills held' };
const BT_HEADERS = ['Ticket #', 'Big Ticket'];
const BT_ROW = { 'Ticket #': 'BT05', 'Big Ticket': 'Local manufacturing' };

beforeEach(() => {
  jest.clearAllMocks();
  global.__apiKey = null;
  buildPirsRows.mockResolvedValue([PIRS_ROW]);
  bigTicketsExport.mockResolvedValue({ headers: BT_HEADERS, rows: [BT_ROW] });
  defaultQuarter.mockResolvedValue('Q3');
});

describe('GET /api/public/pirs', () => {
  it('should return 401 without an API key', async () => {
    const res = await request(app).get('/api/public/pirs');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('API_KEY_REQUIRED');
  });

  it('should return 403 when the key lacks pirs:read', async () => {
    global.__apiKey = { id: 1, scopes: ['workplan:read', 'big_tickets:read'] };
    const res = await request(app).get('/api/public/pirs').set('X-API-Key', 'cdc_x');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('API_KEY_SCOPE_MISSING');
  });

  it('should return the published indicators of the year and division as JSON', async () => {
    global.__apiKey = { id: 1, scopes: ['pirs:read'] };
    const res = await request(app).get('/api/public/pirs?fiscal_year=2026&division=epr,sci').set('X-API-Key', 'cdc_x');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, meta: { fiscal_year: '2026', rows: 1 }, data: [PIRS_ROW] });
    expect(buildPirsRows).toHaveBeenCalledWith({ fiscalYear: '2026', divFilter: ['EPR', 'SCI'], statuses: PUBLIC_STATUSES });
  });

  it('should return a CSV with a BOM and the PIRS headers', async () => {
    global.__apiKey = { id: 1, scopes: ['pirs:read'] };
    const res = await request(app).get('/api/public/pirs?fiscal_year=2026&format=csv').set('X-API-Key', 'cdc_x');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain('pirs-2026.csv');
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    expect(res.text.slice(1).split('\r\n')[0]).toBe(PIRS_HEADERS.join(','));
  });

  it('should return 400 for an unknown format or a malformed year', async () => {
    global.__apiKey = { id: 1, scopes: ['pirs:read'] };
    expect((await request(app).get('/api/public/pirs?format=xml').set('X-API-Key', 'cdc_x')).status).toBe(400);
    const res = await request(app).get('/api/public/pirs?fiscal_year=20x6').set('X-API-Key', 'cdc_x');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});

describe('GET /api/public/big-tickets', () => {
  it('should return 403 when the key lacks big_tickets:read', async () => {
    global.__apiKey = { id: 1, scopes: ['pirs:read'] };
    expect((await request(app).get('/api/public/big-tickets').set('X-API-Key', 'cdc_x')).status).toBe(403);
  });

  it('should return the published rows of the latest quarter by default', async () => {
    global.__apiKey = { id: 1, scopes: ['big_tickets:read'] };
    const res = await request(app).get('/api/public/big-tickets?fiscal_year=2026').set('X-API-Key', 'cdc_x');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ fiscal_year: '2026', quarter: 'Q3', rows: 1 });
    expect(res.body.data).toEqual([BT_ROW]);
    // No includeDrafts: draft and returned reports never leave the app.
    expect(bigTicketsExport).toHaveBeenCalledWith({ fiscalYear: '2026', quarter: 'Q3' });
  });

  it('should use the requested quarter and send a CSV', async () => {
    global.__apiKey = { id: 1, scopes: ['big_tickets:read'] };
    const res = await request(app).get('/api/public/big-tickets?fiscal_year=2026&quarter=q2&format=csv').set('X-API-Key', 'cdc_x');
    expect(res.status).toBe(200);
    expect(defaultQuarter).not.toHaveBeenCalled();
    expect(res.headers['content-disposition']).toContain('big-tickets-2026-Q2.csv');
    expect(res.text.slice(1).split('\r\n')).toEqual(['Ticket #,Big Ticket', 'BT05,Local manufacturing']);
  });

  it('should return 400 for an unknown quarter', async () => {
    global.__apiKey = { id: 1, scopes: ['big_tickets:read'] };
    const res = await request(app).get('/api/public/big-tickets?quarter=Q5').set('X-API-Key', 'cdc_x');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('quarter must be Q1, Q2, Q3 or Q4');
  });
});
