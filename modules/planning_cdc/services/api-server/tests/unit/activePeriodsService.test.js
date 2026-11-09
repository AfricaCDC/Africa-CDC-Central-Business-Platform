// ── activePeriodsService unit tests (D-20260708-02) ──
//
// "Target set ⇒ reporting expected": ensureTargetQuartersActive flags the
// current-FY quarters whose qN_target_numeric > 0. Additive, never throws.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

jest.mock('@rbm/lib/fiscalYear', () => ({
  currentFy: jest.fn(() => 4),
}));

const { NODE_TYPES } = require('@rbm/lib/enums');
const { ensureTargetQuartersActive } = require('../../src/services/activePeriodsService');
const chain = sharedDb.__chain;

// insert().onConflict().ignore() — the shared mock's insert resolves an
// array; re-arm it as a chainable for this service's conflict-safe insert.
let ignoreSpy;
function armInsertChain() {
  ignoreSpy = jest.fn().mockResolvedValue(undefined);
  chain.insert.mockReset().mockReturnValue({ onConflict: jest.fn().mockReturnValue({ ignore: ignoreSpy }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  armInsertChain();
  chain.first.mockReset().mockResolvedValue(undefined);
  ['where', 'whereIn'].forEach((m) => chain[m].mockClear().mockReturnValue(chain));
});

describe('ensureTargetQuartersActive', () => {
  it('should flag every current-FY quarter whose target is > 0', async () => {
    chain.first.mockResolvedValueOnce({
      id: 42, node_type: NODE_TYPES.OUTCOME_INDICATOR,
      q1_target_numeric: null, q2_target_numeric: 5, q3_target_numeric: 0, q4_target_numeric: '12',
    });
    const n = await ensureTargetQuartersActive(42);
    expect(n).toBe(2);
    expect(chain.insert).toHaveBeenCalledWith([
      { plan_node_id: 42, fiscal_year_num: 4, quarter: 2 },
      { plan_node_id: 42, fiscal_year_num: 4, quarter: 4 },
    ]);
    expect(ignoreSpy).toHaveBeenCalled();
  });

  it('should do nothing when no quarterly target is positive', async () => {
    chain.first.mockResolvedValueOnce({
      id: 42, node_type: NODE_TYPES.OUTCOME_INDICATOR,
      q1_target_numeric: 0, q2_target_numeric: null, q3_target_numeric: null, q4_target_numeric: null,
    });
    expect(await ensureTargetQuartersActive(42)).toBe(0);
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('should skip non-indicator nodes and missing rows', async () => {
    chain.first.mockResolvedValueOnce({ id: 7, node_type: NODE_TYPES.SPECIFIC_ACTIVITY, q1_target_numeric: 9 });
    expect(await ensureTargetQuartersActive(7)).toBe(0);
    chain.first.mockResolvedValueOnce(undefined);
    expect(await ensureTargetQuartersActive(999)).toBe(0);
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('should never throw — DB failure logs and returns 0 (indicator save must not fail)', async () => {
    chain.first.mockRejectedValueOnce(new Error('boom'));
    await expect(ensureTargetQuartersActive(42)).resolves.toBe(0);
  });
});
