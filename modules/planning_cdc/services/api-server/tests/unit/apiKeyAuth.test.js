// ── apiKeyAuth unit tests ──
//
// Covers: extractKey, apiKeyAuth middleware (no-key, invalid, scope-missing, success)

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/services/apiKeyService', () => ({
  verifyKey: jest.fn().mockResolvedValue(null),
  KEY_PREFIX: 'cdc_',
}));

const { apiKeyAuth } = require('../../src/middleware/apiKeyAuth');
const { verifyKey } = require('../../src/services/apiKeyService');
const chain = sharedDb.__chain;

function makeReq(overrides = {}) {
  return {
    method: 'GET',
    baseUrl: '/api',
    path: '/data',
    url: '/data',
    ip: '127.0.0.1',
    headers: {},
    query: {},
    ...overrides,
  };
}

function makeRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    on: jest.fn(),
    statusCode: 200,
  };
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  chain.insert.mockReset().mockResolvedValue([1]);
});

describe('apiKeyAuth — no key provided', () => {
  it('returns 401 when no header, no bearer, no query param', async () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    await apiKeyAuth()(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'API_KEY_REQUIRED' }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe('apiKeyAuth — key extraction', () => {
  it('extracts key from X-API-Key header', async () => {
    verifyKey.mockResolvedValueOnce({ id: 1, scopes: [] });
    const req = makeReq({ headers: { 'x-api-key': 'test-key-123' } });
    const res = makeRes();
    const next = jest.fn();
    await apiKeyAuth()(req, res, next);
    expect(verifyKey).toHaveBeenCalledWith('test-key-123');
    expect(next).toHaveBeenCalled();
  });

  it('extracts key from Bearer Authorization header', async () => {
    verifyKey.mockResolvedValueOnce({ id: 2, scopes: [] });
    const req = makeReq({ headers: { authorization: 'Bearer my-secret-key' } });
    const res = makeRes();
    const next = jest.fn();
    await apiKeyAuth()(req, res, next);
    expect(verifyKey).toHaveBeenCalledWith('my-secret-key');
    expect(next).toHaveBeenCalled();
  });

  it('extracts key from Basic Authorization header (password half)', async () => {
    verifyKey.mockResolvedValueOnce({ id: 3, scopes: [] });
    // base64('user:secret-key')
    const encoded = Buffer.from('user:secret-key').toString('base64');
    const req = makeReq({ headers: { authorization: `Basic ${encoded}` } });
    const res = makeRes();
    const next = jest.fn();
    await apiKeyAuth()(req, res, next);
    expect(verifyKey).toHaveBeenCalledWith('secret-key');
    expect(next).toHaveBeenCalled();
  });

  it('extracts key from ?api_key query param', async () => {
    verifyKey.mockResolvedValueOnce({ id: 4, scopes: [] });
    const req = makeReq({ query: { api_key: 'query-key' } });
    const res = makeRes();
    const next = jest.fn();
    await apiKeyAuth()(req, res, next);
    expect(verifyKey).toHaveBeenCalledWith('query-key');
    expect(next).toHaveBeenCalled();
  });
});

describe('apiKeyAuth — invalid key', () => {
  it('returns 401 when verifyKey returns null', async () => {
    verifyKey.mockResolvedValueOnce(null);
    const req = makeReq({ headers: { 'x-api-key': 'bad-key' } });
    const res = makeRes();
    const next = jest.fn();
    await apiKeyAuth()(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'API_KEY_INVALID' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when verifyKey throws', async () => {
    verifyKey.mockRejectedValueOnce(new Error('DB error'));
    const req = makeReq({ headers: { 'x-api-key': 'some-key' } });
    const res = makeRes();
    const next = jest.fn();
    await apiKeyAuth()(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('apiKeyAuth — scope checking', () => {
  it('returns 403 when key lacks required scope', async () => {
    verifyKey.mockResolvedValueOnce({ id: 5, scopes: ['read'] });
    const req = makeReq({ headers: { 'x-api-key': 'limited-key' } });
    const res = makeRes();
    const next = jest.fn();
    await apiKeyAuth(['read', 'write'])(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'API_KEY_SCOPE_MISSING' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() when key has all required scopes', async () => {
    verifyKey.mockResolvedValueOnce({ id: 6, scopes: ['read', 'write', 'admin'] });
    const req = makeReq({ headers: { 'x-api-key': 'full-key' } });
    const res = makeRes();
    const next = jest.fn();
    await apiKeyAuth(['read', 'write'])(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('calls next() when no scopes required', async () => {
    verifyKey.mockResolvedValueOnce({ id: 7, scopes: [] });
    const req = makeReq({ headers: { 'x-api-key': 'any-key' } });
    const res = makeRes();
    const next = jest.fn();
    await apiKeyAuth()(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('apiKeyAuth — success', () => {
  it('sets req.apiKey and registers finish listener for usage logging', async () => {
    verifyKey.mockResolvedValueOnce({ id: 8, scopes: ['read'] });
    const req = makeReq({ headers: { 'x-api-key': 'valid-key' } });
    const res = makeRes();
    const next = jest.fn();
    await apiKeyAuth(['read'])(req, res, next);
    expect(req.apiKey).toEqual({ id: 8, scopes: ['read'] });
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    expect(next).toHaveBeenCalled();
  });

  it('logUsage is called on response finish without throwing', async () => {
    verifyKey.mockResolvedValueOnce({ id: 9, scopes: [] });
    const req = makeReq({ headers: { 'x-api-key': 'valid-key' }, url: '/data?foo=bar' });
    const res = makeRes();
    const next = jest.fn();
    await apiKeyAuth()(req, res, next);
    // Trigger the finish listener
    const [, finishCb] = res.on.mock.calls[0];
    chain.insert.mockResolvedValueOnce([1]);
    expect(() => finishCb()).not.toThrow();
  });
});

// ── The key never lands in the usage log (D-20261108-02) ──
describe('apiKeyAuth — usage log', () => {
  it('should drop api_key from the logged query string', async () => {
    verifyKey.mockResolvedValueOnce({ id: 3, scopes: ['report_export:read'] });
    const req = makeReq({ url: '/data?api_key=cdc_secret&fiscal_year=2026', query: { api_key: 'cdc_secret', fiscal_year: '2026' } });
    const res = makeRes();
    await apiKeyAuth(['report_export:read'])(req, res, jest.fn());
    const onFinish = res.on.mock.calls.find(([evt]) => evt === 'finish')[1];
    onFinish();
    const row = chain.insert.mock.calls[0][0];
    expect(row.query).toBe('fiscal_year=2026');
    expect(JSON.stringify(row)).not.toContain('cdc_secret');
  });

  it('should drop a key sent under another parameter name', async () => {
    verifyKey.mockResolvedValueOnce({ id: 3, scopes: [] });
    const req = makeReq({ headers: { 'x-api-key': 'cdc_secret' }, url: '/workplan?key=cdc_secret&year=2026', query: { key: 'cdc_secret', year: '2026' } });
    const res = makeRes();
    await apiKeyAuth()(req, res, jest.fn());
    res.on.mock.calls.find(([evt]) => evt === 'finish')[1]();
    const row = chain.insert.mock.calls[0][0];
    expect(row.query).toBe('year=2026');
  });
});
