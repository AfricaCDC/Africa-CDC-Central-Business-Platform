// ── POST /api/auth/cbp/accept: CBP Staff Portal SSO handoff (D-20261110-01) ──
//
// The CBP auto-POSTs a form with `staff_sso_jwt` (HS256, signed with CBP's root
// JWT_SECRET). The route logs in the matching pre-provisioned user and bounces
// the browser to the SPA callback with our own tokens in the URL fragment.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../../src/app');
const config = require('../../src/config/env');
const { audit } = require('../../src/middleware/auditLog');
const { verifyToken } = require('@rbm/lib/auth');

const SECRET = 'cbp_root_jwt_secret_for_tests_only_0123456789';
const APP = 'http://localhost:5000';
const chain = sharedDb.__chain;

const USER = { id: 7, email: 'ama@africacdc.org', full_name: 'Ama', status: 'ACTIVE', cbp_id: '42' };

const mint = (claims = {}, secret = SECRET, opts = { expiresIn: '5m' }) =>
  jwt.sign({ staff_id: 42, work_email: 'Ama@AfricaCDC.org', ...claims }, secret, { algorithm: 'HS256', ...opts });

const accept = (body) => request(app).post('/api/auth/cbp/accept').type('form').send(body);

/** Parse the SPA callback fragment out of a 302 Location. */
const fragmentOf = (location) => new URLSearchParams(new URL(location).hash.slice(1));

/** Next `first()` calls answer in order: by cbp_id, then by email. */
const usersFound = (...rows) => rows.forEach((r) => chain.first.mockResolvedValueOnce(r));

beforeEach(() => {
  config.cbp.ssoJwtSecret = SECRET;
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.update.mockReset().mockResolvedValue(1);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  audit.mockClear();
});

const expectLoginError = (res, code) => {
  expect(res.status).toBe(302);
  const loc = new URL(res.headers.location);
  expect(`${loc.origin}${loc.pathname}`).toBe(`${APP}/login`);
  expect(loc.searchParams.get('error')).toBe(code);
  expect(res.headers.location).not.toContain('access_token');
};

