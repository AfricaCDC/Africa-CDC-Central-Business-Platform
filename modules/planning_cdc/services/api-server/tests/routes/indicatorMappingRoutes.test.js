// ── /api/indicator-mapping (D-20261016-04) ──
//
// List needs read; changing a link needs update at scope `all`. The service
// is mocked: no DB.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, email: 'me@africacdc.org' };
    next();
  },
}));
jest.mock('../../src/middleware/auditLog', () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: false, denies: [] }),
}));
jest.mock('../../src/services/indicatorMapping', () => ({ listMapping: jest.fn(), setMapping: jest.fn() }));

const request = require('supertest');
const { ValidationError } = require('@rbm/lib/errors');
const { RBAC_SCOPES } = require('@rbm/lib/rbac');
const { NODE_TYPES } = require('@rbm/lib/enums');
const rbacService = require('../../src/services/rbacService');
const { audit } = require('../../src/middleware/auditLog');
const mapping = require('../../src/services/indicatorMapping');
const app = require('../../src/app');

beforeEach(() => {
  jest.clearAllMocks();
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.ALL });
  mapping.listMapping.mockResolvedValue([{ id: 68, code: '1.1.1', indicator_ids: [412, 415] }]);
  mapping.setMapping.mockResolvedValue({ id: 68, node_type: NODE_TYPES.BROAD_ACTIVITY, indicator_ids: [412], before: [412, 415] });
});

describe('GET /api/indicator-mapping', () => {
  it('should list the activities of a year with their indicators', async () => {
    const res = await request(app).get(`/api/indicator-mapping?fiscal_year=2026&node_type=${NODE_TYPES.BROAD_ACTIVITY}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].indicator_ids).toEqual([412, 415]);
    expect(mapping.listMapping).toHaveBeenCalledWith({ fiscalYear: '2026', nodeType: NODE_TYPES.BROAD_ACTIVITY });
  });

  it('should return 400 for another node type', async () => {
    const res = await request(app).get(`/api/indicator-mapping?fiscal_year=2026&node_type=${NODE_TYPES.OUTCOME_INDICATOR}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 403 without read', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: false });
    expect((await request(app).get(`/api/indicator-mapping?fiscal_year=2026&node_type=${NODE_TYPES.BROAD_ACTIVITY}`)).status).toBe(403);
  });
});

describe('PUT /api/indicator-mapping/:id', () => {
  it('should replace the links and audit before and after', async () => {
    const res = await request(app).put('/api/indicator-mapping/68').send({ indicator_ids: [412] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: 68, node_type: NODE_TYPES.BROAD_ACTIVITY, indicator_ids: [412] });
    expect(mapping.setMapping).toHaveBeenCalledWith({ nodeId: 68, indicatorIds: [412] });
    expect(audit).toHaveBeenCalledWith(expect.anything(), 'INDICATOR_LINKS_UPDATED', expect.any(String), 68, { before: [412, 415], after: [412] });
  });

  it('should return 403 below scope all', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.DIVISION });
    expect((await request(app).put('/api/indicator-mapping/68').send({ indicator_ids: [] })).status).toBe(403);
    expect(mapping.setMapping).not.toHaveBeenCalled();
  });

  it('should return 400 for a malformed body', async () => {
    expect((await request(app).put('/api/indicator-mapping/68').send({ indicator_ids: 'x' })).status).toBe(400);
  });

  it('should return 400 when the service rejects the indicators', async () => {
    mapping.setMapping.mockRejectedValue(new ValidationError('A specific activity contributes to one indicator'));
    const res = await request(app).put('/api/indicator-mapping/70').send({ indicator_ids: [1, 2] });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('A specific activity contributes to one indicator');
  });
});
