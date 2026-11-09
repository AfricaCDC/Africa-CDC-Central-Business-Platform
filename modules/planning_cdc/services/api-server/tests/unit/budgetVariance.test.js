// ── Budget variance after a SAP import (D-20261105-13) ──

jest.mock('../../src/services/eventBusService', () => ({ emitEvent: jest.fn().mockResolvedValue({}) }));
jest.mock('../../src/services/reminderLog', () => ({ claim: jest.fn().mockResolvedValue(true) }));
jest.mock('../../src/services/settingsService', () => ({
  getInt: jest.fn(async (_k, d) => d),
  getBool: jest.fn(async () => true),
}));
jest.mock('../../src/services/budgetExecution/budgetExecutionQuery', () => ({ activityExecution: jest.fn() }));

const { emitEvent } = require('../../src/services/eventBusService');
const { claim } = require('../../src/services/reminderLog');
const settings = require('../../src/services/settingsService');
const { activityExecution } = require('../../src/services/budgetExecution/budgetExecutionQuery');
const v = require('../../src/services/budgetExecution/budgetVariance');

const RULES_Q4 = { overPct: 100, underGapPct: 30, expectedPct: 75, checkUnder: true };
const act = (id, unit, pct, extra) => ({ id, code: `1.1.${id}`, title: `Activity ${id}`, division_code: unit, released_budget: 1000, execution_pct: pct, ...extra });
const IMPORT = { id: 9, fiscal_year: '2026', as_of_date: '2026-11-05' };

beforeEach(() => {
  jest.clearAllMocks();
  claim.mockResolvedValue(true);
  settings.getBool.mockResolvedValue(true);
});

describe('varianceRules', () => {
  it('should expect 25 % per completed quarter and check slow execution from Q3', async () => {
    expect(await v.varianceRules('2026-11-05')).toEqual(RULES_Q4);
    expect(await v.varianceRules(new Date(2026, 7, 15))).toMatchObject({ expectedPct: 50, checkUnder: true });
    // A DATE read as local midnight keeps its day: 1 October is Q4, not 30 September.
    expect(await v.varianceRules(new Date(2026, 9, 1))).toMatchObject({ expectedPct: 75 });
    expect(await v.varianceRules('2026-05-31')).toMatchObject({ expectedPct: 25, checkUnder: false });
  });
});

describe('varianceOf', () => {
  it('should flag over 100 % and below the expected pace minus the gap', () => {
    expect(v.varianceOf(act(1, 'EPR', 100.1), RULES_Q4)).toBe('OVER');
    expect(v.varianceOf(act(1, 'EPR', 44.9), RULES_Q4)).toBe('UNDER');
    expect(v.varianceOf(act(1, 'EPR', 45), RULES_Q4)).toBeNull();
    expect(v.varianceOf(act(1, 'EPR', 100), RULES_Q4)).toBeNull();
  });

  it('should not flag slow execution before Q3, nor an activity without released budget', () => {
    expect(v.varianceOf(act(1, 'EPR', 0), { ...RULES_Q4, expectedPct: 25, checkUnder: false })).toBeNull();
    expect(v.varianceOf(act(1, 'EPR', null, { released_budget: 0 }), RULES_Q4)).toBeNull();
  });
});

describe('alertVariance', () => {
  it('should email each unit its flagged activities once per import', async () => {
    activityExecution.mockResolvedValue([act(1, 'EPR', 120), act(2, 'EPR', 10), act(3, 'EPR', 60), act(4, 'LAB', 5), act(5, null, 200)]);
    expect(await v.alertVariance({ importRow: IMPORT, actor: { id: 3 } })).toEqual({ units: 2 });
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ kind: v.EVENT_KEY, entityId: 9, period: 'EPR' }));
    const epr = emitEvent.mock.calls.find((c) => c[0].entity.main_division_code === 'EPR')[0];
    expect(epr.metadata.sections.map((s) => s.heading)).toEqual(['Over budget: 1', 'Slow execution: 1']);
    expect(epr.metadata.subject).toBe('Budget execution EPR: 2 activities to look at');
    expect(JSON.stringify(epr.metadata)).not.toMatch(/—/);
  });

  it('should not email a unit twice for the same import', async () => {
    activityExecution.mockResolvedValue([act(1, 'EPR', 120)]);
    claim.mockResolvedValue(false);
    expect(await v.alertVariance({ importRow: IMPORT, actor: null })).toEqual({ units: 0 });
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it('should do nothing when switched off, and never throw', async () => {
    settings.getBool.mockResolvedValueOnce(false);
    expect(await v.alertVariance({ importRow: IMPORT, actor: null })).toEqual({ units: 0 });
    expect(activityExecution).not.toHaveBeenCalled();
    activityExecution.mockRejectedValueOnce(new Error('db down'));
    expect(await v.alertVariance({ importRow: IMPORT, actor: null })).toEqual({ units: 0 });
  });
});
