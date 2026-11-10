// ── fiscalYearService (D-20260918-01) ──
//
// The planning year used to be `new Date().getFullYear()` computed
// independently in ~34 frontend files and 8 server sites, plus three routes
// pinned to the literal '2026'. It is now data an admin controls. These tests
// pin the two properties that matter: an explicit year always wins, and a
// missing or malformed setting degrades to the calendar year rather than
// throwing — a settings outage must not take planning down.

jest.mock('../../src/services/settingsService', () => ({
  getSetting: jest.fn(),
}));

const settingsService = require('../../src/services/settingsService');
const { getActivePlanningYear, resolveFiscalYear } = require('../../src/services/fiscalYearService');

const THIS_YEAR = String(new Date().getFullYear());

beforeEach(() => jest.clearAllMocks());

describe('getActivePlanningYear', () => {
  it('should return the configured planning year', async () => {
    settingsService.getSetting.mockResolvedValue('2027');
    await expect(getActivePlanningYear()).resolves.toBe('2027');
  });

  it('should trim a padded setting value', async () => {
    settingsService.getSetting.mockResolvedValue('  2027 ');
    await expect(getActivePlanningYear()).resolves.toBe('2027');
  });

  it.each([null, '', 'FY2027', '27', 'garbage'])(
    'should fall back to the calendar year when the setting is %p',
    async (value) => {
      settingsService.getSetting.mockResolvedValue(value);
      await expect(getActivePlanningYear()).resolves.toBe(THIS_YEAR);
    },
  );

  it('should fall back to the calendar year when settings are unavailable', async () => {
    settingsService.getSetting.mockRejectedValue(new Error('db down'));
    await expect(getActivePlanningYear()).resolves.toBe(THIS_YEAR);
  });
});

describe('resolveFiscalYear', () => {
  it('should prefer an explicit year over the setting', async () => {
    settingsService.getSetting.mockResolvedValue('2026');
    // A user planning 2027 must not have their write stamped 2026 because the
    // platform default still points at the previous generation.
    await expect(resolveFiscalYear('2027')).resolves.toBe('2027');
    expect(settingsService.getSetting).not.toHaveBeenCalled();
  });

  it('should accept a numeric year', async () => {
    await expect(resolveFiscalYear(2027)).resolves.toBe('2027');
  });

  it.each([undefined, null, '', 'not-a-year'])(
    'should fall back to the active planning year when given %p',
    async (value) => {
      settingsService.getSetting.mockResolvedValue('2026');
      await expect(resolveFiscalYear(value)).resolves.toBe('2026');
    },
  );
});
