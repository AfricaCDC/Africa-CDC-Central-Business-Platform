// ── referenceService unit tests ──
//
// getValues() must return: curated reference_values rows first (in their
// stored order), then any values already used on plan_nodes that are NOT
// already curated (case-insensitive dedup), sorted alphabetically.

jest.mock('../../src/config/db', () => jest.fn());

const db = require('../../src/config/db');
const { getValues, isValidType } = require('../../src/services/referenceService');

/**
 * Build a chainable db() mock returning fixed rows per table.
 * @param {Array<{value:string}>} refRows - reference_values rows
 * @param {Record<string, Array<object>>} planRowsByCol - plan_nodes distinct rows keyed by column
 */
function makeDb(refRows, planRowsByCol) {
  return (table) => {
    if (table === 'reference_values') {
      const b = { where: () => b, orderBy: () => b, select: () => Promise.resolve(refRows) };
      return b;
    }
    let col = null;
    const b = {
      distinct: (c) => { col = c; return b; },
      whereNotNull: () => b,
      andWhere: () => Promise.resolve(planRowsByCol[col] || []),
    };
    return b;
  };
}

beforeEach(() => { db.mockReset(); });

describe('isValidType', () => {
  it('accepts known reference types and rejects others', () => {
    expect(isValidType('FUNDING_SOURCE')).toBe(true);
    expect(isValidType('GRANT')).toBe(true);
    expect(isValidType('NONSENSE')).toBe(false);
    expect(isValidType(undefined)).toBe(false);
  });
});

describe('getValues', () => {
  it('returns [] for an unknown type without hitting the db', async () => {
    expect(await getValues('NOPE')).toEqual([]);
    expect(db).not.toHaveBeenCalled();
  });

  it('lists curated first, then deduped extras alphabetically (FUNDING_SOURCE)', async () => {
    db.mockImplementation(makeDb(
      [{ value: 'African Union' }, { value: 'GAVI' }],
      {
        primary_funding_source: [{ primary_funding_source: 'gavi' }, { primary_funding_source: 'Canada' }],
        other_funding_source: [{ other_funding_source: 'World Bank' }],
      },
    ));
    const out = await getValues('FUNDING_SOURCE');
    // 'gavi' is dropped (already curated as 'GAVI', case-insensitive); extras sorted.
    expect(out).toEqual(['African Union', 'GAVI', 'Canada', 'World Bank']);
  });

  it('trims and ignores blank used values (GRANT)', async () => {
    db.mockImplementation(makeDb(
      [],
      { grant_name: [{ grant_name: '  HSPA II ' }, { grant_name: '' }, { grant_name: null }] },
    ));
    const out = await getValues('GRANT');
    expect(out).toEqual(['HSPA II']);
  });

  it('collapses case/whitespace variants of an un-curated used value to one (H-3 dedup)', async () => {
    db.mockImplementation(makeDb(
      [], // nothing curated
      {
        primary_funding_source: [{ primary_funding_source: 'World Bank' }, { primary_funding_source: ' world bank ' }],
        other_funding_source: [{ other_funding_source: 'WORLD BANK' }],
      },
    ));
    const out = await getValues('FUNDING_SOURCE');
    // All three spellings are the same source → a single suggestion (first-seen spelling).
    expect(out).toEqual(['World Bank']);
  });
});
