const request = require('supertest');
const express = require('express');

// Chainable knex mock: captures update()/insert() args and resolves rows.
const captured = { update: null, insert: null };
const makeChain = () => {
  const chain = {};
  chain.where = jest.fn(() => chain);
  chain.first = jest.fn().mockResolvedValue({ id: 42, node_type: 'OUTCOME_INDICATOR' });
  chain.update = jest.fn((patch) => { captured.update = patch; return Promise.resolve(1); });
  chain.insert = jest.fn((row) => { captured.insert = row; return Promise.resolve([99]); });
  chain.del = jest.fn(() => Promise.resolve(1));
  return chain;
};
const knexMock = jest.fn(() => makeChain());
knexMock.transaction = jest.fn(async (cb) => cb(() => makeChain()));

jest.mock('../../src/routes/plan-nodes/_helpers', () => ({
  knex: knexMock,
  log: { error: jest.fn(), info: jest.fn() },
  STATUSES: { APPROVED: 'APPROVED' },
  enrichNode: jest.fn(async (row) => row),
  canEditIndicators: jest.fn().mockResolvedValue(true),
  envelopeError: (res, code, message) => res.status(code).json({ success: false, message, code: 'ERR' }),
}));
jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => { req.user = { id: 1 }; next(); },
}));
jest.mock('../../src/middleware/rbacMiddleware', () => ({
  authorize: () => (_req, _res, next) => next(),
}));

const indicatorRouter = require('../../src/routes/plan-nodes/indicators');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/plan-nodes', indicatorRouter);
  return app;
}

describe('plan-nodes indicators — is_big_ticket whitelist', () => {
  beforeEach(() => { captured.update = null; captured.insert = null; });

  it('should persist is_big_ticket=1 on PUT when body is truthy', async () => {
    const res = await request(makeApp())
      .put('/api/plan-nodes/indicator/42')
      .send({ is_big_ticket: true });
    expect(res.status).toBe(200);
    expect(captured.update.is_big_ticket).toBe(1);
  });

  it('should persist is_big_ticket=0 on PUT when body is falsy', async () => {
    const res = await request(makeApp())
      .put('/api/plan-nodes/indicator/42')
      .send({ is_big_ticket: false });
    expect(res.status).toBe(200);
    expect(captured.update.is_big_ticket).toBe(0);
  });

  it('should persist is_big_ticket on POST create', async () => {
    const res = await request(makeApp())
      .post('/api/plan-nodes/indicator')
      .send({ indicator_name: 'X', indicator_code: 'X.1', tier_id: 3, is_big_ticket: true });
    expect(res.status).toBe(201);
    expect(captured.insert.is_big_ticket).toBe(1);
  });
});
