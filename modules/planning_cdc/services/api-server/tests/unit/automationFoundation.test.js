// ── Automation roadmap, lot 0: scheduler and reminder log ──

const db = require('../../src/config/db');
const { defineJob, isDue, isoWeek } = require('../../src/cron/scheduler');
const { claim } = require('../../src/services/reminderLog');

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.insert.mockReset().mockResolvedValue([1]);
});

describe('isDue', () => {
  const MONDAY_7 = new Date('2026-11-09T07:00:00Z');
  const SATURDAY_7 = new Date('2026-11-07T07:00:00Z');

  it('should be due on a weekday past the hour', () => {
    expect(isDue(MONDAY_7, { hour: 6 })).toBe(true);
    expect(isDue(MONDAY_7, { hour: 8 })).toBe(false);
  });

  it('should skip weekends unless asked', () => {
    expect(isDue(SATURDAY_7, { hour: 6 })).toBe(false);
    expect(isDue(SATURDAY_7, { hour: 6, weekends: true })).toBe(true);
  });

  it('should only be due on the given weekday', () => {
    expect(isDue(MONDAY_7, { hour: 6, weekday: 1 })).toBe(true);
    expect(isDue(MONDAY_7, { hour: 6, weekday: 2 })).toBe(false);
  });
});

describe('isoWeek', () => {
  it('should give the ISO week, across a year boundary', () => {
    expect(isoWeek(new Date('2026-11-05T10:00:00Z'))).toBe('2026-W45');
    expect(isoWeek(new Date('2027-01-01T10:00:00Z'))).toBe('2026-W53');
  });
});

describe('defineJob', () => {
  it('should return the tick result and swallow errors', async () => {
    const ok = defineJob({ name: 'okJob', tick: async () => 'done' });
    expect(await ok.tick()).toBe('done');
    const bad = defineJob({ name: 'badJob', tick: async () => { throw new Error('boom'); } });
    expect(await bad.tick()).toBeNull();
  });

  it('should not run the same job twice at the same time', async () => {
    let release;
    const job = defineJob({ name: 'slowJob', tick: () => new Promise((r) => { release = r; }) });
    const first = job.tick();
    expect(await job.tick()).toBeNull();
    release('first');
    expect(await first).toBe('first');
  });
});

describe('reminderLog.claim', () => {
  const r = { kind: 'activity_report.overdue', entityType: 'PLAN_NODE', entityId: 42, recipientId: 7, period: '2026-W45' };

  it('should claim a reminder the first time', async () => {
    expect(await claim(r)).toBe(true);
    expect(db.__chain.insert).toHaveBeenCalledWith({
      kind: 'activity_report.overdue', entity_type: 'PLAN_NODE', entity_id: 42, recipient_user_id: 7, period_key: '2026-W45',
    });
  });

  it('should refuse a reminder already sent for the period', async () => {
    db.__chain.insert.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }));
    expect(await claim(r)).toBe(false);
  });

  it('should rethrow other DB errors', async () => {
    db.__chain.insert.mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'ECONNREFUSED' }));
    await expect(claim(r)).rejects.toThrow('down');
  });
});
