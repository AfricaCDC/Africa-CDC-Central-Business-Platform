// ── /api/big-tickets (D-20261015-02) ──
//
// Read for every role; create / update need scope `all`, delete needs
// big_ticket:delete at scope `all`. Services are mocked: no DB.

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
jest.mock('../../src/services/bigTickets/bigTicketsQuery', () => ({
  listTickets: jest.fn(),
  getTicket: jest.fn(),
  searchIndicators: jest.fn(),
}));
jest.mock('../../src/services/bigTickets/bigTicketsWrite', () => ({
  createTicket: jest.fn(),
  updateTicket: jest.fn(),
  deleteTicket: jest.fn(),
}));

const request = require('supertest');
const { ConflictError } = require('@rbm/lib/errors');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const rbacService = require('../../src/services/rbacService');
const { audit } = require('../../src/middleware/auditLog');
const query = require('../../src/services/bigTickets/bigTicketsQuery');
const write = require('../../src/services/bigTickets/bigTicketsWrite');
const app = require('../../src/app');

const valid = {
  code: 'BT43', title: 'New continental platform', pillar_id: 2, lead_division_code: 'KM', contributors: ['PRA'],
  start_year: '2026', end_year: '2027', fiscal_year: '2026',
  lines: [{ label: 'Main', indicator_code: 'KM.10.3-2', target: { annual_target: '5', annual_target_numeric: 5 } }],
};

beforeEach(() => {
  jest.clearAllMocks();
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  query.listTickets.mockResolvedValue([{ id: 1, code: 'BT01' }]);
  query.getTicket.mockResolvedValue({ id: 1, code: 'BT01', lines: [] });
  query.searchIndicators.mockResolvedValue([{ id: 9, code: 'KM.10.3-2' }]);
  write.createTicket.mockResolvedValue(43);
  write.updateTicket.mockResolvedValue(undefined);
  write.deleteTicket.mockResolvedValue({ id: 1, code: 'BT01' });
  require('../../src/config/db').__chain.first.mockResolvedValue({ q: 'Q2' });
});

describe('GET /api/big-tickets', () => {
  it('should list the tickets of the year for the chosen quarter', async () => {
    const res = await request(app).get('/api/big-tickets?fiscal_year=2026&quarter=Q3&pillar_id=2');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { fiscal_year: '2026', quarter: 'Q3', items: [{ id: 1, code: 'BT01' }] } });
    expect(query.listTickets).toHaveBeenCalledWith(expect.objectContaining({ fiscalYear: '2026', quarter: 'Q3', pillarId: 2 }));
    expect(rbacService.checkPermission).toHaveBeenCalledWith(1, RBAC_MODULES.BIG_TICKET, RBAC_ACTIONS.READ);
  });

  it('should default to the latest quarter with reports', async () => {
    const res = await request(app).get('/api/big-tickets?fiscal_year=2026');
    expect(res.body.data.quarter).toBe('Q2');
  });

  it('should return 400 on a bad quarter', async () => {
    const res = await request(app).get('/api/big-tickets?quarter=Q9');
    expect(res.status).toBe(400);
  });

  it('should return 403 without read permission', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    const res = await request(app).get('/api/big-tickets');
    expect(res.status).toBe(403);
  });
});

describe('GET /api/big-tickets/:id', () => {
  it('should return the ticket for the year', async () => {
    const res = await request(app).get('/api/big-tickets/1?fiscal_year=2027');
    expect(res.status).toBe(200);
    expect(query.getTicket).toHaveBeenCalledWith(1, '2027');
  });

  it('should return 404 for an unknown ticket', async () => {
    query.getTicket.mockResolvedValue(null);
    const res = await request(app).get('/api/big-tickets/99');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/big-tickets/indicator-options', () => {
  it('should search indicators of the year', async () => {
    const res = await request(app).get('/api/big-tickets/indicator-options?fiscal_year=2026&q=KM');
    expect(res.status).toBe(200);
    expect(query.searchIndicators).toHaveBeenCalledWith({ fiscalYear: '2026', q: 'KM' });
  });
});

describe('POST /api/big-tickets', () => {
  it('should create a ticket and audit it', async () => {
    const res = await request(app).post('/api/big-tickets').send(valid);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: { id: 43 } });
    expect(write.createTicket).toHaveBeenCalledWith(expect.objectContaining({ code: 'BT43', contributors: ['PRA'] }), 1);
    expect(audit).toHaveBeenCalledWith(expect.anything(), 'BIG_TICKET_CREATED', 'big_ticket', 43, { code: 'BT43' });
  });

  it('should return 403 when create is not granted at scope all', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'own' });
    const res = await request(app).post('/api/big-tickets').send(valid);
    expect(res.status).toBe(403);
    expect(write.createTicket).not.toHaveBeenCalled();
  });

  it.each([
    ['no line', { lines: [] }],
    ['a negative target', { lines: [{ target: { annual_target_numeric: -3 } }] }],
    ['an end year before the start', { end_year: '2025' }],
    ['targets outside the ticket years', { fiscal_year: '2028' }],
    ['a bad code', { code: 'B T' }],
  ])('should return 400 with %s', async (_label, patch) => {
    const res = await request(app).post('/api/big-tickets').send({ ...valid, ...patch });
    expect(res.status).toBe(400);
    expect(write.createTicket).not.toHaveBeenCalled();
  });

  it('should return 409 when the code is taken', async () => {
    write.createTicket.mockRejectedValue(new ConflictError('A Big Ticket with code BT43 already exists'));
    const res = await request(app).post('/api/big-tickets').send(valid);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, message: 'A Big Ticket with code BT43 already exists' });
  });
});

describe('PUT /api/big-tickets/:id', () => {
  it('should update the ticket and the targets of the year', async () => {
    const res = await request(app).put('/api/big-tickets/1').send({ ...valid, fiscal_year: '2027' });
    expect(res.status).toBe(200);
    expect(write.updateTicket).toHaveBeenCalledWith(1, expect.objectContaining({ fiscal_year: '2027' }), 1);
  });

  it('should return 403 without update at scope all', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    const res = await request(app).put('/api/big-tickets/1').send(valid);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/big-tickets/:id', () => {
  it('should delete with big_ticket:delete and audit it', async () => {
    const res = await request(app).delete('/api/big-tickets/1');
    expect(res.status).toBe(200);
    expect(rbacService.checkPermission).toHaveBeenCalledWith(1, RBAC_MODULES.BIG_TICKET, RBAC_ACTIONS.DELETE);
    expect(audit).toHaveBeenCalledWith(expect.anything(), 'BIG_TICKET_DELETED', 'big_ticket', 1, { code: 'BT01' });
  });

  it('should return 403 without delete permission', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    const res = await request(app).delete('/api/big-tickets/1');
    expect(res.status).toBe(403);
    expect(write.deleteTicket).not.toHaveBeenCalled();
  });
});
