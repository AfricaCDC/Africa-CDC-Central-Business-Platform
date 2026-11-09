// ── settingsService unit tests ──
//
// Covers: typed getters (getSetting/getBool/getInt/getIntList) against the
// cached load, cache invalidation on write, all-or-nothing setSettings, and
// the missing-table fallback.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

const settingsService = require('../../src/services/settingsService');
const chain = sharedDb.__chain;

/** Program the next full-table load to return `rows`. */
function primeRows(rows) {
  chain.then.mockImplementation((r) => Promise.resolve(rows).then(r));
}

beforeEach(() => {
  jest.clearAllMocks();
  settingsService.invalidateCache();
  sharedDb.schema.hasTable.mockResolvedValue(true);
  chain.pluck.mockReset().mockReturnValue(chain);
  chain.update.mockReset().mockResolvedValue(1);
  primeRows([]);
});

describe('getSetting / typed getters', () => {
  it('should return the stored value and fall back when absent', async () => {
    primeRows([{ key: 'reminders.deadline.enabled', value: '1' }]);
    expect(await settingsService.getSetting('reminders.deadline.enabled')).toBe('1');
    expect(await settingsService.getSetting('nope', 'dflt')).toBe('dflt');
  });

  it('getBool should parse truthy variants and respect fallback', async () => {
    primeRows([
      { key: 'a', value: '1' }, { key: 'b', value: 'true' },
      { key: 'c', value: '0' }, { key: 'd', value: 'garbage' },
    ]);
    expect(await settingsService.getBool('a')).toBe(true);
    expect(await settingsService.getBool('b')).toBe(true);
    expect(await settingsService.getBool('c')).toBe(false);
    expect(await settingsService.getBool('d')).toBe(false);
    expect(await settingsService.getBool('missing', true)).toBe(true);
  });

  it('getInt should parse numbers and fall back on garbage', async () => {
    primeRows([{ key: 'h', value: '9' }, { key: 'bad', value: 'xx' }]);
    expect(await settingsService.getInt('h', 6)).toBe(9);
    expect(await settingsService.getInt('bad', 6)).toBe(6);
    expect(await settingsService.getInt('missing', 6)).toBe(6);
  });

  it('getIntList should parse CSV into a de-duped ascending list', async () => {
    primeRows([{ key: 'days', value: '7, 3, 3, 1' }, { key: 'junk', value: 'a,-2' }]);
    expect(await settingsService.getIntList('days', [7, 3, 1])).toEqual([1, 3, 7]);
    expect(await settingsService.getIntList('junk', [7, 3, 1])).toEqual([1, 3, 7]);
    expect(await settingsService.getIntList('missing', [5])).toEqual([5]);
  });

  it('should serve repeated reads from cache (single DB load)', async () => {
    primeRows([{ key: 'a', value: '1' }]);
    await settingsService.getSetting('a');
    await settingsService.getSetting('a');
    await settingsService.getBool('a');
    // db('app_settings') called once for the initial load
    expect(sharedDb).toHaveBeenCalledTimes(1);
  });

  it('should degrade to fallbacks when app_settings table is missing', async () => {
    sharedDb.schema.hasTable.mockResolvedValue(false);
    expect(await settingsService.getBool('reminders.deadline.enabled', false)).toBe(false);
    expect(await settingsService.getIntList('reminders.deadline.days_before', [7, 3, 1])).toEqual([1, 3, 7]);
  });
});

describe('setSettings', () => {
  it('should update known keys and invalidate the cache', async () => {
    // load #1 (getter) → old value cached
    primeRows([{ key: 'reminders.draft.enabled', value: '0' }]);
    expect(await settingsService.getSetting('reminders.draft.enabled')).toBe('0');

    chain.pluck.mockResolvedValue(['reminders.draft.enabled']);
    const res = await settingsService.setSettings({ 'reminders.draft.enabled': '1' }, 42);
    expect(res).toEqual({ updated: ['reminders.draft.enabled'], unknown: [] });
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ value: '1', updated_by: 42 }));

    // cache invalidated → next read reloads with the new value
    primeRows([{ key: 'reminders.draft.enabled', value: '1' }]);
    expect(await settingsService.getSetting('reminders.draft.enabled')).toBe('1');
  });

  it('should reject the WHOLE batch when any key is unknown (no partial write)', async () => {
    chain.pluck.mockResolvedValue(['reminders.draft.enabled']);
    const res = await settingsService.setSettings({
      'reminders.draft.enabled': '1',
      'not.a.real.key': 'x',
    }, 42);
    expect(res.updated).toEqual([]);
    expect(res.unknown).toEqual(['not.a.real.key']);
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('should no-op on an empty entries object', async () => {
    const res = await settingsService.setSettings({}, 42);
    expect(res).toEqual({ updated: [], unknown: [] });
    expect(chain.update).not.toHaveBeenCalled();
  });
});
