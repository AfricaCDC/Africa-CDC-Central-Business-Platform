// ── Microsoft sign-in: right tenant, no account takeover (D-20261108-02) ──

const TENANT = '11111111-2222-3333-4444-555555555555';
const acquireTokenByCode = jest.fn();
jest.mock('@azure/msal-node', () => ({
  ConfidentialClientApplication: jest.fn().mockImplementation(() => ({ acquireTokenByCode })),
  LogLevel: { Warning: 2 },
}));

const db = require('../../src/config/db');
const { handleCallback } = require('../../src/services/microsoftAuth');
const { lookupSsoUser } = require('../../src/controllers/authController');

beforeAll(() => {
  Object.assign(process.env, { MS_TENANT_ID: TENANT, MS_CLIENT_ID: 'c', MS_CLIENT_SECRET: 's', MS_REDIRECT_URI: 'https://pra.africacdc.org/api/auth/microsoft/callback' });
});

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.first.mockReset().mockResolvedValue(undefined);
});

const callbackReq = { query: { code: 'c0de', state: 'st' } };
const claims = (over) => ({ idTokenClaims: { nonce: 'n', oid: 'oid-1', email: 'Ama@AfricaCDC.org', name: 'Ama', tid: TENANT, ...over } });

describe('handleCallback tenant check', () => {
  it('should accept an id_token of the Africa CDC tenant', async () => {
    acquireTokenByCode.mockResolvedValueOnce(claims());
    const profile = await handleCallback(callbackReq, 'st', 'n');
    expect(profile).toMatchObject({ oid: 'oid-1', email: 'ama@africacdc.org', tenantId: TENANT });
    // msal-node 7 refuses the exchange without the expected nonce.
    expect(acquireTokenByCode).toHaveBeenCalledWith(expect.objectContaining({ code: 'c0de', nonce: 'n' }));
  });

  it('should refuse an id_token without the nonce we sent', async () => {
    acquireTokenByCode.mockResolvedValueOnce(claims({ nonce: undefined }));
    await expect(handleCallback(callbackReq, 'st', 'n')).rejects.toThrow('Nonce mismatch');
  });

  it('should refuse an id_token with another nonce', async () => {
    acquireTokenByCode.mockResolvedValueOnce(claims({ nonce: 'other' }));
    await expect(handleCallback(callbackReq, 'st', 'n')).rejects.toThrow('Nonce mismatch');
  });

  it('should refuse an id_token issued by another tenant', async () => {
    acquireTokenByCode.mockResolvedValueOnce(claims({ tid: '99999999-0000-0000-0000-000000000000' }));
    await expect(handleCallback(callbackReq, 'st', 'n')).rejects.toThrow('another tenant');
  });
});

describe('lookupSsoUser', () => {
  const profile = { oid: 'oid-1', email: 'ama@africacdc.org' };

  it('should find the account linked to the Microsoft identity first', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 3, microsoft_oid: 'oid-1' });
    expect(await lookupSsoUser(profile)).toEqual({ user: { id: 3, microsoft_oid: 'oid-1' } });
  });

  it('should link a pre-provisioned account on its first sign-in', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id: 3, microsoft_oid: null });
    const { user } = await lookupSsoUser(profile);
    expect(user.id).toBe(3);
    expect(db.__chain.update).toHaveBeenCalledWith({ microsoft_oid: 'oid-1' });
  });

  it('should refuse an account already linked to another Microsoft identity', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ id: 3, microsoft_oid: 'oid-OTHER' });
    expect(await lookupSsoUser(profile)).toEqual({ user: null, reason: 'oid_mismatch' });
    expect(db.__chain.update).not.toHaveBeenCalled();
  });

  it('should report an unknown email as not provisioned', async () => {
    expect(await lookupSsoUser(profile)).toEqual({ user: null, reason: 'not_provisioned' });
  });
});
