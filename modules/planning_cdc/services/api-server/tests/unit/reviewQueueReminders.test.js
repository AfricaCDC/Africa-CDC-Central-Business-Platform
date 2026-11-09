// ── Pending-review reminders + weekday cron (D-20261015-01) ──
//
// Mocks: the shared chainable knex mock (db.__chain), the event bus and the
// settings service. No real DB, no real clock (dates passed in).

jest.mock('../../src/services/eventBusService', () => ({ emitEvent: jest.fn().mockResolvedValue({}) }));
jest.mock('../../src/services/settingsService', () => ({ getBool: jest.fn(), getInt: jest.fn() }));
jest.mock('../../src/services/approverRealign', () => ({ realignMeSteps: jest.fn().mockResolvedValue([]) }));
jest.mock('../../src/services/approvals/approverIdentity', () => ({ actingFor: jest.fn() }));

const db = require('../../src/config/db');
const { emitEvent } = require('../../src/services/eventBusService');
const settings = require('../../src/services/settingsService');
const { remindPendingReviews, collectPendingReviews } = require('../../src/services/reporting/reviewQueueReminders');
const { actingFor } = require('../../src/services/approvals/approverIdentity');
const { realignMeSteps } = require('../../src/services/approverRealign');
const { tick } = require('../../src/cron/reviewPendingReminderCron');

const rowsOnce = (rows) => db.__chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.whereNotExists = jest.fn().mockReturnValue(db.__chain);
  db.__chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  db.__chain.first.mockReset().mockResolvedValue(undefined);
  settings.getBool.mockResolvedValue(true);
  settings.getInt.mockResolvedValue(6);
});

describe('collectPendingReviews', () => {
  it('should read every approver without a user', async () => {
    await collectPendingReviews();
    expect(actingFor).not.toHaveBeenCalled();
  });

  it('should keep the steps of the user, of their delegators and those escalated to them', async () => {
    actingFor.mockResolvedValueOnce([12, 5]);
    db.__chain.where.mockClear();
    rowsOnce([{ approver_id: 5, step_id: 31, code: '1.2.3', quarter: 'Q3', fiscal_year: '2026' }]);
    rowsOnce([]);
    const rows = await collectPendingReviews({ userId: 12 });
    expect(actingFor).toHaveBeenCalledWith(12);
    expect(rows).toEqual([expect.objectContaining({ step_id: 31, type: 'Indicator report' })]);
    const mine = db.__chain.where.mock.calls.map(([arg]) => arg).filter((arg) => typeof arg === 'function');
    const inner = { whereIn: jest.fn().mockReturnThis(), orWhere: jest.fn().mockReturnThis() };
    mine.at(-1).call(inner);
    expect(inner.whereIn).toHaveBeenCalledWith('u.id', [12, 5]);
    expect(inner.orWhere).toHaveBeenCalledWith('s.escalated_to_id', 12);
  });
});

describe('remindPendingReviews', () => {
  it('should first put pending M&E sign-offs on the current M&E officer of the unit (D-20261022-01)', async () => {
    rowsOnce([]);
    rowsOnce([]);
    await remindPendingReviews();
    expect(realignMeSteps).toHaveBeenCalledTimes(1);
  });

  it('should send one reminder per approver listing their indicator and activity reports', async () => {
    rowsOnce([{ approver_id: 7, step_id: 31, code: '1.2.3', title: 'Labs', division: 'KM', quarter: 'Q3', fiscal_year: '2026', since: '2026-10-01T08:00:00Z' }]);
    rowsOnce([
      { approver_id: 7, code: '1.2.3.1', title: 'EQA', division: 'KM', quarter: 'Q3', fiscal_year: '2026', since: null },
      { approver_id: 9, code: '4.1.1.2', title: 'Mission', division: 'DHIS', quarter: 'Q3', fiscal_year: '2026', since: null },
    ]);

    await expect(remindPendingReviews({ correlationId: 'c1' })).resolves.toEqual({ approvers: 2, items: 3 });

    expect(emitEvent).toHaveBeenCalledTimes(2);
    const first = emitEvent.mock.calls[0][0];
    expect(first).toMatchObject({ eventKey: 'review_queue.pending', entity: { owner_user_id: 7 }, correlationId: 'c1' });
    expect(first.metadata.count).toBe(2);
    expect(first.metadata.items).toEqual([
      { type: 'Indicator report', code: '1.2.3', title: 'Labs', division: 'KM', period: 'Q3 2026', since: '2026-10-01', decideUrl: 'http://localhost:5000/decide/31' },
      { type: 'Activity report', code: '1.2.3.1', title: 'EQA', division: 'KM', period: 'Q3 2026', since: '', decideUrl: '' },
    ]);
    expect(first.metadata.reviewUrl).toMatch(/\/review-submissions$/);
    expect(emitEvent.mock.calls[1][0].entity).toEqual({ owner_user_id: 9 });
  });

  it('should send nothing when no report waits', async () => {
    await expect(remindPendingReviews()).resolves.toEqual({ approvers: 0, items: 0 });
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('should keep only the current pending step of each report', async () => {
    await remindPendingReviews();
    expect(db.__chain.whereNotExists).toHaveBeenCalledTimes(2);
  });
});

describe('reviewPendingReminderCron tick', () => {
  const thursday7 = new Date('2026-10-15T07:00:00Z');

  it('should send on a weekday past the hour when not yet sent today', async () => {
    await expect(tick(thursday7)).resolves.toEqual({ approvers: 0, items: 0 });
    expect(db).toHaveBeenCalledWith('notification_outbox');
  });

  it('should skip when disabled', async () => {
    settings.getBool.mockResolvedValue(false);
    await expect(tick(thursday7)).resolves.toBeNull();
    expect(db).not.toHaveBeenCalled();
  });

  it('should skip on Saturday and Sunday', async () => {
    await expect(tick(new Date('2026-10-17T07:00:00Z'))).resolves.toBeNull();
    await expect(tick(new Date('2026-10-18T07:00:00Z'))).resolves.toBeNull();
  });

  it('should skip before the configured hour', async () => {
    await expect(tick(new Date('2026-10-15T05:59:00Z'))).resolves.toBeNull();
  });

  it('should skip when today was already sent (restart-safe)', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 1 });
    await expect(tick(thursday7)).resolves.toBeNull();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('should log and return null when the DB fails', async () => {
    db.__chain.first.mockRejectedValueOnce(new Error('down'));
    await expect(tick(thursday7)).resolves.toBeNull();
  });
});
