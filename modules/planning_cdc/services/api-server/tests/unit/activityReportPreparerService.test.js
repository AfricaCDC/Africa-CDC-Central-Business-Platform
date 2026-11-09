// ── activityReportPreparerService — "Prepared by" changes (D-20261013-03) ──
//
// The new preparer is set on the report and the previous one stays on record
// in activity_report_preparer_changes. In-memory knex, no real connection.

const { makeFakeKnex } = require('../helpers/fakeKnex');

let tables;
jest.mock('../../src/config/db', () => {
  const proxy = (...args) => global.__preparerKnex(...args);
  proxy.transaction = (cb) => global.__preparerKnex.transaction(cb);
  proxy.fn = { now: () => 'NOW' };
  proxy.raw = (sql) => sql;
  return proxy;
});

const svc = require('../../src/services/reporting/activityReportPreparerService');

beforeEach(() => {
  tables = {
    activity_reports: [{ id: 12, user_id: 5 }],
    users: [
      { id: 5, status: 'ACTIVE', full_name: 'Zoe Five', email: 'z@x.org' },
      { id: 7, status: 'ACTIVE', full_name: '', first_name: 'Anna', last_name: 'Seven', email: 'a@x.org' },
      { id: 8, status: 'INACTIVE', full_name: 'Gone', email: 'g@x.org' },
    ],
    activity_report_preparer_changes: [],
  };
  global.__preparerKnex = makeFakeKnex(tables);
});

describe('changePreparer', () => {
  it('should set the new preparer and record the previous one', async () => {
    await svc.changePreparer({ reportId: 12, toUserId: 7, reason: ' Jane wrote it ', actorId: 1 });
    expect(tables.activity_reports[0].user_id).toBe(7);
    expect(tables.activity_report_preparer_changes).toEqual([
      expect.objectContaining({ activity_report_id: 12, from_user_id: 5, to_user_id: 7, changed_by: 1, reason: 'Jane wrote it' }),
    ]);
  });

  it('should keep every change, in order', async () => {
    await svc.changePreparer({ reportId: 12, toUserId: 7, reason: 'first', actorId: 1 });
    await svc.changePreparer({ reportId: 12, toUserId: 5, reason: 'back', actorId: 1 });
    expect(tables.activity_report_preparer_changes.map((c) => [c.from_user_id, c.to_user_id])).toEqual([[5, 7], [7, 5]]);
  });

  it('should refuse without a reason', async () => {
    await expect(svc.changePreparer({ reportId: 12, toUserId: 7, reason: '  ', actorId: 1 }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(tables.activity_reports[0].user_id).toBe(5);
  });

  it('should refuse an inactive or unknown user', async () => {
    await expect(svc.changePreparer({ reportId: 12, toUserId: 8, reason: 'x', actorId: 1 }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(svc.changePreparer({ reportId: 12, toUserId: 99, reason: 'x', actorId: 1 }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(tables.activity_report_preparer_changes).toHaveLength(0);
  });

  it('should refuse when the person already prepared the report', async () => {
    await expect(svc.changePreparer({ reportId: 12, toUserId: 5, reason: 'x', actorId: 1 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('should return 404 for an unknown report', async () => {
    await expect(svc.changePreparer({ reportId: 404, toUserId: 7, reason: 'x', actorId: 1 }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('should refuse a reason longer than the limit', async () => {
    await expect(svc.changePreparer({ reportId: 12, toUserId: 7, reason: 'x'.repeat(svc.REASON_MAX + 1), actorId: 1 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('listCandidates', () => {
  it('should list active users only, sorted by name', async () => {
    await expect(svc.listCandidates()).resolves.toEqual([
      { id: 7, name: 'Anna Seven', email: 'a@x.org' },
      { id: 5, name: 'Zoe Five', email: 'z@x.org' },
    ]);
  });
});
