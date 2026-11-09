// ── POST /api/admin/import-cbp-users route tests (D-20260713-01) ──
//
// Covers: success envelope + audit, dry run (no audit), CBP failure -> 502
// with a neutral message, concurrent run -> 409, and RBAC denial -> 403.

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, email: 'admin@africacdc.org' };
    next();
  },
}));

jest.mock('../../src/middleware/auditLog', () => ({
  audit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(() => Promise.resolve({ allowed: true, scope: 'all' })),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: true, denies: [] }),
}));

jest.mock('../../src/services/cbpImportService', () => ({
  importCbpUsers: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const { importCbpUsers } = require('../../src/services/cbpImportService');
const { audit } = require('../../src/middleware/auditLog');
const rbacService = require('../../src/services/rbacService');

const URL = '/api/admin/import-cbp-users';
const SUMMARY = { fetched: 461, eligible: 439, inserted: 82, updated: 300, skipped: 57, failed: 0, dryRun: false, sample: [], failures: [] };

beforeEach(() => {
  jest.clearAllMocks();
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  importCbpUsers.mockResolvedValue(SUMMARY);
});

describe('POST /api/admin/import-cbp-users', () => {
  it('should return the run summary in the success envelope and write an audit row', async () => {
    const res = await request(app).post(URL).send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: SUMMARY });
    expect(importCbpUsers).toHaveBeenCalledWith({ dryRun: false });
    expect(audit).toHaveBeenCalledWith(expect.anything(), 'CBP_USERS_IMPORT', 'user', null,
      { inserted: 82, updated: 300, skipped: 57 });
  });

  it('should pass a custom domain through and skip the audit row on a dry run', async () => {
    importCbpUsers.mockResolvedValueOnce({ ...SUMMARY, dryRun: true });
    const res = await request(app).post(URL).send({ dryRun: true, domain: 'example.org' });
    expect(res.status).toBe(200);
    expect(importCbpUsers).toHaveBeenCalledWith({ dryRun: true, domain: 'example.org' });
    expect(audit).not.toHaveBeenCalled();
  });

  it('should return 502 CBP_UNREACHABLE with a neutral message when the CBP fetch fails', async () => {
    importCbpUsers.mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 401'), { response: { status: 401 } }));
    const res = await request(app).post(URL).send({});
    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      success: false,
      code: 'CBP_UNREACHABLE',
      message: 'Could not reach the CBP staff directory. Please try again in a few minutes.',
    });
    expect(res.body.message).not.toMatch(/CBP_AUTH|env/i);
    expect(audit).not.toHaveBeenCalled();
  });

  it('should return 409 IMPORT_IN_PROGRESS when a run is already active', async () => {
    importCbpUsers.mockRejectedValueOnce(Object.assign(new Error('CBP import already running'), { code: 'IMPORT_IN_PROGRESS' }));
    const res = await request(app).post(URL).send({});
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, code: 'IMPORT_IN_PROGRESS' });
    expect(audit).not.toHaveBeenCalled();
  });

  it('should return 403 when the caller lacks sync:execute', async () => {
    rbacService.checkPermission.mockResolvedValueOnce({ allowed: false, scope: null });
    const res = await request(app).post(URL).send({});
    expect(res.status).toBe(403);
    expect(importCbpUsers).not.toHaveBeenCalled();
  });
});