describe('POST /api/auth/cbp/accept, feature switch', () => {
  it('should answer 404 when CBP_SSO_JWT_SECRET is unset', async () => {
    config.cbp.ssoJwtSecret = undefined;
    const res = await accept({ staff_sso_jwt: mint() });
    expect(res.status).toBe(404);
  });

  it('should answer 404 when CBP_SSO_JWT_SECRET is empty', async () => {
    config.cbp.ssoJwtSecret = '';
    const res = await accept({ staff_sso_jwt: mint() });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/auth/cbp/accept, sign-in', () => {
  it('should redirect with our tokens in the fragment for a valid token', async () => {
    usersFound(USER);
    const res = await accept({ staff_sso_jwt: mint() });

    expect(res.status).toBe(302);
    const loc = new URL(res.headers.location);
    expect(`${loc.origin}${loc.pathname}`).toBe(`${APP}/auth/microsoft/callback`);
    const frag = fragmentOf(res.headers.location);
    const access = verifyToken(frag.get('access_token'), process.env.JWT_ACCESS_SECRET);
    expect(access.id).toBe(USER.id);
    expect(verifyToken(frag.get('refresh_token'), process.env.JWT_REFRESH_SECRET).id).toBe(USER.id);
    expect(frag.get('expires_in')).toBe(config.jwt.accessTtl);
    expect(frag.has('return_to')).toBe(false);
    expect(audit).toHaveBeenCalledWith(expect.anything(), 'SSO_LOGIN', 'user', USER.id,
      expect.objectContaining({ provider: 'cbp' }), USER.id);
  });

  it('should match by email when no user carries the cbp_id, and link the cbp_id', async () => {
    usersFound(undefined, { ...USER, cbp_id: null });
    const res = await accept({ staff_sso_jwt: mint() });

    expect(res.status).toBe(302);
    expect(fragmentOf(res.headers.location).get('access_token')).toBeTruthy();
    expect(chain.update).toHaveBeenCalledWith({ cbp_id: '42' });
  });

  it('should pass a relative next through as return_to', async () => {
    usersFound(USER);
    const res = await accept({ staff_sso_jwt: mint(), next: '/decide/3?d=approve' });
    expect(fragmentOf(res.headers.location).get('return_to')).toBe('/decide/3?d=approve');
  });

  it('should add the leading slash the CBP launcher strips from next', async () => {
    usersFound(USER);
    const res = await accept({ staff_sso_jwt: mint(), next: 'decide/3?d=approve' });
    expect(fragmentOf(res.headers.location).get('return_to')).toBe('/decide/3?d=approve');
  });

  it.each(['//evil.com', 'https://evil.com/x', '/\\evil.com', '\\evil.com', 'auth/microsoft/callback', '/auth/microsoft/callback'])(
    'should ignore the unsafe next %s',
    async (next) => {
      usersFound(USER);
      const res = await accept({ staff_sso_jwt: mint(), next });
      expect(res.status).toBe(302);
      expect(fragmentOf(res.headers.location).has('return_to')).toBe(false);
    },
  );
});

describe('POST /api/auth/cbp/accept, token rejected', () => {
  it('should refuse a token signed with another secret', async () => {
    const res = await accept({ staff_sso_jwt: mint({}, 'another_secret_another_secret_another_1234') });
    expectLoginError(res, 'sso_cbp_invalid');
    expect(chain.first).not.toHaveBeenCalled();
  });

  it('should refuse an alg:none token', async () => {
    const none = jwt.sign({ staff_id: 42, exp: Math.floor(Date.now() / 1000) + 300 }, '', { algorithm: 'none' });
    expectLoginError(await accept({ staff_sso_jwt: none }), 'sso_cbp_invalid');
  });

  it('should refuse the unsigned base64 token CBP emits when its secret is empty', async () => {
    const payload = { staff_id: 42, work_email: 'ama@africacdc.org', exp: Math.floor(Date.now() / 1000) + 300 };
    const unsigned = Buffer.from(JSON.stringify(payload)).toString('base64');
    expectLoginError(await accept({ staff_sso_jwt: unsigned }), 'sso_cbp_invalid');
  });

  it('should refuse an HS512 token', async () => {
    const hs512 = jwt.sign({ staff_id: 42 }, SECRET, { algorithm: 'HS512', expiresIn: '5m' });
    expectLoginError(await accept({ staff_sso_jwt: hs512 }), 'sso_cbp_invalid');
  });

  it('should refuse an expired token', async () => {
    const res = await accept({ staff_sso_jwt: mint({}, SECRET, { expiresIn: '-10s' }) });
    expectLoginError(res, 'sso_cbp_invalid');
  });

  it('should refuse a token without exp', async () => {
    const noExp = jwt.sign({ staff_id: 42, work_email: 'ama@africacdc.org' }, SECRET, { algorithm: 'HS256' });
    expectLoginError(await accept({ staff_sso_jwt: noExp }), 'sso_cbp_invalid');
  });

  it('should refuse a token without staff_id', async () => {
    const res = await accept({ staff_sso_jwt: mint({ staff_id: undefined }) });
    expectLoginError(res, 'sso_cbp_invalid');
  });

  it('should refuse a request without the form field', async () => {
    expectLoginError(await accept({}), 'sso_cbp_invalid');
  });
});

describe('POST /api/auth/cbp/accept, identity rejected', () => {
  it('should refuse an unknown user and create nobody', async () => {
    const res = await accept({ staff_sso_jwt: mint() });
    expectLoginError(res, 'sso_unknown_user');
    expect(chain.insert).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.anything(), 'SSO_LOGIN_DENIED', 'user', null, expect.anything());
  });

  it('should refuse an inactive user', async () => {
    usersFound({ ...USER, status: 'INACTIVE' });
    expectLoginError(await accept({ staff_sso_jwt: mint() }), 'sso_inactive');
  });

  it('should refuse an email match already linked to another cbp_id', async () => {
    usersFound(undefined, { ...USER, cbp_id: '99' });
    const res = await accept({ staff_sso_jwt: mint() });
    expectLoginError(res, 'sso_unknown_user');
    expect(chain.update).not.toHaveBeenCalled();
  });
});
