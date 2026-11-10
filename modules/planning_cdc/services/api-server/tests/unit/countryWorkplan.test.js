// ── services/countryWorkplan (D-20261028-01) ──
//
// rbacService is mocked; the DB is the shared knex mock.

jest.mock('../../src/services/rbacService', () => ({ checkPermission: jest.fn() }));

const db = require('../../src/config/db');
const rbacService = require('../../src/services/rbacService');
const { RBAC_SCOPES } = require('@rbm/lib/enums');
const { viewableCountries, countryActivities, VISIBLE_STATUSES } = require('../../src/services/countryWorkplan');

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.pluck.mockReset().mockResolvedValue([]);
  db.__chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
});

describe('viewableCountries', () => {
  it('should open a scope all reader the countries that have a country office only', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.ALL });
    db.__chain.pluck.mockResolvedValueOnce(['KEN', 'NGA']);
    expect(await viewableCountries(7)).toEqual([{ code: 'KEN', name: 'Kenya' }, { code: 'NGA', name: 'Nigeria' }]);
    expect(db.__chain.where).toHaveBeenCalledWith('d.is_country_office', true);
    expect(db.__chain.join).not.toHaveBeenCalled();
  });

  it('should give a scope all reader no country while no country office exists', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.ALL });
    expect(await viewableCountries(7)).toEqual([]);
  });

  it('should offer a scope all reader only the country office countries with activities that year', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.ALL });
    db.__chain.pluck.mockResolvedValueOnce(['KEN', 'NGA']).mockResolvedValueOnce(['Kenya', 'Ghana', 'Addis Ababa (HQ)', 'Virtual']);
    expect(await viewableCountries(7, '2026')).toEqual([{ code: 'KEN', name: 'Kenya' }]);
  });

  it('should keep the country office country even when it has no activity that year', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.DIVISION });
    db.__chain.pluck.mockResolvedValueOnce(['COD']);
    expect(await viewableCountries(7, '2026')).toEqual([{ code: 'COD', name: 'Congo (Democratic Republic)' }]);
  });

  it('should open the countries of the caller country offices only', async () => {
    rbacService.checkPermission.mockResolvedValue({ allowed: true, scope: RBAC_SCOPES.DIVISION });
    db.__chain.pluck.mockResolvedValueOnce(['COD', 'XXX']);
    expect(await viewableCountries(7)).toEqual([{ code: 'COD', name: 'Congo (Democratic Republic)' }]);
  });
});

describe('countryActivities', () => {
  it('should read approved and in-review activities only, never drafts', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([{ id: 1, budget_main: '1200.50' }]).then(r));
    const rows = await countryActivities({ countryName: 'Kenya', fiscalYear: '2027' });
    expect(rows).toEqual([{ id: 1, budget_main: 1200.5 }]);
    expect(VISIBLE_STATUSES).toContain('IN_REVIEW');
    expect(VISIBLE_STATUSES).toContain('APPROVED');
    expect(VISIBLE_STATUSES).not.toContain('DRAFT');
  });
});
