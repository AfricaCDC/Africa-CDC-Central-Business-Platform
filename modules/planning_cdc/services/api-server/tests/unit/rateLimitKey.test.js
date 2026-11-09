// ── Rate limits counted per signed-in user (D-20261106-11) ──

const express = require('express');
const request = require('supertest');
// The global setup stubs express-rate-limit with a pass-through; this test needs the real one.
const rateLimit = jest.requireActual('express-rate-limit');
const { signAccessToken } = require('@rbm/lib/auth');
const { userOrIpKey } = require('../../src/middleware/rateLimit');

const SECRET = process.env.JWT_ACCESS_SECRET;
const bearer = (payload, options = { expiresIn: '5m' }) => ({ authorization: `Bearer ${signAccessToken(payload, SECRET, options)}` });

describe('userOrIpKey', () => {
  it('should count a valid token against its user', () => {
    expect(userOrIpKey({ headers: bearer({ id: 7, roles: [] }), ip: '10.0.0.1' })).toBe('user:7');
  });

  it('should count by IP without a token', () => {
    expect(userOrIpKey({ headers: {}, ip: '10.0.0.1' })).toBe('10.0.0.1');
  });

  it('should count by IP when the token is forged, so it cannot dodge the limit', () => {
    const forged = { authorization: `Bearer ${signAccessToken({ id: 9 }, 'another-secret', { expiresIn: '5m' })}` };
    expect(userOrIpKey({ headers: forged, ip: '10.0.0.1' })).toBe('10.0.0.1');
  });

  it('should count by IP when the token has expired', () => {
    expect(userOrIpKey({ headers: bearer({ id: 7 }, { expiresIn: -10 }), ip: '10.0.0.1' })).toBe('10.0.0.1');
  });
});

describe('a limiter keyed by user', () => {
  const app = express();
  app.use(rateLimit({ windowMs: 60_000, max: 1, keyGenerator: userOrIpKey, standardHeaders: true, legacyHeaders: false }));
  app.get('/', (_req, res) => res.json({ ok: true }));

  it('should give two users behind the same IP their own quota', async () => {
    expect((await request(app).get('/').set(bearer({ id: 1 }))).status).toBe(200);
    expect((await request(app).get('/').set(bearer({ id: 2 }))).status).toBe(200);
    expect((await request(app).get('/').set(bearer({ id: 1 }))).status).toBe(429);
  });
});
