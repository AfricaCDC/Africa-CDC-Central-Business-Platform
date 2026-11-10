// ── SSO deep link from another system (CBP, D-20261015-08) ──
//
// return_to accepts internal SPA paths only (no open redirect); login_hint
// skips the account picker. MSAL is mocked: no network.

const getAuthCodeUrl = jest.fn().mockResolvedValue('https://login.microsoftonline.com/x');
jest.mock('@azure/msal-node', () => ({
  ConfidentialClientApplication: jest.fn().mockImplementation(() => ({ getAuthCodeUrl })),
  LogLevel: { Warning: 2 },
}));

const { ssoEntryOptions, buildAuthRedirect } = require('../../src/services/microsoftAuth');

beforeAll(() => {
  Object.assign(process.env, { MS_TENANT_ID: 't', MS_CLIENT_ID: 'c', MS_CLIENT_SECRET: 's', MS_REDIRECT_URI: 'https://pra.africacdc.org/api/auth/microsoft/callback' });
});
beforeEach(() => getAuthCodeUrl.mockClear());

describe('ssoEntryOptions', () => {
  it('should keep an internal path with its query string', () => {
    expect(ssoEntryOptions({ return_to: '/budget-execution?fy=2026&bu=EPR' }).returnTo).toBe('/budget-execution?fy=2026&bu=EPR');
  });

  it.each(['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', 'dashboard', '/a b', '/auth/microsoft/callback', `/${'a'.repeat(600)}`])(
    'should drop the unsafe return path %s',
    (path) => expect(ssoEntryOptions({ return_to: path }).returnTo).toBeNull(),
  );

  it('should keep a well-formed email hint, lower-cased, and drop anything else', () => {
    expect(ssoEntryOptions({ login_hint: ' A.B@africacdc.org ' }).loginHint).toBe('a.b@africacdc.org');
    expect(ssoEntryOptions({ login_hint: 'x"><script>' }).loginHint).toBeNull();
    expect(ssoEntryOptions({ login_hint: ['a@b.org'] }).loginHint).toBeNull();
    expect(ssoEntryOptions()).toEqual({ returnTo: null, loginHint: null });
  });
});

describe('buildAuthRedirect', () => {
  it('should force the account picker without a hint', async () => {
    await buildAuthRedirect();
    expect(getAuthCodeUrl.mock.calls[0][0]).toMatchObject({ prompt: 'select_account' });
    expect(getAuthCodeUrl.mock.calls[0][0].loginHint).toBeUndefined();
  });

  it('should pass the hint and skip the picker for a deep link', async () => {
    await buildAuthRedirect({ loginHint: 'a@africacdc.org' });
    const req = getAuthCodeUrl.mock.calls[0][0];
    expect(req.loginHint).toBe('a@africacdc.org');
    expect(req.prompt).toBeUndefined();
  });
});
