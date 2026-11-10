// ── Monthly digest for directors (D-20261105-15) ──

jest.mock('../../src/services/eventBusService', () => ({ emitEvent: jest.fn().mockResolvedValue({}) }));
jest.mock('../../src/services/reminderLog', () => ({ claim: jest.fn().mockResolvedValue(true) }));
jest.mock('../../src/services/settingsService', () => ({ getInt: jest.fn(async (_k, d) => d), getBool: jest.fn(async () => true) }));
jest.mock('../../src/services/divisionAliasService', () => ({ getDirectorateChildren: jest.fn(async (c) => [c, 'lab', 'EPR']) }));
jest.mock('../../src/services/reportingWindowService', () => ({ latestReportableYear: () => 2026, reportingQuarter: jest.fn(async () => 'Q3') }));
jest.mock('../../src/services/budgetExecution/budgetExecutionQuery', () => ({ resolveImport: jest.fn(), activityExecution: jest.fn(), divisionExecution: jest.fn() }));

const db = require('../../src/config/db');
const { emitEvent } = require('../../src/services/eventBusService');
const { claim } = require('../../src/services/reminderLog');
const settings = require('../../src/services/settingsService');
const query = require('../../src/services/budgetExecution/budgetExecutionQuery');
const sections = require('../../src/services/digest/digestSections');
const digest = require('../../src/services/digest/directorDigest');
const job = require('../../src/cron/monthlyDigestJob');

const DIR = { code: 'DSI', name: 'Science and Innovation', responsible_user_id: 14 };
const rowsOnce = (rows) => db.__chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  db.__chain.first.mockReset().mockResolvedValue(undefined);
  claim.mockResolvedValue(true);
  settings.getBool.mockResolvedValue(true);
  query.resolveImport.mockResolvedValue(null);
});

describe('digest sections', () => {
  it('should keep the waiting items of the units only, oldest first', async () => {
    rowsOnce([{ code: '1.1', title: 'A', unit_code: 'EPR', since: '2026-10-20' }, { code: '9.9', title: 'Other', unit_code: 'NCD', since: '2026-10-01' }]);
    rowsOnce([{ code: '1.2', title: 'B', unit_code: 'lab', since: '2026-10-02' }]);
    const w = await sections.waitingApprovals(['EPR', 'LAB'], new Date('2026-10-25T00:00:00Z'));
    expect(w.count).toBe(2);
    expect(w.items.map((i) => i.code)).toEqual(['1.2', '1.1']);
    expect(w.items[0].type_label).toBe('Activity report');
  });

  it('should have no budget section before the first import of the year', async () => {
    expect(await sections.budget(['EPR'], '2026')).toBeNull();
  });

  it('should count the flagged activities per unit from the latest import', async () => {
    query.resolveImport.mockResolvedValue({ id: 3, as_of_date: '2026-11-05' });
    query.activityExecution.mockResolvedValue([
      { division_code: 'EPR', released_budget: 100, execution_pct: 120 },
      { division_code: 'EPR', released_budget: 100, execution_pct: 60 },
    ]);
    query.divisionExecution.mockReturnValue([{ division_code: 'EPR', division_name: 'Emergency', released_budget: 200, execution_pct: 90 }]);
    expect(await sections.budget(['EPR'], '2026')).toEqual({
      as_of: '2026-11-05', units: [{ code: 'EPR', name: 'Emergency', released: 200, execution_pct: 90, flagged: 1 }],
    });
  });
});

describe('buildDigest and noticeFor', () => {
  it('should read the directorate and its units for the year and the reporting quarter', async () => {
    const d = await digest.buildDigest(DIR);
    expect(d).toMatchObject({ directorate: { code: 'DSI' }, units: ['DSI', 'LAB', 'EPR'], fiscal_year: '2026', quarter: 'Q3', waiting_days: 7, budget: null });
  });

  it('should summarise each section with a link to the page, without em dashes', async () => {
    const d = await digest.buildDigest(DIR);
    d.specifics = [{ status: 'APPROVED', count: 12 }, { status: 'DRAFT', count: 2 }];
    const m = digest.noticeFor(d, 'December 2026');
    expect(m.subject).toBe('Monthly digest DSI: December 2026');
    expect(m.sections[0].intro).toMatch(/12/);
    expect(m.sections.some((s) => s.heading.startsWith('Budget'))).toBe(false);
    expect(m.ctaUrl).toMatch(/\/digest\?code=DSI$/);
    expect(JSON.stringify(m)).not.toMatch(/—/);
  });
});

describe('sendMonthlyDigests', () => {
  it('should email each director once a month', async () => {
    rowsOnce([DIR]);
    expect(await digest.sendMonthlyDigests(new Date('2026-12-01T06:00:00Z'))).toEqual({ sent: 1 });
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ kind: digest.EVENT_KEY, recipientId: 14, period: '2026-12-DSI' }));
    expect(emitEvent.mock.calls[0][0].entity.owner_user_id).toBe(14);
  });

  it('should not email twice in the same month', async () => {
    rowsOnce([DIR]);
    claim.mockResolvedValue(false);
    expect(await digest.sendMonthlyDigests(new Date('2026-12-01T09:00:00Z'))).toEqual({ sent: 0 });
    expect(emitEvent).not.toHaveBeenCalled();
  });
});

describe('monthlyDigestJob', () => {
  it('should only run on the configured day, from the hour, when switched on', async () => {
    expect(await job.tick(new Date('2026-12-02T08:00:00Z'))).toBeNull();
    expect(await job.tick(new Date('2026-12-01T05:00:00Z'))).toBeNull();
    settings.getBool.mockResolvedValueOnce(false);
    expect(await job.tick(new Date('2026-12-01T08:00:00Z'))).toBeNull();
    expect(await job.tick(new Date('2026-12-01T08:00:00Z'))).toEqual({ sent: 0 });
  });
});
