// ── deadlineReminders service — pure-helper unit tests ──
//
// Covers the deterministic helpers (no DB): daysUntil, groupByApprover.
// The DB-touching paths are exercised by the route integration test
// (tests/routes/deadlineReminderRoutes.test.js). Schedule parsing
// (days list, hour) lives in settingsService — see settingsService.test.js.

const { daysUntil, groupByApprover } = require('../../src/services/reporting/deadlineReminders');

describe('daysUntil', () => {
  it('counts whole days ahead, ignoring time-of-day', () => {
    expect(daysUntil('2026-03-31', new Date('2026-03-28T23:00:00Z'))).toBe(3);
    expect(daysUntil('2026-03-31', new Date('2026-03-31T00:00:01Z'))).toBe(0);
  });

  it('returns negative once the date has passed', () => {
    expect(daysUntil('2026-03-31', new Date('2026-04-02T00:00:00Z'))).toBe(-2);
  });
});

describe('groupByApprover', () => {
  const row = (over = {}) => ({
    user_id: 20, email: 'me@org.org', first_name: 'Mary', last_name: 'Eno',
    indicator_code: 'IND001', indicator_title: 'T1', division_name: 'DC',
    step_label: 'M&E Review', quarter: 'Q1', fiscal_year: '2026', division_code: 'DCM',
    ...over,
  });

  it('groups multiple rows for one approver into a single bucket', () => {
    const map = groupByApprover([row({ indicator_code: 'IND001' }), row({ indicator_code: 'IND002' })]);
    expect(map.size).toBe(1);
    expect(map.get(20).items).toHaveLength(2);
    expect(map.get(20).user.email).toBe('me@org.org');
  });

  it('separates distinct approvers', () => {
    const map = groupByApprover([row(), row({ user_id: 21, email: 'hod@org.org' })]);
    expect(map.size).toBe(2);
  });

  it('skips rows without an email', () => {
    const map = groupByApprover([row({ user_id: 99, email: null })]);
    expect(map.size).toBe(0);
  });

  it('falls back to division_code when division_name is missing', () => {
    const map = groupByApprover([row({ division_name: null, division_code: 'DCM' })]);
    expect(map.get(20).items[0].division_name).toBe('DCM');
  });
});
