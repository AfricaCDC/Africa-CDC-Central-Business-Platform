// ── requestLogger keeps credentials out of audit_events (D-20261108-02) ──

jest.mock('../../src/services/errorAlertService', () => ({ notifyServerError: jest.fn() }));

const db = require('../../src/config/db');
// tests/setup.js replaces requestLogger with a pass-through: test the real one.
const requestLogger = jest.requireActual('../../src/middleware/requestLogger');

function run(req, statusCode = 200) {
  const res = { statusCode, end: jest.fn() };
  requestLogger()(req, res, jest.fn());
  res.end();
  return JSON.parse(db.__chain.insert.mock.calls[0][0].details);
}

const baseReq = (over) => ({ method: 'GET', path: '/api/public/exports/quarterly-report', headers: {}, ip: '41.0.0.9', ...over });

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.insert.mockReset().mockReturnValue({ catch: jest.fn() });
});

describe('requestLogger redaction', () => {
  it('should redact a public API key sent as ?api_key=', () => {
    const details = run(baseReq({ query: { api_key: 'cdc_secret', fiscal_year: '2026' } }), 401);
    expect(details.query).toEqual({ api_key: '***REDACTED***', fiscal_year: '2026' });
  });

  it('should redact a key sent under another parameter name', () => {
    const details = run(baseReq({ query: { PRA_WORKPLAN_API_KEY: 'cdc_secret', year: '2026' } }), 401);
    expect(details.query).toEqual({ PRA_WORKPLAN_API_KEY: '***REDACTED***', year: '2026' });
  });

  it('should redact the Microsoft sign-in code and state of the SSO callback', () => {
    const details = run(baseReq({ path: '/api/auth/microsoft/callback', query: { code: 'auth-code', state: 'abc' } }));
    expect(details.query).toEqual({ code: '***REDACTED***', state: '***REDACTED***' });
  });

  it('should keep a body field named code (an indicator code is not a secret)', () => {
    const details = run(baseReq({ method: 'POST', path: '/api/plan-nodes', query: {}, body: { code: '1.2.3', title: 'x' } }));
    expect(details.body).toEqual({ code: '1.2.3', title: 'x' });
    expect(details.query).toBeUndefined();
  });

  it('should record the client IP resolved by express, not the X-Forwarded-For header', () => {
    run(baseReq({ query: {}, headers: { 'x-forwarded-for': '6.6.6.6, 41.0.0.9' } }));
    expect(db.__chain.insert.mock.calls[0][0].ip_address).toBe('41.0.0.9');
  });
});
