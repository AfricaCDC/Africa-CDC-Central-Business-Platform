// ── /api/auth token-related routes (supertest) ──
//
// Covers:
//   POST /api/auth/refresh   — exchange refresh token for fresh access token
//   POST /api/auth/logout    — invalidates client-side, audit only
//   GET  /api/auth/me        — fresh hydrated user payload
//   GET  /api/auth/profile   — echo of JWT payload
//
// All four use the shared knex chain pattern + real JWTs minted with the
// test secrets installed in tests/setup.js so the verifier path runs
// end-to-end.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

const request = require('supertest');
const app = require('../../src/app');
const { signRefreshToken, signAccessToken } = require('@rbm/lib/auth');

const chain = sharedDb.__chain;

function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.del.mockReset().mockResolvedValue(1);
  chain.delete.mockReset().mockResolvedValue(1);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  const reentrant = [
    'select', 'from', 'where', 'whereIn', 'whereNot', 'whereNotNull',
    'whereNull', 'andWhere', 'orWhere', 'orderBy', 'groupBy',
    'limit', 'offset', 'returning', 'join', 'leftJoin', 'rightJoin',
    'innerJoin', 'distinct', 'count', 'sum', 'pluck', 'modify', 'clone',
  ];
  reentrant.forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
}

beforeEach(() => {
  resetChain();
});

function mintRefreshToken(payload, secret = process.env.JWT_REFRESH_SECRET, opts = {}) {
  return signRefreshToken(payload, secret, opts);
}

function mintAccessToken(payload = { id: 1, email: 'x@y.com', roles: [] }) {
  return signAccessToken(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: '1h' });
}

// ─────────────────────────────────────────────────────────────────
//   POST /api/auth/refresh
// ─────────────────────────────────────────────────────────────────
//
// Branches in authController.refresh:
//   1. Missing/invalid refreshToken in body → 400 BAD_REQUEST
//   2. Token verification fails (signature) → 401 TOKEN_INVALID
//   3. Token expired                        → 401 TOKEN_EXPIRED
//   4. Decoded but type !== 'refresh'       → 401 TOKEN_INVALID
//   5. User no longer in DB                 → 401 UNAUTHORIZED
//   6. User status !== 'ACTIVE'             → 401 UNAUTHORIZED
//   7. Happy path                            → 200 + fresh accessToken
describe('POST /api/auth/refresh', () => {
  it('should return 400 when refreshToken is missing entirely', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 when refreshToken is the wrong type (number)', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 12345 });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 when refreshToken is too short for the schema', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'tiny' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 when the token signature is invalid', async () => {
    // Sign with the WRONG secret so verify fails.
    const bogus = mintRefreshToken(
      { id: 1, type: 'refresh' },
      'totally-wrong-secret-32-chars-long-xx'
    );
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: bogus });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toMatch(/TOKEN_INVALID|UNAUTHORIZED/);
  });

  it('should return 401 TOKEN_EXPIRED when the token has expired', async () => {
    const expired = mintRefreshToken(
      { id: 1, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '-1s' }
    );
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: expired });
    expect(res.status).toBe(401);
    expect(res.body.code).toMatch(/TOKEN_EXPIRED/);
  });

  it('should return 401 when the token is not of type "refresh"', async () => {
    // Mint an access-shaped token (no `type: 'refresh'` claim) using the
    // refresh secret so verify passes — controller should still reject it.
    const wrongType = signAccessToken(
      { id: 1, email: 'x@y.com' },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '1h' }
    );
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: wrongType });
    expect(res.status).toBe(401);
    expect(res.body.code).toMatch(/TOKEN_INVALID|UNAUTHORIZED/);
  });

  it('should return 401 when the user no longer exists', async () => {
    chain.first.mockResolvedValueOnce(undefined);
    const valid = mintRefreshToken({ id: 999, type: 'refresh' });
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: valid });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 when the user exists but is no longer ACTIVE', async () => {
    chain.first.mockResolvedValueOnce({ id: 1, status: 'DISABLED' });
    const valid = mintRefreshToken({ id: 1, type: 'refresh' });
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: valid });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 200 + fresh accessToken on happy path', async () => {
    chain.first.mockResolvedValueOnce({
      id: 1,
      email: 'lenny@africacdc.org',
      status: 'ACTIVE',
      business_unit_id: 1,
    });
    chain.then.mockImplementationOnce((r) =>
      Promise.resolve([{ code: 'RBM_ADMIN', permissions: [] }]).then(r)
    );

    const valid = mintRefreshToken({ id: 1, type: 'refresh' });
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: valid });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.length).toBeGreaterThan(20);
    expect(res.body.token).toBe(res.body.accessToken); // back-compat
    expect(res.body).toHaveProperty('expiresIn');
  });
});

