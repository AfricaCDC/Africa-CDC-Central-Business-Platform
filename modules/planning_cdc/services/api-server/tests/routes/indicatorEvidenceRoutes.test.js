// ── GET /api/reporting/indicator-division-reports/:id/activity-evidence (D-20261105-12) ──

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ success: false, message: 'Sign in', code: 'UNAUTHORIZED' });
    req.user = { id: 5 };
    return next();
  },
}));
jest.mock('../../src/services/rbacService', () => ({ checkPermission: jest.fn() }));
jest.mock('../../src/services/divisionAliasService', () => ({
  ...jest.requireActual('../../src/services/divisionAliasService'),
  scopeCoversDivision: jest.fn(),
}));
jest.mock('../../src/services/reporting/indicatorActivityEvidence', () => ({ activityEvidence: jest.fn() }));

const request = require('supertest');
const app = require('../../src/app');
const rbac = require('../../src/services/rbacService');
const { scopeCoversDivision } = require('../../src/services/divisionAliasService');
const { activityEvidence } = require('../../src/services/reporting/indicatorActivityEvidence');
const { RBAC_SCOPES } = require('@rbm/lib/rbac');

const AUTH = { authorization: 'Bearer t' };
const URL = '/api/reporting/indicator-division-reports/40/activity-evidence';
const QS = '?quarter=Q4&fiscal_year=2026&division_code=epr';

beforeEach(() => {
  jest.clearAllMocks();
  rbac.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.DIVISION });
  scopeCoversDivision.mockResolvedValue(true);
  activityEvidence.mockResolvedValue([{ id: 7, code: '1.2.3.01' }]);
});

describe('GET activity-evidence', () => {
  it('should answer 401 without a session', async () => {
    expect((await request(app).get(`${URL}${QS}`)).status).toBe(401);
  });

  it('should answer 400 without a valid quarter, year or unit', async () => {
    for (const qs of ['?quarter=Q5&fiscal_year=2026&division_code=EPR', '?quarter=Q4&fiscal_year=26&division_code=EPR', '?quarter=Q4&fiscal_year=2026']) {
      const res = await request(app).get(`${URL}${qs}`).set(AUTH);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    }
    expect(activityEvidence).not.toHaveBeenCalled();
  });

  it('should answer 403 when the scope does not cover the unit', async () => {
    scopeCoversDivision.mockResolvedValue(false);
    const res = await request(app).get(`${URL}${QS}`).set(AUTH);
    expect(res.status).toBe(403);
    expect(scopeCoversDivision).toHaveBeenCalledWith({ id: 5 }, RBAC_SCOPES.DIVISION, 'EPR');
    expect(activityEvidence).not.toHaveBeenCalled();
  });

  it('should answer 403 without quarterly_report:read', async () => {
    rbac.checkPermission.mockResolvedValue({ allowed: false, scope: null });
    expect((await request(app).get(`${URL}${QS}`).set(AUTH)).status).toBe(403);
  });

  it('should return the reports of the unit, code upper-cased', async () => {
    const res = await request(app).get(`${URL}${QS}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [{ id: 7, code: '1.2.3.01' }] });
    expect(activityEvidence).toHaveBeenCalledWith({ indicatorId: 40, quarter: 'Q4', fiscalYear: '2026', divisionCode: 'EPR' });
  });
});
