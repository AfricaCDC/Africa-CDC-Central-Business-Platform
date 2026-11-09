// ── Follow-up alerts: High-risk activity and data health (D-20261105-11) ──

jest.mock('../../src/services/eventBusService', () => ({ emitEvent: jest.fn().mockResolvedValue({}) }));
jest.mock('../../src/services/reminderLog', () => ({ claim: jest.fn().mockResolvedValue(true) }));
jest.mock('../../src/services/settingsService', () => ({
  getInt: jest.fn(async (_k, d) => d),
  getBool: jest.fn(async () => true),
}));
jest.mock('../../src/services/orgSetup/orgSetupReminder', () => ({ collectGaps: jest.fn().mockResolvedValue([]) }));
jest.mock('../../src/services/budgetExecution/budgetExecutionQuery', () => ({ resolveImport: jest.fn() }));
jest.mock('../../src/services/budgetExecution/budgetExecutionLinks', () => ({ unlinkedFundCenters: jest.fn() }));

const db = require('../../src/config/db');
const { emitEvent } = require('../../src/services/eventBusService');
const { claim } = require('../../src/services/reminderLog');
const settings = require('../../src/services/settingsService');
const { collectGaps } = require('../../src/services/orgSetup/orgSetupReminder');
const { resolveImport } = require('../../src/services/budgetExecution/budgetExecutionQuery');
const { unlinkedFundCenters } = require('../../src/services/budgetExecution/budgetExecutionLinks');
const highRisk = require('../../src/services/alerts/highRiskSoon');
const highRiskJob = require('../../src/cron/highRiskAlertJob');
const { CHECKS } = require('../../src/services/dataHealth/dataHealthChecks');
const report = require('../../src/services/dataHealth/dataHealthReport');
const weeklyJob = require('../../src/cron/dataHealthWeeklyJob');

const THURSDAY = new Date('2026-11-05T07:00:00Z');
const MONDAY = new Date('2026-11-09T08:00:00Z');
const rowsOnce = (rows) => db.__chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
const check = (key) => CHECKS.find((c) => c.key === key);

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.whereNotExists = jest.fn().mockReturnValue(db.__chain);
  db.__chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  db.__chain.first.mockReset().mockResolvedValue(undefined);
  claim.mockResolvedValue(true);
  settings.getBool.mockResolvedValue(true);
  collectGaps.mockReset().mockResolvedValue([]);
});

describe('alertHighRiskSoon', () => {
  const ACTIVITY = { id: 4, code: '1.2.3.01', title: 'Field mission', responsible_division_code: 'EPR', focal_user_id: 9, created_by_user_id: 3, start_day: '2026-11-12' };

  it('should look 14 days ahead and email the focal person and the unit once per start date', async () => {
    rowsOnce([ACTIVITY]);
    expect(await highRisk.alertHighRiskSoon(THURSDAY)).toEqual({ due: 1, sent: 1 });
    expect(db.__chain.whereBetween).toHaveBeenCalledWith('p.start_date', ['2026-11-05', '2026-11-19']);
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ kind: highRisk.EVENT_KEY, entityId: 4, period: 'start-2026-11-12' }));
    const event = emitEvent.mock.calls[0][0];
    expect(event.entity).toEqual({ id: 4, owner_user_id: 9, responsible_division_code: 'EPR' });
    expect(event.metadata.ctaUrl).toMatch(/\/plan\/node\/4$/);
  });

  it('should fall back to the creator when the activity has no focal person', async () => {
    rowsOnce([{ ...ACTIVITY, focal_user_id: null }]);
    await highRisk.alertHighRiskSoon(THURSDAY);
    expect(emitEvent.mock.calls[0][0].entity.owner_user_id).toBe(3);
  });

  it('should not email again an activity already announced for that date', async () => {
    rowsOnce([ACTIVITY]);
    claim.mockResolvedValue(false);
    expect(await highRisk.alertHighRiskSoon(THURSDAY)).toEqual({ due: 1, sent: 0 });
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('should write the date and the unit in the email, without em dashes', () => {
    const m = highRisk.noticeFor(ACTIVITY);
    expect(m.subject).toBe('High-risk activity starts on 2026-11-12: 1.2.3.01');
    expect(m.items[0].meta).toEqual(['EPR', 'starts 2026-11-12']);
    expect(JSON.stringify(m)).not.toMatch(/—/);
  });
});

