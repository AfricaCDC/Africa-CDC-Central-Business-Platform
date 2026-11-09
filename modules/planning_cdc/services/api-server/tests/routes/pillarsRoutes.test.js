// ── pillarsRoutes tests (D-20260714-03) ──

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, email: 'user@africacdc.org' };
    next();
  },
}));

const request = require('supertest');
const app = require('../../src/app');
const chain = sharedDb.__chain;

describe('GET /api/pillars', () => {
  it('should list pillars ordered by sort_order', async () => {
    const rows = [
      { id: 1, name: 'Pillar 1_Reformed & inclusive global health architecture', sort_order: 1 },
      { id: 6, name: 'Crosscuting', sort_order: 6 },
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const res = await request(app).get('/api/pillars');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].name).toContain('Pillar 1');
    expect(res.headers['cache-control']).toContain('max-age=300');
  });
});
