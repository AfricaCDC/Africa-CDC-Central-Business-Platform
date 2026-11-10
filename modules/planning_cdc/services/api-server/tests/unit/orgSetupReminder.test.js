// ── Org structure set-up reminder (D-20261015-07) ──
//
// Gaps per business unit, the event sent to the administrators, and the
// weekly cron gates. DB, settings and the event bus are mocked.

jest.mock('../../src/services/eventBusService', () => ({ emitEvent: jest.fn().mockResolvedValue({}) }));
jest.mock('../../src/services/settingsService', () => ({ getBool: jest.fn(), getInt: jest.fn(), getSetting: jest.fn() }));

const db = require('../../src/config/db');
const { emitEvent } = require('../../src/services/eventBusService');
const settings = require('../../src/services/settingsService');
const { collectGaps, remindOrgSetup } = require('../../src/services/orgSetup/orgSetupReminder');
const cron = require('../../src/cron/orgSetupReminderCron');

const rowsOnce = (rows) => db.__chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
const MONDAY_8 = new Date('2026-10-19T08:00:00Z');

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  db.__chain.first.mockReset().mockResolvedValue(undefined);
  settings.getBool.mockResolvedValue(true);
  settings.getInt.mockImplementation(async (key, def) => def);
  settings.getSetting.mockResolvedValue('');
});

describe('collectGaps', () => {
  it('should name what each business unit misses', async () => {
    rowsOnce([
      { code: 'EPR', division_name: 'Emergency Preparedness', responsible_user_id: 5, m_and_e_user_id: null, has_focal_team: 1 },
      { code: 'RRR', division_name: null, responsible_user_id: null, m_and_e_user_id: null, has_focal_team: 0 },
    ]);
    expect(await collectGaps('2026')).toEqual([
      { code: 'EPR', name: 'Emergency Preparedness', missing: ['M&E officer'] },
      { code: 'RRR', name: 'RRR', missing: ['Responsible person (head)', 'M&E officer', 'Focal person'] },
    ]);
  });

  it('should read focal persons from user_divisions and drop complete units', async () => {
    rowsOnce([
      { code: 'Digital', division_name: 'Digital Health', responsible_user_id: 36, m_and_e_user_id: 45, has_focal_team: 1 },
      { code: 'CT', division_name: 'CT', responsible_user_id: 5, m_and_e_user_id: null, has_focal_team: '1' },
      { code: 'YOUTH', division_name: 'Youth', responsible_user_id: 5, m_and_e_user_id: 6, has_focal_team: 0 },
    ]);
    expect(await collectGaps('2026')).toEqual([
      { code: 'CT', name: 'CT', missing: ['M&E officer'] },
      { code: 'YOUTH', name: 'Youth', missing: ['Focal person'] },
    ]);
    expect(db.raw).toHaveBeenCalledWith(expect.stringContaining('FROM user_divisions ud'), ['FOCAL_PERSON']);
  });
});

describe('remindOrgSetup', () => {
  it('should send the list with the counts to the administrators', async () => {
    rowsOnce([{ code: 'EPR', division_name: 'EPR', responsible_user_id: 5, m_and_e_user_id: null, focal_user_id: null }]);
    expect(await remindOrgSetup(MONDAY_8)).toEqual({ sent: true, units: 1 });
    const event = emitEvent.mock.calls[0][0];
    expect(event.eventKey).toBe('org_setup.incomplete');
    expect(event.metadata.fiscalYear).toBe('2026');
    expect(event.metadata.url).toMatch(/\/reference\/org$/);
    expect(event.metadata.counts).toEqual([
      { label: 'Responsible person (head)', count: 0 }, { label: 'M&E officer', count: 1 }, { label: 'Focal person', count: 1 },
    ]);
  });

  it('should send one email to the PR&A mailbox with the copy list, not to each administrator', async () => {
    settings.getSetting.mockImplementation(async (key) => ({
      'reminders.org_setup.to': 'pra@africacdc.org', 'reminders.org_setup.cc': 'justinm@africacdc.org; not-an-email',
    }[key]));
    rowsOnce([{ code: 'EPR', division_name: 'EPR', responsible_user_id: 5, m_and_e_user_id: null, focal_user_id: 9 }]);
    expect(await remindOrgSetup(MONDAY_8)).toEqual({ sent: true, units: 1 });
    expect(emitEvent).not.toHaveBeenCalled();
    const row = db.__chain.insert.mock.calls[0][0];
    expect(row).toMatchObject({ event_key: 'org_setup.incomplete', recipient: 'pra@africacdc.org', channel: 'email', status: 'queued' });
    const payload = JSON.parse(row.payload);
    expect(payload.template_key).toBe('org-setup-incomplete');
    expect(payload.cc).toEqual(['justinm@africacdc.org']);
    expect(payload.metadata.units).toHaveLength(1);
  });

  it('should send nothing when every unit is complete', async () => {
    expect(await remindOrgSetup(MONDAY_8)).toEqual({ sent: false, units: 0 });
    expect(emitEvent).not.toHaveBeenCalled();
  });
});

describe('orgSetupReminderCron.tick', () => {
  it('should do nothing when disabled', async () => {
    settings.getBool.mockResolvedValue(false);
    expect(await cron.tick(MONDAY_8)).toBeNull();
  });

  it('should wait for the configured weekday and hour', async () => {
    expect(await cron.tick(new Date('2026-10-19T06:00:00Z'))).toBeNull(); // Monday before 07:00
    settings.getInt.mockImplementation(async (key, def) => (key === 'reminders.org_setup.weekday' ? 3 : def));
    expect(await cron.tick(new Date('2026-10-20T09:00:00Z'))).toBeNull(); // Tuesday, list set on Wednesday
  });

  it('should skip when this week list is already in the outbox', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 3 });
    expect(await cron.tick(MONDAY_8)).toBeNull();
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('should send once the day and hour are reached, and catch up later in the week', async () => {
    rowsOnce([{ code: 'EPR', division_name: 'EPR', responsible_user_id: 5, m_and_e_user_id: null, focal_user_id: 9 }]);
    expect(await cron.tick(new Date('2026-10-21T10:00:00Z'))).toEqual({ sent: true, units: 1 }); // Wednesday
  });
});
