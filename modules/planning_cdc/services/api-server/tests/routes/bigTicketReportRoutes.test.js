// ── /api/big-tickets/:id/reports/:quarter (D-20261015-05) ──
//
// Reporting by the ticket's business units or M&E, M&E review. Services mocked.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => { req.user = { id: 1, email: 'me@africacdc.org' }; next(); },
}));
jest.mock('../../src/middleware/auditLog', () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn().mockResolvedValue({ allowed: true, scope: 'all' }),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: false, denies: [] }),
}));
jest.mock('../../src/services/bigTickets/bigTicketsQuery', () => ({ listTickets: jest.fn(), getTicket: jest.fn(), searchIndicators: jest.fn() }));
jest.mock('../../src/services/bigTickets/bigTicketReports', () => ({
  canReport: jest.fn(), canReview: jest.fn(), prefill: jest.fn(), saveReport: jest.fn(), decideReport: jest.fn(),
}));
jest.mock('../../src/services/bigTickets/bigTicketReportNotices', () => ({ notifySubmitted: jest.fn(), notifyDecision: jest.fn() }));

const request = require('supertest');
const { STATUSES } = require('@rbm/lib/enums');
const query = require('../../src/services/bigTickets/bigTicketsQuery');
const reports = require('../../src/services/bigTickets/bigTicketReports');
const notices = require('../../src/services/bigTickets/bigTicketReportNotices');
const app = require('../../src/app');

const ticket = { id: 29, code: 'BT29', lead_division_code: 'Digital', contributors: [{ division_code: 'PHC' }], lines: [], reports: [] };
const URL = '/api/big-tickets/29/reports/Q3';

beforeEach(() => {
  jest.clearAllMocks();
  query.getTicket.mockResolvedValue(ticket);
  reports.canReport.mockResolvedValue(true);
  reports.canReview.mockResolvedValue(false);
  reports.prefill.mockResolvedValue({});
  reports.saveReport.mockResolvedValue({ id: 5, status: STATUSES.DRAFT });
});

describe('GET report', () => {
  it('should say whether the user can edit and review', async () => {
    const res = await request(app).get(`${URL}?fiscal_year=2026`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ quarter: 'Q3', can_edit: true, can_review: false });
    expect(reports.canReport).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), ticket);
  });
});

describe('PUT report', () => {
  it('should return 403 when the user is not one of the business units nor M&E', async () => {
    reports.canReport.mockResolvedValue(false);
    const res = await request(app).put(URL).send({ fiscal_year: '2026' });
    expect(res.status).toBe(403);
    expect(reports.saveReport).not.toHaveBeenCalled();
  });

  it('should let M&E correct any report (canEditAny) without a new submission email', async () => {
    reports.canReview.mockResolvedValue(true);
    reports.saveReport.mockResolvedValue({ id: 5, status: STATUSES.APPROVED });
    const res = await request(app).put(URL).send({ fiscal_year: '2026', submit: true, progress_status: 'ON_TRACK', narrative: 'x' });
    expect(res.status).toBe(200);
    expect(reports.saveReport).toHaveBeenCalledWith(expect.objectContaining({ canEditAny: true, submit: true }));
    expect(notices.notifySubmitted).not.toHaveBeenCalled();
  });

  it('should email M&E when a business unit submits', async () => {
    reports.saveReport.mockResolvedValue({ id: 5, status: STATUSES.SUBMITTED });
    const res = await request(app).put(URL).send({ fiscal_year: '2026', submit: true, progress_status: 'ON_TRACK', narrative: 'x' });
    expect(res.status).toBe(200);
    expect(notices.notifySubmitted).toHaveBeenCalled();
  });

  it('should return 400 when submitting without a progress status', async () => {
    const res = await request(app).put(URL).send({ fiscal_year: '2026', submit: true, narrative: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('POST approve / reject', () => {
  it('should return 403 for a non-reviewer', async () => {
    expect((await request(app).post(`${URL}/approve`).send({ fiscal_year: '2026' })).status).toBe(403);
  });

  it('should require a reason to return a report', async () => {
    reports.canReview.mockResolvedValue(true);
    expect((await request(app).post(`${URL}/reject`).send({ fiscal_year: '2026' })).status).toBe(400);
  });
});