describe('highRiskAlertJob', () => {
  it('should do nothing when switched off, before the hour or on a weekend', async () => {
    settings.getBool.mockResolvedValueOnce(false);
    expect(await highRiskJob.tick(THURSDAY)).toBeNull();
    expect(await highRiskJob.tick(new Date('2026-11-05T05:59:00Z'))).toBeNull();
    expect(await highRiskJob.tick(new Date('2026-11-07T09:00:00Z'))).toBeNull();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('should run on a working day from the hour', async () => {
    expect(await highRiskJob.tick(THURSDAY)).toEqual({ due: 0, sent: 0 });
  });
});

describe('data health checks', () => {
  it('should link each unit to its org page with what it misses', async () => {
    collectGaps.mockResolvedValue([{ code: 'EPR', name: 'Emergency', missing: ['M&E officer', 'Focal person'] }]);
    expect(await check('unit_people').run('2027')).toEqual([
      { ref: 'EPR', code: 'EPR', name: 'Emergency', detail: 'Missing: M&E officer, Focal person', path: '/reference/org/EPR' },
    ]);
    expect(collectGaps).toHaveBeenCalledWith('2027');
  });

  it('should list the broad activities of the year without a budget code, not cancelled', async () => {
    rowsOnce([{ id: 12, code: '1.2.3', title: 'Lab network', responsible_division_code: 'LAB' }]);
    expect(await check('broad_budget_code').run('2027')).toEqual([
      { ref: '12', code: '1.2.3', name: 'Lab network', detail: 'LAB', path: '/plan/node/12' },
    ]);
    expect(db.__chain.where).toHaveBeenCalledWith('p.fiscal_year', '2027');
    expect(db.__chain.whereNotExists).toHaveBeenCalled();
  });

  it('should list the approved specific activities without an indicator', async () => {
    rowsOnce([{ id: 61, code: '1.2.3.01', title: 'Workshop', responsible_division_code: 'LAB' }]);
    expect(await check('specific_indicator').run('2026')).toEqual([
      { ref: '61', code: '1.2.3.01', name: 'Workshop', detail: 'LAB', path: '/plan/node/61' },
    ]);
    expect(db.__chain.whereNull).toHaveBeenCalledWith('p.linked_indicator_id');
  });

  it('should only read T3 and T4 indicators', async () => {
    rowsOnce([{ id: 40, code: 'EPR.1.1-1', title: 'Plans', responsible_division_code: null }]);
    const rows = await check('indicator_unit').run('2027');
    expect(db.__chain.whereIn).toHaveBeenCalledWith('p.tier_id', [3, 4]);
    expect(rows[0]).toMatchObject({ detail: '', path: '/pirs/40/edit' });
  });

  it('should flag T3/T4 indicator codes with a space or a double dot', async () => {
    rowsOnce([{ id: 6056, code: 'IMZ. 1.1-33', title: 'Coverage', responsible_division_code: 'IMZ' }]);
    expect(await check('malformed_code').run('2026')).toEqual([
      { ref: '6056', code: 'IMZ. 1.1-33', name: 'Coverage', detail: 'IMZ', path: '/pirs/6056/edit' },
    ]);
    expect(db.__chain.whereRaw).toHaveBeenCalledWith(expect.stringContaining('[.][.]'));
    expect(db.__chain.whereIn).toHaveBeenCalledWith('p.tier_id', [3, 4]);
  });

  it('should list both indicators of a code used twice in the year', async () => {
    const twin = { code: 'NPHI.4.2-8', responsible_division_code: 'NPHI' };
    rowsOnce([{ ...twin, id: 1, title: 'A' }, { ...twin, id: 2, title: 'B' }]);
    const rows = await check('duplicate_code').run('2026');
    expect(rows.map((r) => r.path)).toEqual(['/pirs/1/edit', '/pirs/2/edit']);
    expect(db.__chain.havingRaw).toHaveBeenCalledWith('COUNT(*) > 1');
    expect(db.__chain.whereIn).toHaveBeenCalledWith('p.code', expect.anything());
  });

  it('should show an active user by email', async () => {
    rowsOnce([{ id: 8, full_name: 'Ama Diallo', email: 'ama@africacdc.org' }]);
    expect(await check('user_unit').run()).toEqual([
      { ref: '8', code: 'ama@africacdc.org', name: 'Ama Diallo', detail: '', path: '/admin/users' },
    ]);
  });

  it('should read the fund centres of the latest import of the year, none without an import', async () => {
    resolveImport.mockResolvedValueOnce(null);
    expect(await check('fund_centre_link').run('2026')).toEqual([]);
    resolveImport.mockResolvedValueOnce({ id: 5 });
    unlinkedFundCenters.mockResolvedValueOnce([{ fund_center: 'FC100', text: 'Lab', funds: ['AU', 'WB'] }]);
    expect(await check('fund_centre_link').run('2026')).toEqual([
      { ref: 'FC100', code: 'FC100', name: 'Lab', detail: 'AU, WB', path: '/budget-execution/unlinked?fy=2026' },
    ]);
    expect(unlinkedFundCenters).toHaveBeenCalledWith({ importId: 5, fiscalYear: '2026' });
  });
});

describe('buildReport', () => {
  it('should return every check with its count and at most 200 rows', async () => {
    const units = Array.from({ length: 250 }, (_, i) => ({ code: `U${i}`, name: `Unit ${i}`, missing: ['Focal person'] }));
    collectGaps.mockResolvedValue(units);
    const r = await report.buildReport('2027');
    expect(r.fiscal_year).toBe('2027');
    expect(r.checks.map((c) => c.key)).toEqual(CHECKS.map((c) => c.key));
    const people = r.checks.find((c) => c.key === 'unit_people');
    expect(people.count).toBe(250);
    expect(people.rows).toHaveLength(200);
  });

  it('should skip the year-independent checks when asked', async () => {
    const r = await report.buildReport('2027', { perYearOnly: true });
    expect(r.checks.every((c) => c.per_year)).toBe(true);
  });
});

describe('sendWeeklyDataHealth', () => {
  it('should not email when every check is empty', async () => {
    expect(await report.sendWeeklyDataHealth(MONDAY)).toEqual({ sent: false, total: 0 });
    expect(claim).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('should send the non-empty checks of the current and the next year once per week', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 1 }); // the 2027 plan exists
    collectGaps.mockImplementation(async (y) => [{ code: `U${y}`, name: 'Emergency', missing: ['Focal person'] }]);
    expect(await report.sendWeeklyDataHealth(MONDAY)).toEqual({ sent: true, total: 2 });
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ kind: report.EVENT_KEY, period: '2026-W46' }));
    const m = emitEvent.mock.calls[0][0].metadata;
    expect(m.sections.map((s) => s.heading)).toEqual([
      'Business units without their people (2026): 1',
      'Business units without their people (2027): 1',
    ]);
    expect(m.ctaUrl).toMatch(/\/admin\/data-health\?fy=2027$/);
  });

  it('should not send twice in the same week', async () => {
    collectGaps.mockResolvedValue([{ code: 'EPR', name: 'Emergency', missing: ['Focal person'] }]);
    claim.mockResolvedValue(false);
    expect(await report.sendWeeklyDataHealth(MONDAY)).toEqual({ sent: false, total: 1 });
    expect(emitEvent).not.toHaveBeenCalled();
  });
});

describe('dataHealthWeeklyJob', () => {
  it('should only run on the configured weekday from the hour', async () => {
    expect(await weeklyJob.tick(new Date('2026-11-10T08:00:00Z'))).toBeNull();
    expect(await weeklyJob.tick(new Date('2026-11-09T06:00:00Z'))).toBeNull();
    expect(await weeklyJob.tick(MONDAY)).toEqual({ sent: false, total: 0 });
  });
});
