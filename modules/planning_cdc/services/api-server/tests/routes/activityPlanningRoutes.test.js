// ── /api/activity-planning (D-20261026-01) ──
//
// Expense categories and planning reads need a signed-in user; cost lines and
// screening writes need the right to edit the specific activity. The
// service and the edit check are mocked; the DB is the shared knex mock.

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 7, email: 'focal@africacdc.org' };
    next();
  },
}));
jest.mock('../../src/middleware/auditLog', () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/routes/plan-nodes/specificActivityAccess', () => ({ canEditSpecificActivity: jest.fn() }));
jest.mock('../../src/services/activityPlanning', () => ({
  listExpenseCategories: jest.fn(), getPlanning: jest.fn(), saveCostLines: jest.fn(), saveScreening: jest.fn(),
}));
jest.mock('../../src/services/activityTrail', () => ({ getTrail: jest.fn() }));

const request = require('supertest');
const { NODE_TYPES } = require('@rbm/lib/enums');
const { ValidationError } = require('@rbm/lib/errors');
const db = require('../../src/config/db');
const { audit } = require('../../src/middleware/auditLog');
const { canEditSpecificActivity } = require('../../src/routes/plan-nodes/specificActivityAccess');
const planning = require('../../src/services/activityPlanning');
const { getTrail } = require('../../src/services/activityTrail');
const app = require('../../src/app');

const SPECIFIC = { id: 4102, node_type: NODE_TYPES.SPECIFIC_ACTIVITY, responsible_division_code: 'EPR' };
const LINE = { expense_category_id: 2, description: '3 return tickets to Nairobi', amount: 1368 };
const RATINGS = { information_requirements: 2, stakeholder_involvement: 3, scope_impact: 2, process_timeframe: 1, risk_uncertainty: 2 };

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.first.mockReset().mockResolvedValue(SPECIFIC);
  canEditSpecificActivity.mockResolvedValue({ allowed: true, admin: false });
  planning.listExpenseCategories.mockResolvedValue([{ id: 2, name: 'Travel Ticket' }]);
  planning.getPlanning.mockResolvedValue({ cost_lines: [], total: 0, screening: null });
  planning.saveCostLines.mockResolvedValue({ cost_lines: [{ ...LINE, expense_category: 'Travel Ticket' }], total: 1368, screening: null });
  planning.saveScreening.mockResolvedValue({ requires_complex_decision: true, total_score: 10, complexity_band: 'MODERATE' });
});

describe('GET /api/activity-planning', () => {
  it('should return the expense categories', async () => {
    const res = await request(app).get('/api/activity-planning/expense-categories');
    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe('Travel Ticket');
  });

  it('should return the planning of a specific activity', async () => {
    const res = await request(app).get('/api/activity-planning/4102');
    expect(res.status).toBe(200);
    expect(planning.getPlanning).toHaveBeenCalledWith(4102);
  });

  it('should return 404 for a node that is not a specific activity', async () => {
    db.__chain.first.mockResolvedValue({ id: 3, node_type: NODE_TYPES.BROAD_ACTIVITY });
    expect((await request(app).get('/api/activity-planning/3')).status).toBe(404);
  });

  it('should return 400 for a malformed id', async () => {
    expect((await request(app).get('/api/activity-planning/abc')).status).toBe(400);
  });
});

describe('GET /api/activity-planning/:id/trail', () => {
  it('should return the approval trail of a specific activity', async () => {
    getTrail.mockResolvedValue({ events: [{ label: 'Submitted for approval' }], waiting_for: null });
    const res = await request(app).get('/api/activity-planning/4102/trail');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { events: [{ label: 'Submitted for approval' }], waiting_for: null } });
    expect(getTrail).toHaveBeenCalledWith(SPECIFIC);
  });

  it('should return 404 for a node that is not a specific activity', async () => {
    db.__chain.first.mockResolvedValue({ id: 3, node_type: NODE_TYPES.BROAD_ACTIVITY });
    const res = await request(app).get('/api/activity-planning/3/trail');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(getTrail).not.toHaveBeenCalled();
  });

  it('should return 400 for a malformed id', async () => {
    expect((await request(app).get('/api/activity-planning/abc/trail')).status).toBe(400);
  });
});

describe('PUT /api/activity-planning/:id/cost-lines', () => {
  it('should replace the lines and audit the total', async () => {
    const res = await request(app).put('/api/activity-planning/4102/cost-lines').send({ lines: [LINE] });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1368);
    expect(planning.saveCostLines).toHaveBeenCalledWith(4102, [LINE]);
    expect(audit).toHaveBeenCalledWith(expect.anything(), 'ACTIVITY_COST_LINES_UPDATED', expect.any(String), 4102, { lines: 1, total: 1368 });
  });

  it('should return 403 when the user cannot edit the activity', async () => {
    canEditSpecificActivity.mockResolvedValue({ allowed: false, admin: false });
    const res = await request(app).put('/api/activity-planning/4102/cost-lines').send({ lines: [LINE] });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(planning.saveCostLines).not.toHaveBeenCalled();
  });

  it('should return 400 for a negative amount or a line without description', async () => {
    expect((await request(app).put('/api/activity-planning/4102/cost-lines').send({ lines: [{ ...LINE, amount: -1 }] })).status).toBe(400);
    const res = await request(app).put('/api/activity-planning/4102/cost-lines').send({ lines: [{ ...LINE, description: ' ' }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Describe every cost line');
  });

  it('should return 400 when the service rejects an unknown category', async () => {
    planning.saveCostLines.mockRejectedValue(new ValidationError('Choose an expense category from the list for every line'));
    expect((await request(app).put('/api/activity-planning/4102/cost-lines').send({ lines: [LINE] })).status).toBe(400);
  });
});

describe('PUT /api/activity-planning/:id/screening', () => {
  it('should save the ratings and audit the score', async () => {
    const res = await request(app).put('/api/activity-planning/4102/screening').send({ requires_complex_decision: true, ...RATINGS });
    expect(res.status).toBe(200);
    expect(planning.saveScreening).toHaveBeenCalledWith(4102, { requires_complex_decision: true, ...RATINGS }, 7);
    expect(audit).toHaveBeenCalledWith(expect.anything(), 'ACTIVITY_COMPLEXITY_SCREENED', expect.any(String), 4102,
      { requires_complex_decision: true, total_score: 10, band: 'MODERATE' });
  });

  it('should return 400 for a rating outside 1 to 3 or a missing answer', async () => {
    expect((await request(app).put('/api/activity-planning/4102/screening').send({ requires_complex_decision: true, ...RATINGS, scope_impact: 4 })).status).toBe(400);
    expect((await request(app).put('/api/activity-planning/4102/screening').send({})).status).toBe(400);
  });

  it('should return 404 when the activity does not exist', async () => {
    db.__chain.first.mockResolvedValue(undefined);
    expect((await request(app).put('/api/activity-planning/999/screening').send({ requires_complex_decision: false })).status).toBe(404);
  });
});
