// ── /api/admin/divisions/:code/assignments ──
//
// The division page writes focal / M&E rows through these routes. They must
// go through divisionAssignmentService so division_codes holder columns stay
// in sync with user_divisions (removing a holder used to leave the column set).

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 1, email: 'admin@africacdc.org', roles: ['SYSTEM_ADMIN'] };
    next();
  },
}));
jest.mock('../../src/middleware/auditLog', () => ({ audit: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/rbacService', () => ({
  checkPermission: jest.fn(() => Promise.resolve({ allowed: true, scope: 'all' })),
  invalidateUserPermissions: jest.fn(),
  getPermissionMap: jest.fn().mockResolvedValue({ permissions: {}, modules: [], isAdmin: true, denies: [] }),
}));
jest.mock('../../src/services/divisionAssignmentService', () => ({
  addDivisionRole: jest.fn().mockResolvedValue(undefined),
  removeDivisionRole: jest.fn().mockResolvedValue(undefined),
  applyHolderChange: jest.fn().mockResolvedValue(undefined),
  HOLDER_FIELDS: ['focal_user_id', 'responsible_user_id', 'm_and_e_user_id'],
}));

const request = require('supertest');
const app = require('../../src/app');
const rbacService = require('../../src/services/rbacService');
const svc = require('../../src/services/divisionAssignmentService');

const TRX = { trx: true };

beforeEach(() => {
  jest.clearAllMocks();
  rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: 'all' });
  sharedDb.transaction = jest.fn((cb) => cb(TRX));
});

describe('POST /api/admin/divisions/:code/assignments', () => {
  it('should add the role through divisionAssignmentService in a transaction', async () => {
    const res = await request(app).post('/api/admin/divisions/CPI/assignments').send({ user_id: '7', role: 'FOCAL_PERSON' });
    expect(res.status).toBe(200);
    expect(svc.addDivisionRole).toHaveBeenCalledWith(TRX, { userId: 7, code: 'CPI', role: 'FOCAL_PERSON' });
  });

  it('should return 400 when the role is unknown', async () => {
    const res = await request(app).post('/api/admin/divisions/CPI/assignments').send({ user_id: 7, role: 'BOSS' });
    expect(res.status).toBe(400);
    expect(svc.addDivisionRole).not.toHaveBeenCalled();
  });

  it('should return 400 when user_id is missing', async () => {
    const res = await request(app).post('/api/admin/divisions/CPI/assignments').send({ role: 'MEMBER' });
    expect(res.status).toBe(400);
  });

  it('should return 403 when the user lacks org_structure:update', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: false });
    const res = await request(app).post('/api/admin/divisions/CPI/assignments').send({ user_id: 7, role: 'MEMBER' });
    expect(res.status).toBe(403);
    expect(svc.addDivisionRole).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/admin/divisions/:code/assignments', () => {
  it('should remove the role through divisionAssignmentService so the holder column is cleared', async () => {
    const res = await request(app).delete('/api/admin/divisions/CPI/assignments').send({ user_id: 9, role: 'ME_OFFICER' });
    expect(res.status).toBe(200);
    expect(svc.removeDivisionRole).toHaveBeenCalledWith(TRX, { userId: 9, code: 'CPI', role: 'ME_OFFICER' });
  });

  it('should return 400 when role is missing', async () => {
    const res = await request(app).delete('/api/admin/divisions/CPI/assignments').send({ user_id: 9 });
    expect(res.status).toBe(400);
    expect(svc.removeDivisionRole).not.toHaveBeenCalled();
  });
});
