// ── GET /api/dashboard/activity-progress (D-20261015-06) ──
//
// Real implementation signal for the dashboards: specific activities by
// activity-report state. Service mocked for the route; summarize() is pure.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    if (req.headers['x-anon']) return _res.status(401).json({ success: false, message: 'Unauthorized', code: 'UNAUTHORIZED' });
    req.user = { id: 1, email: 'me@africacdc.org' };
    return next();
  },
}));
jest.mock('../../src/services/dashboard/activityProgress', () => ({
  ...jest.requireActual('../../src/services/dashboard/activityProgress'),
  activityProgress: jest.fn(),
}));

const request = require('supertest');
const progress = require('../../src/services/dashboard/activityProgress');
const app = require('../../src/app');

const { summarize } = jest.requireActual('../../src/services/dashboard/activityProgress');

beforeEach(() => {
  jest.clearAllMocks();
  progress.activityProgress.mockResolvedValue({ total: 4, approved: 1, in_review: 1, draft: 1, not_reported: 1, reported_pct: 50 });
});

describe('GET /api/dashboard/activity-progress', () => {
  it('should return the counts of the year and business unit', async () => {
    const res = await request(app).get('/api/dashboard/activity-progress?fiscal_year=2026&division=EPR');
    expect(res.status).toBe(200);
    expect(res.body.data.reported_pct).toBe(50);
    expect(progress.activityProgress).toHaveBeenCalledWith({ fiscalYear: '2026', division: 'EPR' });
  });

  it('should return 400 on a bad year', async () => {
    expect((await request(app).get('/api/dashboard/activity-progress?fiscal_year=26')).status).toBe(400);
  });

  it('should return 401 without a session', async () => {
    expect((await request(app).get('/api/dashboard/activity-progress').set('x-anon', '1')).status).toBe(401);
  });
});

describe('summarize', () => {
  it('should count each activity once, by its best report state', () => {
    const r = summarize([
      { approved: 1, in_review: 1, draft: 1 },
      { approved: 0, in_review: 1, draft: 1 },
      { approved: 0, in_review: 0, draft: 1 },
      { approved: 0, in_review: 0, draft: 0 },
    ]);
    expect(r).toEqual({ total: 4, approved: 1, in_review: 1, draft: 1, not_reported: 1, reported_pct: 50 });
  });

  it('should give no rate without activities', () => {
    expect(summarize([]).reported_pct).toBeNull();
  });
});
