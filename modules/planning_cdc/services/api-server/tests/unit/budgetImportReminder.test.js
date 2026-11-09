// ── Weekly MIS import reminder (D-20261015-04) ──
//
// Week boundaries, "already done" detection, and the cron gates (enabled,
// working days from the weekday, hour, once a day). DB, settings and the event bus are mocked.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('../../src/services/settingsService', () => ({ getBool: jest.fn(), getInt: jest.fn(), getSetting: jest.fn() }));
jest.mock('../../src/services/eventBusService', () => ({ emitEvent: jest.fn().mockResolvedValue({}) }));

const db = require('../../src/config/db');
const settings = require('../../src/services/settingsService');
const { emitEvent } = require('../../src/services/eventBusService');
const reminder = require('../../src/services/budgetExecution/budgetImportReminder');
const cron = require('../../src/cron/budgetImportReminderCron');

const chain = db.__chain;
const MONDAY_7 = new Date('2026-10-19T07:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
  settings.getBool.mockResolvedValue(true);
  settings.getInt.mockImplementation(async (key, def) => def);
  settings.getSetting.mockResolvedValue('FMG');
  chain.first.mockReset().mockResolvedValue(undefined);
});

describe('weekStart', () => {
  it('should return the Monday 00:00 UTC of the week', () => {
    expect(reminder.weekStart(new Date('2026-10-15T10:00:00Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(reminder.weekStart(new Date('2026-10-18T23:59:00Z')).toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(reminder.weekStart(new Date('2026-10-19T00:00:00Z')).toISOString()).toBe('2026-10-19T00:00:00.000Z');
  });
});

describe('weekLabel', () => {
  const label = (d) => reminder.weekLabel(reminder.weekStart(new Date(d))).label;

  it('should number weeks the ISO way, Monday to Sunday', () => {
    expect(label('2026-10-15T10:00:00Z')).toBe('Week 42 (12 Oct – 18 Oct 2026)');
    expect(label('2026-10-19T00:00:00Z')).toBe('Week 43 (19 Oct – 25 Oct 2026)');
  });

  it('should handle the weeks across two years', () => {
    expect(label('2026-01-01T10:00:00Z')).toBe('Week 1 (29 Dec 2025 – 4 Jan 2026)');
    expect(label('2026-12-31T10:00:00Z')).toBe('Week 53 (28 Dec 2026 – 3 Jan 2027)');
    expect(label('2027-01-04T10:00:00Z')).toBe('Week 1 (4 Jan – 10 Jan 2027)');
  });
});

describe('remindImportDue', () => {
  it('should send the reminder to the finance unit when nothing was imported this week', async () => {
    chain.first.mockResolvedValue({ id: 2, as_of_date: '2026-10-13', created_at: '2026-10-14T09:00:00Z', imported_by_name: 'Finance Officer' });
    const r = await reminder.remindImportDue(MONDAY_7);
    expect(r).toEqual({ sent: true, done: false });
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: reminder.EVENTS.DUE,
      entity: expect.objectContaining({ main_division_code: 'FMG' }),
      metadata: expect.objectContaining({ status: 'due', weekStart: '2026-10-19', weekLabel: 'Week 43 (19 Oct – 25 Oct 2026)', lastAsOf: '2026-10-13' }),
    }));
  });

  it('should send nothing when the export of the week is already imported', async () => {
    chain.first.mockResolvedValue({ id: 3, as_of_date: '2026-10-19', created_at: '2026-10-19T06:30:00Z' });
    expect(await reminder.remindImportDue(MONDAY_7)).toEqual({ sent: false, done: true });
    expect(emitEvent).not.toHaveBeenCalled();
  });
});

describe('budgetImportReminderCron.tick', () => {
  it('should do nothing when disabled', async () => {
    settings.getBool.mockResolvedValue(false);
    expect(await cron.tick(MONDAY_7)).toBeNull();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('should wait for the configured weekday and hour', async () => {
    expect(await cron.tick(new Date('2026-10-19T05:00:00Z'))).toBeNull(); // Monday before 06:00
    expect(await cron.tick(new Date('2026-10-24T09:00:00Z'))).toBeNull(); // Saturday
    expect(await cron.tick(new Date('2026-10-25T09:00:00Z'))).toBeNull(); // Sunday
    settings.getInt.mockImplementation(async (key, def) => (key === 'reminders.budget_import.weekday' ? 3 : def));
    expect(await cron.tick(new Date('2026-10-20T09:00:00Z'))).toBeNull(); // Tuesday, reminder set on Wednesday
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('should remind again every working day after the weekday until imported', async () => {
    expect(await cron.tick(new Date('2026-10-22T09:00:00Z'))).toEqual({ sent: true, done: false }); // Thursday
    expect(await cron.tick(new Date('2026-10-23T09:00:00Z'))).toEqual({ sent: true, done: false }); // Friday
    expect(emitEvent).toHaveBeenCalledTimes(2);
  });

  it('should skip when today reminder is already in the outbox', async () => {
    chain.first.mockResolvedValueOnce({ id: 99 });
    expect(await cron.tick(MONDAY_7)).toBeNull();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('should remind once the day and hour are reached', async () => {
    expect(await cron.tick(MONDAY_7)).toEqual({ sent: true, done: false });
    expect(emitEvent).toHaveBeenCalledTimes(1);
  });
});
