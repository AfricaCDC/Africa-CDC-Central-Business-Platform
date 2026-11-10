// ── services/search/globalSearch (D-20261106-05) ──

const db = require('../../src/config/db');
const { NODE_TYPES, ORG_LEVEL_TYPES, SEARCH_GROUPS } = require('@rbm/lib/enums');
const { globalSearch } = require('../../src/services/search/globalSearch');

const chain = db.__chain;
// Each `await` on the chain resolves the next programmed result, in order:
// specific, broad, indicator, result groups, then Business Units.
const answers = (...results) => {
  const queue = [...results];
  chain.then.mockImplementation((resolve) => Promise.resolve(queue.shift() ?? []).then(resolve));
};
const SPECIFIC = { id: 41, node_type: NODE_TYPES.SPECIFIC_ACTIVITY, code: 'SDI.2.1.3', title: 'Train lab staff', status: 'APPROVED' };
const UNIT = { code: 'SDI', name: 'Surveillance and Disease Intelligence', level_type: ORG_LEVEL_TYPES.DIVISION };

// Calls the `where(function ...)` callbacks so their inner conditions reach the mock.
const runWhereCallbacks = () => chain.where.mock.calls
  .filter(([arg]) => typeof arg === 'function')
  .forEach(([fn]) => fn.call(chain));

beforeEach(() => {
  jest.clearAllMocks();
  answers([SPECIFIC], [], [], [], [UNIT]);
});

describe('globalSearch', () => {
  it('should return the non-empty groups in display order', async () => {
    const res = await globalSearch({ q: 'sdi', fiscalYear: '2026', userId: 7, canSeeAll: false });
    expect(res.q).toBe('sdi');
    expect(res.fiscal_year).toBe('2026');
    expect(res.groups.map((g) => g.group)).toEqual([SEARCH_GROUPS.SPECIFIC, SEARCH_GROUPS.UNIT]);
    expect(res.groups[0].items).toEqual([SPECIFIC]);
    expect(res.groups[1].items).toEqual([UNIT]);
  });

  it('should search plan items of the year by node type, 6 per group by default', async () => {
    await globalSearch({ q: 'SDI', fiscalYear: '2026', userId: 7, canSeeAll: true });
    expect(chain.whereIn).toHaveBeenCalledWith('node_type', [NODE_TYPES.SPECIFIC_ACTIVITY]);
    expect(chain.whereIn).toHaveBeenCalledWith('node_type', ['OUTCOME_INDICATOR', 'IMPACT_INDICATOR']);
    expect(chain.whereIn).toHaveBeenCalledWith('node_type', ['OUTCOME_AREA', 'IMPACT']);
    expect(chain.where).toHaveBeenCalledWith('fiscal_year', '2026');
    expect(chain.limit).toHaveBeenCalledWith(6);
  });

  it('should match a code prefix or a title part, exact code first', async () => {
    await globalSearch({ q: 'SDI.2', userId: 7, canSeeAll: true, limit: 50 });
    runWhereCallbacks();
    expect(chain.where).toHaveBeenCalledWith('code', 'like', 'SDI.2%');
    expect(chain.orWhere).toHaveBeenCalledWith('title', 'like', '%SDI.2%');
    expect(chain.orderByRaw).toHaveBeenCalledWith(expect.stringContaining('CASE WHEN code = ?'), ['SDI.2', 'SDI.2%']);
    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(chain.where).not.toHaveBeenCalledWith('fiscal_year', expect.anything());
  });

  it('should escape LIKE wildcards typed by the user', async () => {
    await globalSearch({ q: '50%_a\\b', userId: 7, canSeeAll: true });
    runWhereCallbacks();
    expect(chain.where).toHaveBeenCalledWith('code', 'like', '50\\%\\_a\\\\b%');
  });

  it('should show drafts only to their author or focal person', async () => {
    await globalSearch({ q: 'SDI', userId: 7, canSeeAll: false });
    runWhereCallbacks();
    expect(chain.whereIn).toHaveBeenCalledWith('status', expect.arrayContaining(['APPROVED', 'IN_EXECUTION']));
    expect(chain.orWhere).toHaveBeenCalledWith('created_by_user_id', 7);
    expect(chain.orWhere).toHaveBeenCalledWith('focal_user_id', 7);
  });

  it('should not restrict plan items for an administrator', async () => {
    await globalSearch({ q: 'SDI', userId: 7, canSeeAll: true });
    runWhereCallbacks();
    expect(chain.orWhere).not.toHaveBeenCalledWith('created_by_user_id', 7);
  });

  it('should find member states by exact code or by name', async () => {
    answers([], [], [], [], []);
    const byName = await globalSearch({ q: 'keny', userId: 7, canSeeAll: true });
    expect(byName.groups).toEqual([{ group: 'COUNTRY', items: [expect.objectContaining({ code: 'KEN', name: 'Kenya' })] }]);
    answers([], [], [], [], []);
    const byCode = await globalSearch({ q: 'ken', userId: 7, canSeeAll: true });
    expect(byCode.groups[0].items.map((c) => c.code)).toEqual(['KEN']);
  });
});
