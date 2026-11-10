// ── reportingWindowService (A-14 / A-15) ──
//
// The property that matters: a fiscal year that has not started can be planned
// but never reported on, and no setting can relax that. The open-period rule is
// the softer half and stays configurable.

jest.mock('../../src/services/settingsService', () => ({ getSetting: jest.fn() }));
jest.mock('@rbm/lib/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

const settingsService = require('../../src/services/settingsService');
const svc = require('../../src/services/reportingWindowService');
const { STATUSES } = require('@rbm/lib/enums');

const THIS_YEAR = new Date().getFullYear();
const NEXT_YEAR = String(THIS_YEAR + 1);

/** Minimal knex double: one table, one canned row. */
function fakeKnex(table, row) {
  return jest.fn((name) => {
    expect(name).toBe(table);
    return {
      where: () => ({ first: async () => row }),
    };
  });
}

beforeEach(() => jest.clearAllMocks());

describe('assertReportableYear', () => {
  it('should reject a fiscal year that has not started', () => {
    expect(() => svc.assertReportableYear(NEXT_YEAR)).toThrow(/has not started/);
  });

  it('should expose FISCAL_YEAR_NOT_STARTED with a 403', () => {
    try {
      svc.assertReportableYear(NEXT_YEAR);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.code).toBe(svc.NOT_STARTED);
      expect(err.statusCode).toBe(403);
    }
  });

  it('should accept the current year', () => {
    expect(() => svc.assertReportableYear(String(THIS_YEAR))).not.toThrow();
  });

  it('should accept a past year', () => {
    expect(() => svc.assertReportableYear('2024')).not.toThrow();
  });

  it('should accept a numeric year', () => {
    expect(() => svc.assertReportableYear(THIS_YEAR)).not.toThrow();
  });

  it.each([undefined, null, '', 'garbage', 'FY2027'])(
    'should stay out of the way for %p, which other validation owns',
    (value) => {
      expect(() => svc.assertReportableYear(value)).not.toThrow();
    },
  );
});

describe('assertReportableNode', () => {
  it('should reject a report on a node from a future year', async () => {
    const knex = fakeKnex('plan_nodes', { fiscal_year: NEXT_YEAR });
    await expect(svc.assertReportableNode(knex, 42)).rejects.toThrow(/has not started/);
  });

  it('should accept a report on a node from the current year', async () => {
    const knex = fakeKnex('plan_nodes', { fiscal_year: String(THIS_YEAR) });
    await expect(svc.assertReportableNode(knex, 42)).resolves.toBe(String(THIS_YEAR));
  });

  it('should not throw when the node does not exist', async () => {
    const knex = fakeKnex('plan_nodes', undefined);
    await expect(svc.assertReportableNode(knex, 42)).resolves.toBeNull();
  });

  it('should not query on a non-numeric id', async () => {
    const knex = jest.fn();
    await expect(svc.assertReportableNode(knex, 'abc')).resolves.toBeNull();
    expect(knex).not.toHaveBeenCalled();
  });
});

describe('assertOpenPeriod', () => {
  const closed = () => jest.fn(() => ({ where: () => ({ first: async () => undefined }) }));
  const open = () => jest.fn(() => ({ where: () => ({ first: async () => ({ id: 1 }) }) }));

  it('should pass when a matching period is open', async () => {
    await expect(svc.assertOpenPeriod(open(), 'Q2', '2026')).resolves.toBe(true);
    expect(settingsService.getSetting).not.toHaveBeenCalled();
  });

  it('should only warn when no period is open and enforcement is off', async () => {
    settingsService.getSetting.mockResolvedValue('0');
    await expect(svc.assertOpenPeriod(closed(), 'Q2', '2026')).resolves.toBe(false);
  });

  it('should refuse when no period is open and enforcement is on', async () => {
    settingsService.getSetting.mockResolvedValue('true');
    await expect(svc.assertOpenPeriod(closed(), 'Q2', '2026')).rejects.toThrow(/No reporting window is open/);
  });

  it('should keep accepting writes when the settings lookup fails', async () => {
    // A settings outage must not start refusing writes that used to pass.
    settingsService.getSetting.mockRejectedValue(new Error('db down'));
    await expect(svc.assertOpenPeriod(closed(), 'Q2', '2026')).resolves.toBe(false);
  });

  it('should skip the check when quarter or year is missing', async () => {
    const knex = jest.fn();
    await expect(svc.assertOpenPeriod(knex, '', '2026')).resolves.toBe(true);
    expect(knex).not.toHaveBeenCalled();
  });
});

describe('isOpenPeriodEnforced', () => {
  it.each(['1', 'true', 'yes', 'TRUE', ' Yes '])('should read %p as enforced', async (value) => {
    settingsService.getSetting.mockResolvedValue(value);
    await expect(svc.isOpenPeriodEnforced()).resolves.toBe(true);
  });

  it.each([null, '', '0', 'false', 'no', 'maybe'])('should read %p as not enforced', async (value) => {
    settingsService.getSetting.mockResolvedValue(value);
    await expect(svc.isOpenPeriodEnforced()).resolves.toBe(false);
  });
});

describe('reportingQuarter', () => {
  /** reporting_periods lookup returning `row` (where → orderBy → first). */
  const periods = (row) => jest.fn((name) => {
    expect(name).toBe('reporting_periods');
    return { where: () => ({ orderBy: () => ({ first: async () => row }) }) };
  });

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-10-13T08:00:00Z')); // calendar Q4
  });
  afterEach(() => jest.useRealTimers());

  it('should use the quarter of the open reporting period', async () => {
    await expect(svc.reportingQuarter(periods({ quarter: 'Q3' }), '2026')).resolves.toBe('Q3');
  });

  it('should fall back to the calendar quarter when no period is open', async () => {
    await expect(svc.reportingQuarter(periods(undefined), '2026')).resolves.toBe('Q4');
  });

  it('should honour a valid requested quarter without querying', async () => {
    const knex = jest.fn();
    await expect(svc.reportingQuarter(knex, '2026', 'q2')).resolves.toBe('Q2');
    expect(knex).not.toHaveBeenCalled();
  });

  it('should ignore an invalid requested quarter', async () => {
    await expect(svc.reportingQuarter(periods({ quarter: 'Q3' }), '2026', 'Q9')).resolves.toBe('Q3');
  });
});

describe('whereOpenPeriod', () => {
  /** Records the sub-query built inside whereExists. */
  function capture() {
    const sub = { calls: [] };
    ['from', 'select', 'whereRaw', 'where'].forEach((m) => {
      sub[m] = (...args) => { sub.calls.push([m, ...args]); return sub; };
    });
    const query = { whereExists: jest.fn((fn) => { fn.call(sub); return query; }) };
    return { query, sub };
  }

  it('should keep only reports whose quarter AND fiscal year have an OPEN period', () => {
    const { query, sub } = capture();
    expect(svc.whereOpenPeriod(query, 'r')).toBe(query);
    expect(sub.calls).toEqual([
      ['from', 'reporting_periods as rp'],
      ['select', 'rp.id'],
      ['whereRaw', 'rp.quarter = ?? AND rp.fiscal_year = ??', ['r.quarter', 'r.fiscal_year']],
      ['where', 'rp.status', STATUSES.OPEN],
    ]);
  });

  it('should use the given table alias', () => {
    const { query, sub } = capture();
    svc.whereOpenPeriod(query, 'ar');
    expect(sub.calls[2][2]).toEqual(['ar.quarter', 'ar.fiscal_year']);
  });
});
