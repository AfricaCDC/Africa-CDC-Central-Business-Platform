// ── reference routes integration tests ──
//
// Covers GET /api/reference/values:
//   - 401 unauthenticated (no token)
//   - 400 when `type` is missing or unknown (VALIDATION_FAILED envelope)
//   - 200 with the service's string[] for a valid type
//
// The DB-backed service is partial-mocked: getValues is stubbed (deterministic),
// while isValidType keeps its real implementation so the route's guard is the
// behaviour actually under test.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    if (global.__testUser === null) {
      return res.status(401).json({ success: false, message: 'No token', code: 'TOKEN_MISSING' });
    }
    req.user = global.__testUser || { id: 1, email: 'me@africacdc.org', division_code: null };
    next();
  },
}));

jest.mock('../../src/services/referenceService', () => {
  const actual = jest.requireActual('../../src/services/referenceService');
  return { ...actual, getValues: jest.fn() };
});

const request = require('supertest');
const app = require('../../src/app');
const referenceService = require('../../src/services/referenceService');

const URL = '/api/reference/values';
const SAMPLE = ['African Union', 'GAVI', 'World Bank'];

beforeEach(() => {
  jest.clearAllMocks();
  global.__testUser = { id: 7, email: 'me@africacdc.org', division_code: null };
  referenceService.getValues.mockResolvedValue(SAMPLE);
});

afterEach(() => { global.__testUser = null; });

describe('GET /api/reference/values', () => {
  it('should return 401 when unauthenticated', async () => {
    global.__testUser = null;
    const res = await request(app).get(`${URL}?type=FUNDING_SOURCE`);
    expect(res.status).toBe(401);
    expect(referenceService.getValues).not.toHaveBeenCalled();
  });

  it('should return 400 when type is missing', async () => {
    const res = await request(app).get(URL);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, code: 'VALIDATION_FAILED' });
    expect(referenceService.getValues).not.toHaveBeenCalled();
  });

  it('should return 400 for an unknown type', async () => {
    const res = await request(app).get(`${URL}?type=NONSENSE`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(referenceService.getValues).not.toHaveBeenCalled();
  });

  it('should return 200 with the suggestion list for FUNDING_SOURCE', async () => {
    const res = await request(app).get(`${URL}?type=FUNDING_SOURCE`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: SAMPLE });
    expect(referenceService.getValues).toHaveBeenCalledWith('FUNDING_SOURCE');
  });

  it('should return 200 for GRANT', async () => {
    referenceService.getValues.mockResolvedValue([]);
    const res = await request(app).get(`${URL}?type=GRANT`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [] });
    expect(referenceService.getValues).toHaveBeenCalledWith('GRANT');
  });
});
