// ── /api/country-workplan (D-20261028-01) ──
//
// The service is mocked: these tests cover the route contract (validation,
// access to a country, response shape).

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, _res, next) => { req.user = { id: 7 }; next(); },
}));
jest.mock('../../src/services/countryWorkplan', () => ({
  viewableCountries: jest.fn(),
  countryActivities: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const { viewableCountries, countryActivities } = require('../../src/services/countryWorkplan');

const DRC = { code: 'COD', name: 'Congo (Democratic Republic)' };
const ACTIVITY = { id: 4102, code: '1.2.3.01', title: 'Lab training', status: 'APPROVED', location: DRC.name };

beforeEach(() => {
  jest.clearAllMocks();
  viewableCountries.mockResolvedValue([DRC]);
  countryActivities.mockResolvedValue([ACTIVITY]);
});

describe('GET /api/country-workplan/countries', () => {
  it('should list the countries the caller may open', async () => {
    const res = await request(app).get('/api/country-workplan/countries');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([DRC]);
    expect(viewableCountries).toHaveBeenCalledWith(7, undefined);
  });

  it('should pass the fiscal year through to filter empty countries', async () => {
    const res = await request(app).get('/api/country-workplan/countries?fiscal_year=2026');
    expect(res.status).toBe(200);
    expect(viewableCountries).toHaveBeenCalledWith(7, '2026');
  });

  it('should return 400 for a malformed fiscal year', async () => {
    const res = await request(app).get('/api/country-workplan/countries?fiscal_year=26');
    expect(res.status).toBe(400);
    expect(viewableCountries).not.toHaveBeenCalled();
  });
});

describe('GET /api/country-workplan', () => {
  it('should return the activities located in the country for the year', async () => {
    const res = await request(app).get('/api/country-workplan?country=cod&fiscal_year=2027');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ country: DRC, activities: [ACTIVITY] });
    expect(countryActivities).toHaveBeenCalledWith({ countryName: DRC.name, fiscalYear: '2027' });
  });

  it('should return 403 for a country outside the caller country offices', async () => {
    const res = await request(app).get('/api/country-workplan?country=KEN&fiscal_year=2027');
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(countryActivities).not.toHaveBeenCalled();
  });

  it('should return 400 for a missing year, a malformed code or a country outside the AU', async () => {
    expect((await request(app).get('/api/country-workplan?country=COD')).status).toBe(400);
    expect((await request(app).get('/api/country-workplan?country=CD&fiscal_year=2027')).status).toBe(400);
    const res = await request(app).get('/api/country-workplan?country=FRA&fiscal_year=2027');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});
