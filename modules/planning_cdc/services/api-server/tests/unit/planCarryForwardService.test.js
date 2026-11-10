// ── planCarryForwardService tests ──
//
// Runs against the in-memory knex stand-in: assertions are on resulting rows.

const { makeFakeKnex } = require('../helpers/fakeKnex');
const svc = require('../../src/services/planCarryForwardService');
const { PLAN_NODE_TYPES: T } = require('@rbm/lib/enums');

const MAP = { '2.2': '3.1', '5.2': null };

function setup(extraNodes = []) {
  const tables = {
    plan_nodes: [
      { id: 1, fiscal_year: '2026', node_type: T.OUTCOME_AREA, code: '2.2', tier_id: null },
      { id: 2, fiscal_year: '2026', node_type: T.OUTCOME_AREA, code: '5.2', tier_id: null },
      { id: 3, fiscal_year: '2026', node_type: T.OUTCOME_INDICATOR, tier_id: 3, code: 'EPR.1', title: 'Drills run', parent_id: 1, target_y4: '10', target_y5: null },
      { id: 4, fiscal_year: '2026', node_type: T.OUTCOME_INDICATOR, tier_id: 4, code: 'PRA.9', title: 'Briefs', parent_id: 2, target_y4: '3', target_y5: '5' },
      { id: 5, fiscal_year: '2026', node_type: T.OUTCOME_INDICATOR, tier_id: 2, code: '1.1.1', title: 'T2 stays', parent_id: 1 },
      { id: 50, fiscal_year: '2027', node_type: T.OUTCOME_AREA, code: '3.1', tier_id: null },
      ...extraNodes,
    ],
    plan_node_active_periods: [
      { id: 1, plan_node_id: 3, fiscal_year_num: 4, quarter: 3 },
      { id: 2, plan_node_id: 3, fiscal_year_num: 4, quarter: 4 },
      { id: 3, plan_node_id: 3, fiscal_year_num: 5, quarter: 1 },
    ],
  };
  return { knex: makeFakeKnex(tables), tables };
}

const ARGS = {
  fromYear: '2026', toYear: '2027', tierIds: [3, 4], parentCodeMap: MAP,
  fillTargets: { target_y5: 'target_y4' },
  periodYearNum: { from: 4, to: 5 },
};
const copies = (tables) => tables.plan_nodes.filter((n) => n.fiscal_year === '2027' && n.tier_id);

describe('carryForwardIndicators', () => {
  it('should copy only the requested tiers under the mapped target-year parent', async () => {
    const { knex, tables } = setup();
    const out = await svc.carryForwardIndicators(knex, ARGS);
    expect(out).toEqual({ copied: 2, skipped: 0, periods: 2 });
    const epr = copies(tables).find((n) => n.code === 'EPR.1');
    expect(epr.parent_id).toBe(50);
    expect(copies(tables).find((n) => n.code === 'PRA.9').parent_id).toBeNull();
    expect(copies(tables).some((n) => n.code === '1.1.1')).toBe(false);
  });

  it('should fill an empty target column from the source column only', async () => {
    const { knex, tables } = setup();
    await svc.carryForwardIndicators(knex, ARGS);
    expect(copies(tables).find((n) => n.code === 'EPR.1').target_y5).toBe('10');
    expect(copies(tables).find((n) => n.code === 'PRA.9').target_y5).toBe('5');
  });

  it('should copy only the source plan-year quarters, re-indexed to the target year', async () => {
    const { knex, tables } = setup();
    await svc.carryForwardIndicators(knex, ARGS);
    const epr = copies(tables).find((n) => n.code === 'EPR.1');
    const periods = tables.plan_node_active_periods.filter((p) => p.plan_node_id === epr.id);
    expect(periods.map((p) => [p.fiscal_year_num, p.quarter])).toEqual([[5, 3], [5, 4]]);
  });

  it('should skip indicators already present in the target year', async () => {
    const { knex } = setup([
      { id: 60, fiscal_year: '2027', node_type: T.OUTCOME_INDICATOR, tier_id: 3, code: 'EPR.1', title: 'Drills run', parent_id: 50 },
    ]);
    const out = await svc.carryForwardIndicators(knex, ARGS);
    expect(out).toMatchObject({ copied: 1, skipped: 1 });
  });

  it('should be idempotent when run twice', async () => {
    const { knex, tables } = setup();
    await svc.carryForwardIndicators(knex, ARGS);
    const second = await svc.carryForwardIndicators(knex, ARGS);
    expect(second).toMatchObject({ copied: 0, skipped: 2 });
    expect(copies(tables)).toHaveLength(2);
  });

  it('should abort when a source parent is missing from the map', async () => {
    const { knex } = setup();
    await expect(svc.carryForwardIndicators(knex, { ...ARGS, parentCodeMap: { '5.2': null } }))
      .rejects.toThrow(/Parent 2.2 of EPR.1 is not in parent_code_map/);
  });

  it('should abort when the mapped parent does not exist in the target year', async () => {
    const { knex } = setup();
    await expect(svc.carryForwardIndicators(knex, { ...ARGS, parentCodeMap: { '2.2': '9.9', '5.2': null } }))
      .rejects.toThrow(/Mapped parent 9.9 does not exist/);
  });
});

describe('buildCopy', () => {
  it('should drop id and timestamps and set the target year', () => {
    const row = svc.buildCopy({ id: 3, created_at: 'x', updated_at: 'y', code: 'A', fiscal_year: '2026' }, { toYear: '2027', parentId: 7 });
    expect(row).toEqual({ code: 'A', fiscal_year: '2027', parent_id: 7 });
  });
});

describe('buildCopy JSON columns', () => {
  it('should write parsed JSON columns back as JSON text and keep dates', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    const row = svc.buildCopy({ id: 1, contributing_divisions: ['EPR', 'SDI'], start_date: d }, { toYear: '2027', parentId: null });
    expect(row.contributing_divisions).toBe('["EPR","SDI"]');
    expect(row.start_date).toBe(d);
  });
});
