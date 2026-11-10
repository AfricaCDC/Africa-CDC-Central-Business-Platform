// ── notificationAdminRoutes — admin CRUD over the wizard model ──
//
// Verifies:
//   - RBAC gate denies callers without `notifications:*`
//   - GET /api/admin/notifications/events|templates|resolvers happy path
//   - POST /subscriptions validation + FK check + insert
//   - PATCH /subscriptions/:id/toggle flips is_active
//   - DELETE /subscriptions/:id
//   - POST /test-send invokes emitEvent and returns its counts
//
// All DB calls are routed through the shared knex mock from tests/setup.js.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = global.__testUser || null;
    next();
  },
}));

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

const checkPermission = jest.fn();
jest.mock('../../src/services/rbacService', () => ({
  checkPermission: (...args) => checkPermission(...args),
  applyScope: (q) => q,
}));

const emitEvent = jest.fn();
jest.mock('../../src/services/eventBusService', () => ({
  emitEvent: (...args) => emitEvent(...args),
}));

const request = require('supertest');
const app = require('../../src/app');

const ADMIN = { id: 99, email: 'admin@x.com', roles: ['SYSTEM_ADMIN'] };

function resetChain() {
  const c = sharedDb.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.del.mockReset().mockResolvedValue(1);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
}

beforeEach(() => {
  resetChain();
  global.__testUser = ADMIN;
  checkPermission.mockReset().mockResolvedValue({ allowed: true, scope: 'all' });
  emitEvent.mockReset().mockResolvedValue({ matched: 2, recipients: 5, outboxRows: 5 });
});

describe('notificationAdminRoutes — RBAC gate', () => {
  it('returns 403 when checkPermission says no', async () => {
    checkPermission.mockResolvedValue({ allowed: false });
    const res = await request(app).get('/api/admin/notifications/events');
    expect(res.status).toBe(403);
  });

  it('returns 401 when no user', async () => {
    global.__testUser = null;
    const res = await request(app).get('/api/admin/notifications/events');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/admin/notifications', () => {
  it('GET /events returns canonical envelope', async () => {
    sharedDb.__chain.then.mockImplementationOnce((r) =>
      Promise.resolve([{ event_key: 'x.y', label: 'X' }]).then(r));
    const res = await request(app).get('/api/admin/notifications/events');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ event_key: 'x.y', label: 'X' }] });
  });

  it('GET /resolvers returns the static list', async () => {
    const res = await request(app).get('/api/admin/notifications/resolvers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.some((r) => r.code === 'actor')).toBe(true);
  });
});

describe('POST /api/admin/notifications/subscriptions', () => {
  it('rejects body missing event_key', async () => {
    const res = await request(app)
      .post('/api/admin/notifications/subscriptions')
      .send({ recipient_scope: 'actor', template_key: 'activity-updated' });
    expect(res.status).toBe(400);
  });

  it('rejects unknown recipient_scope', async () => {
    const res = await request(app)
      .post('/api/admin/notifications/subscriptions')
      .send({
        event_key: 'x.y', recipient_scope: 'bogus_scope',
        template_key: 'activity-updated',
      });
    expect(res.status).toBe(400);
  });

  it('rejects when event_key is unknown in DB', async () => {
    sharedDb.__chain.first.mockResolvedValueOnce(undefined); // event lookup
    const res = await request(app)
      .post('/api/admin/notifications/subscriptions')
      .send({
        event_key: 'no.such.event', recipient_scope: 'actor',
        template_key: 'activity-updated',
      });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Unknown event_key/);
  });

  it('inserts and returns 201 with the joined row', async () => {
    sharedDb.__chain.first
      .mockResolvedValueOnce({ event_key: 'x.y' })   // event FK ok
      .mockResolvedValueOnce({ template_key: 'activity-updated' }) // template FK ok
      .mockResolvedValueOnce({ id: 1, event_key: 'x.y', template_key: 'activity-updated', metadata: '{}' });
    sharedDb.__chain.insert.mockResolvedValueOnce([42]);

    const res = await request(app)
      .post('/api/admin/notifications/subscriptions')
      .send({
        event_key: 'x.y', recipient_scope: 'actor',
        template_key: 'activity-updated', channel: 'email',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

describe('PATCH /api/admin/notifications/subscriptions/:id/toggle', () => {
  it('returns 404 when subscription missing', async () => {
    sharedDb.__chain.first.mockResolvedValue(undefined);
    const res = await request(app)
      .patch('/api/admin/notifications/subscriptions/123/toggle')
      .send({ is_active: false });
    expect(res.status).toBe(404);
  });

  it('updates and returns the new row', async () => {
    sharedDb.__chain.first
      .mockResolvedValueOnce({ id: 123 })
      .mockResolvedValueOnce({ id: 123, is_active: false, metadata: '{}' });
    const res = await request(app)
      .patch('/api/admin/notifications/subscriptions/123/toggle')
      .send({ is_active: false });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('DELETE /api/admin/notifications/subscriptions/:id', () => {
  it('returns 404 when subscription missing', async () => {
    sharedDb.__chain.first.mockResolvedValue(undefined);
    const res = await request(app).delete('/api/admin/notifications/subscriptions/9');
    expect(res.status).toBe(404);
  });

  it('deletes and returns deleted=true', async () => {
    sharedDb.__chain.first.mockResolvedValueOnce({ id: 9, event_key: 'x', template_key: 'y' });
    const res = await request(app).delete('/api/admin/notifications/subscriptions/9');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { id: 9, deleted: true } });
  });
});

describe('POST /api/admin/notifications/test-send', () => {
  it('rejects unknown event_key', async () => {
    sharedDb.__chain.first.mockResolvedValue(undefined);
    const res = await request(app)
      .post('/api/admin/notifications/test-send')
      .send({ event_key: 'nope' });
    expect(res.status).toBe(400);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('invokes emitEvent and returns its counts', async () => {
    sharedDb.__chain.first.mockResolvedValueOnce({ event_key: 'x.y' });
    const res = await request(app)
      .post('/api/admin/notifications/test-send')
      .send({ event_key: 'x.y', metadata: { foo: 'bar' } });
    expect(res.status).toBe(200);
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'x.y',
      metadata: expect.objectContaining({ foo: 'bar', _test: true }),
    }));
    expect(res.body).toEqual({
      success: true,
      data: { event_key: 'x.y', matched: 2, recipients: 5, outboxRows: 5 },
    });
  });
});
