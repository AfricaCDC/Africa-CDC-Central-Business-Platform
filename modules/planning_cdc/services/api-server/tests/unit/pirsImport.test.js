// ── services/pirsImport + the committed PIRS 2027 snapshot (D-20261029-01) ──

const { buildIndicatorRows, toNumber } = require('../../src/services/pirsImport');
const snapshot = require('../../src/db/data/pirs_2027.json');
const map = require('../../src/db/data/pirs_2027_map.json');

const indicator = (over = {}) => ({
  code: 'SDI.2.1-3', tier: 3, title: 'Events detected', objective_code: 'OBJ2.1',
  pillar: 'Cross-cutting Pillar', bu: 'Division of Surveillance and Disease Intelligence',
  definition: 'Def', calc_type: 'percentage', baseline: '20',
  targets: { 2023: null, 2024: '40', 2025: '50', 2026: '60', 2027: '70%' }, ...over,
});
const lookups = {
  areaIdByCode: new Map([['2.1', 6480]]),
  divisionCodes: new Set(['SDI']),
  pillarIdByName: new Map([['Crosscuting', 6]]),
  unitIdByCode: new Map([['PERCENTAGE', 2]]),
};

describe('toNumber', () => {
  it('should read plain, percent and thousands values and refuse the rest', () => {
    expect(toNumber('70%')).toBe(70);
    expect(toNumber('1,200')).toBe(1200);
    expect(toNumber('1:4')).toBeNull();
    expect(toNumber(null)).toBeNull();
  });
});

describe('buildIndicatorRows', () => {
  it('should map an indicator to its 2027 area, BU, pillar, unit and plan-year targets', () => {
    const { rows, errors } = buildIndicatorRows({ fiscal_year: '2027', indicators: [indicator()] }, map, lookups);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      tier_id: 3, code: 'SDI.2.1-3', fiscal_year: '2027', parent_id: 6480, responsible_division_code: 'SDI',
      pillar_id: 6, unit_of_measure_id: 2, baseline_numeric: 20, target_y4: '60', target_y5: '70%', target_y5_numeric: 70,
      target_y1: null, contributing_divisions: '[]', budget_main: 0,
    });
  });

  it('should leave the BU empty for a label mapped to no division', () => {
    const { rows, errors } = buildIndicatorRows({ fiscal_year: '2027', indicators: [indicator({ bu: 'Gender Unit' })] }, map, lookups);
    expect(errors).toEqual([]);
    expect(rows[0].responsible_division_code).toBeNull();
  });

  it('should report a label missing from the map and a mapped code missing from the database', () => {
    const { errors } = buildIndicatorRows({ fiscal_year: '2027', indicators: [indicator({ bu: 'Unknown BU', objective_code: 'OBJ3.1' })] }, map, lookups);
    expect(errors).toEqual([
      'SDI.2.1-3: objective code "OBJ3.1" maps to "3.1", absent from the database',
      'SDI.2.1-3: BU "Unknown BU" is not in the map',
    ]);
  });
});

describe('PIRS 2027 snapshot and map', () => {
  it('should hold 142 T3 and 321 T4 indicators with unique codes', () => {
    const tiers = snapshot.indicators.reduce((a, i) => ({ ...a, [i.tier]: (a[i.tier] || 0) + 1 }), {});
    expect(tiers).toEqual({ 3: 142, 4: 321 });
    expect(new Set(snapshot.indicators.map((i) => i.code)).size).toBe(463);
  });

  it('should map every objective, BU, pillar and unit of the snapshot', () => {
    for (const i of snapshot.indicators) {
      expect(map.objective_area).toHaveProperty([i.objective_code]);
      expect(map.bu).toHaveProperty([i.bu]);
      expect(map.pillar).toHaveProperty([i.pillar]);
      expect(map.unit).toHaveProperty([i.calc_type]);
    }
  });
});
