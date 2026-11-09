// ── services/adoption/adoptionReport (D-20261106-03) ──

const db = require('../../src/config/db');
const { adoptionReport } = require('../../src/services/adoption/adoptionReport');

const chain = db.__chain;
// Each `await` on the chain resolves the next programmed result, in order:
// count, rows, roles, summary.
const answers = (...results) => {
  const queue = [...results];
  chain.then.mockImplementation((resolve) => Promise.resolve(queue.shift() ?? []).then(resolve));
};

const ROW = {
  id: 7, full_name: 'Focal Person A', email: 'focal.a@example.org', division_code: 'SDI', last_login_at: '2026-11-01 08:00:00',
  tour_version_seen: '1.3', tour_outcome: 'SKIPPED', specifics: '2', specifics_at: '2026-10-02 09:00:00',
  activity_reports: null, activity_reports_at: null, indicator_reports: '1', indicator_reports_at: '2026-10-20 10:00:00',
};
const SUMMARY = { users: '3', never_signed_in: '1', signed_in_recently: '2', tour_taken: '1', tour_skipped: '1', never_submitted: null };

beforeEach(() => {
  jest.clearAllMocks();
  answers([{ total: 1 }], [ROW], [{ user_id: 7, code: 'FOCAL_PERSON' }, { user_id: 7, code: 'STAFF' }], [SUMMARY]);
});

describe('adoptionReport', () => {
  it('should list each user with roles, tour and submissions', async () => {
    const res = await adoptionReport();
    expect(res.total).toBe(1);
    expect(res.page_size).toBe(15);
    expect(res.rows).toEqual([{
      id: 7, full_name: 'Focal Person A', email: 'focal.a@example.org', unit_code: 'SDI', roles: ['FOCAL_PERSON', 'STAFF'],
      last_login_at: '2026-11-01 08:00:00', tour_version_seen: '1.3', tour_outcome: 'SKIPPED',
      submitted: { specifics: 2, activity_reports: 0, indicator_reports: 1 },
      last_submitted_at: new Date('2026-10-20 10:00:00'),
    }]);
  });

  it('should turn the summary into numbers, empty sums into 0', async () => {
    const { summary } = await adoptionReport();
    expect(summary).toEqual({ users: 3, never_signed_in: 1, signed_in_recently: 2, tour_taken: 1, tour_skipped: 1, never_submitted: 0 });
  });

  it('should page by 15', async () => {
    await adoptionReport({ page: 3 });
    expect(chain.limit).toHaveBeenCalledWith(15);
    expect(chain.offset).toHaveBeenCalledWith(30);
  });

  it('should keep active human users only', async () => {
    await adoptionReport();
    const whereFns = chain.where.mock.calls.filter(([arg]) => typeof arg === 'function');
    expect(whereFns.length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ['NEVER_SIGNED_IN', () => expect(chain.whereNull).toHaveBeenCalledWith('u.last_login_at')],
    ['NO_TOUR', () => expect(chain.whereNull).toHaveBeenCalledWith('u.tour_version_seen')],
    ['TOUR_SKIPPED', () => expect(chain.where).toHaveBeenCalledWith('u.tour_outcome', 'SKIPPED')],
    ['NEVER_SUBMITTED', () => ['s.user_id', 'a.user_id', 'i.user_id'].forEach((c) => expect(chain.whereNull).toHaveBeenCalledWith(c))],
  ])('should apply the %s filter', async (filter, check) => {
    await adoptionReport({ filter });
    check();
  });

  it('should filter by unit', async () => {
    await adoptionReport({ unit: 'SDI' });
    expect(chain.where).toHaveBeenCalledWith('u.division_code', 'SDI');
  });

  it('should not look up roles when the page is empty', async () => {
    answers([{ total: 0 }], [], [SUMMARY]);
    const res = await adoptionReport({ page: 9 });
    expect(res.rows).toEqual([]);
    expect(chain.whereIn).not.toHaveBeenCalled();
  });
});