// ─────────────────────────────────────────────────────────────────
//   POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────
describe('POST /api/auth/logout', () => {
  it('should return 401 when no Authorization header is provided', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 when the bearer token is malformed', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('should return 401 when the bearer token has expired', async () => {
    const expired = signAccessToken(
      { id: 1 },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '-1s' }
    );
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('should return 401 when the token is signed with the wrong secret', async () => {
    const wrongSig = signAccessToken(
      { id: 1 },
      'wrong-secret-at-least-32-chars-long-aaa',
      { expiresIn: '1h' }
    );
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${wrongSig}`);
    expect(res.status).toBe(401);
  });

  it('should return 200 { success: true } on a valid bearer', async () => {
    const token = mintAccessToken({
      id: 7,
      email: 'lenny@africacdc.org',
      roles: ['RBM_ADMIN'],
    });
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

// ─────────────────────────────────────────────────────────────────
//   GET /api/auth/me
// ─────────────────────────────────────────────────────────────────
describe('GET /api/auth/me', () => {
  it('should return 401 without a bearer token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 with a tampered token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer xxx.yyy.zzz');
    expect(res.status).toBe(401);
  });

  it('should return 401 with an expired token', async () => {
    const expired = signAccessToken(
      { id: 1 },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '-1s' }
    );
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('should return 404 when the user has been deleted between login and now', async () => {
    chain.first.mockResolvedValueOnce(undefined);
    const token = mintAccessToken({ id: 999, email: 'gone@x.com', roles: [] });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it('should return the hydrated user payload on happy path', async () => {
    chain.first
      .mockResolvedValueOnce({
        id: 7,
        email: 'lenny@africacdc.org',
        full_name: 'Lenny Tandou',
        status: 'ACTIVE',
        business_unit_id: 3,
        division_code: 'DIG',
      })
      .mockResolvedValueOnce({ id: 3, code: 'BU-DIG', name: 'Digital Health' })
      .mockResolvedValueOnce({ code: 'DIG', division_name: 'Digital', directorate: 'DIR-1' });

    chain.then.mockImplementationOnce((r) =>
      Promise.resolve([{ code: 'RBM_ADMIN', permissions: [] }]).then(r)
    );

    const token = mintAccessToken({
      id: 7,
      email: 'lenny@africacdc.org',
      roles: ['RBM_ADMIN'],
    });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: 7,
      email: 'lenny@africacdc.org',
      full_name: 'Lenny Tandou',
      roles: ['RBM_ADMIN'],
      bu_code: 'BU-DIG',
      bu_name: 'Digital Health',
      division_code: 'DIG',
      division_name: 'Digital',
      directorate: 'DIR-1',
    });
  });

  it('should return null bu/division fields when the user has neither', async () => {
    chain.first.mockResolvedValueOnce({
      id: 8,
      email: 'orphan@africacdc.org',
      full_name: 'Orphan',
      status: 'ACTIVE',
      business_unit_id: null,
      division_code: null,
    });
    chain.then.mockImplementationOnce((r) =>
      Promise.resolve([]).then(r)
    );

    const token = mintAccessToken({ id: 8, email: 'orphan@africacdc.org', roles: [] });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.bu_code).toBeNull();
    expect(res.body.user.division_code).toBeNull();
    expect(res.body.user.directorate).toBeNull();
    expect(res.body.user.roles).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────
//   GET /api/auth/profile  (legacy SPA endpoint — echoes JWT payload)
// ─────────────────────────────────────────────────────────────────
describe('GET /api/auth/profile', () => {
  it('should return 401 without a bearer', async () => {
    const res = await request(app).get('/api/auth/profile');
    expect(res.status).toBe(401);
  });

  it('should return 401 with an expired bearer', async () => {
    const expired = signAccessToken(
      { id: 1 },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '-1s' }
    );
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('should echo the JWT payload back on success', async () => {
    const token = mintAccessToken({
      id: 7,
      email: 'lenny@africacdc.org',
      roles: ['RBM_ADMIN'],
      bu_id: 3,
    });
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: 7,
      email: 'lenny@africacdc.org',
      roles: ['RBM_ADMIN'],
      bu_id: 3,
    });
  });
});
