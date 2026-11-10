// ── Specific activity planning service (D-20261026-01) ──
//
// Scoring comes from @rbm/lib/complexity; the DB is the shared knex mock.

const db = require('../../src/config/db');
const { scoreComplexity, COMPLEXITY_CRITERIA } = require('@rbm/lib/complexity');
const { saveScreening, saveCostLines } = require('../../src/services/activityPlanning');

const all = (v) => Object.fromEntries(COMPLEXITY_CRITERIA.map((c) => [c.key, v]));

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.first.mockReset().mockResolvedValue(undefined);
});

describe('scoreComplexity', () => {
  it('should sum the five ratings and pick the provisional band', () => {
    expect(scoreComplexity(all(1))).toMatchObject({ total: 5, band: { key: 'LOWER' } });
    expect(scoreComplexity({ ...all(1), scope_impact: 3 })).toMatchObject({ total: 7, band: { key: 'LOWER' } });
    expect(scoreComplexity({ ...all(2), risk_uncertainty: 1 })).toMatchObject({ total: 9, band: { key: 'MODERATE' } });
    expect(scoreComplexity({ ...all(2), risk_uncertainty: 3 })).toMatchObject({ total: 11, band: { key: 'MODERATE' } });
    expect(scoreComplexity({ ...all(2), risk_uncertainty: 3, scope_impact: 3 })).toMatchObject({ total: 12, band: { key: 'HIGH' } });
    expect(scoreComplexity(all(3))).toMatchObject({ total: 15, band: { key: 'HIGH' } });
  });

  it('should return null while a criterion is missing or out of range', () => {
    expect(scoreComplexity({ ...all(2), scope_impact: null })).toBeNull();
    expect(scoreComplexity({ ...all(2), scope_impact: 4 })).toBeNull();
    expect(scoreComplexity()).toBeNull();
  });
});

describe('saveScreening', () => {
  it('should reject Yes without the five ratings', async () => {
    await expect(saveScreening(4102, { requires_complex_decision: true, scope_impact: 2 }, 7)).rejects.toThrow('Rate the five criteria');
  });

  it('should store Yes with the total and band', async () => {
    await saveScreening(4102, { requires_complex_decision: true, ...all(2) }, 7);
    expect(db.__chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      plan_node_id: 4102, requires_complex_decision: true, total_score: 10, complexity_band: 'MODERATE', updated_by_user_id: 7,
    }));
  });

  it('should clear the ratings on No and update an existing screening', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 3 });
    await saveScreening(4102, { requires_complex_decision: false, ...all(3) }, 7);
    expect(db.__chain.update).toHaveBeenCalledWith(expect.objectContaining({
      requires_complex_decision: false, scope_impact: null, total_score: null, complexity_band: null,
    }));
  });
});

describe('saveCostLines', () => {
  it('should reject a line whose category does not exist', async () => {
    db.__chain.pluck.mockResolvedValueOnce([2]);
    await expect(saveCostLines(4102, [
      { expense_category_id: 2, description: 'Tickets', amount: 10 },
      { expense_category_id: 99, description: 'Unknown', amount: 5 },
    ])).rejects.toThrow('Choose an expense category');
  });
});
