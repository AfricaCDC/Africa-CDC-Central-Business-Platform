// ── GET / PUT /api/me/tour (D-20261105-16) ──

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ success: false, message: 'Sign in', code: 'UNAUTHORIZED' });
    req.user = { id: 7 };
    return next();
  },
}));

const request = require('supertest');
const db = require('../../src/config/db');
const app = require('../../src/app');

const AUTH = { authorization: 'Bearer t' };

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.first.mockReset().mockResolvedValue({ tour_version_seen: '1.3' });
  db.__chain.update.mockReset().mockResolvedValue(1);
});

describe('/api/me/tour', () => {
  it('should answer 401 without a session', async () => {
    expect((await request(app).get('/api/me/tour')).status).toBe(401);
    expect((await request(app).put('/api/me/tour').send({ version: '1.3' })).status).toBe(401);
  });

  it('should return the version the caller has seen', async () => {
    const res = await request(app).get('/api/me/tour').set(AUTH);
    expect(res.body).toEqual({ success: true, data: { seen_version: '1.3' } });
    expect(db.__chain.where).toHaveBeenCalledWith('id', 7);
  });

  it('should return null for a user who never took the tour', async () => {
    db.__chain.first.mockResolvedValue({ tour_version_seen: null });
    expect((await request(app).get('/api/me/tour').set(AUTH)).body.data).toEqual({ seen_version: null });
  });

  it('should record the version finished or skipped, for the caller only', async () => {
    const res = await request(app).put('/api/me/tour').set(AUTH).send({ version: '1.4' });
    expect(res.status).toBe(200);
    expect(db.__chain.where).toHaveBeenCalledWith('id', 7);
    expect(db.__chain.update).toHaveBeenCalledWith({ tour_version_seen: '1.4', tour_outcome: null });
  });

  it('should record how the tour ended (D-20261106-03)', async () => {
    await request(app).put('/api/me/tour').set(AUTH).send({ version: '1.4', outcome: 'SKIPPED' });
    expect(db.__chain.update).toHaveBeenCalledWith({ tour_version_seen: '1.4', tour_outcome: 'SKIPPED' });
  });

  it('should answer 400 for an unknown outcome', async () => {
    const res = await request(app).put('/api/me/tour').set(AUTH).send({ version: '1.4', outcome: 'MAYBE' });
    expect(res.status).toBe(400);
    expect(db.__chain.update).not.toHaveBeenCalled();
  });

  it('should answer 400 for a version that is not like 1.3', async () => {
    for (const version of ['', 'abc', '1', '1.2.3', '<script>']) {
      const res = await request(app).put('/api/me/tour').set(AUTH).send({ version });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    }
    expect(db.__chain.update).not.toHaveBeenCalled();
  });
});
