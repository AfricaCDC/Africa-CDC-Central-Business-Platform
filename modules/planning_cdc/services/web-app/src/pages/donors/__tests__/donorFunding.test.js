import { describe, it, expect } from 'vitest';
import { fundingBySource, fundingByUnit, shareOf } from '../donorFunding';

const CODES = [
  { funding_source_id: 48, funding_source_name: 'World Bank', amount: '100', plan_node_id: 3, division_name: 'Digital' },
  { funding_source_id: 48, funding_source_name: 'World Bank', amount: '50', plan_node_id: 3, division_name: null },
  { funding_source_id: 55, funding_source_name: 'CEPI', amount: '400', plan_node_id: 9, division_name: 'Digital' },
  { funding_source_id: null, amount: '0', plan_node_id: 9 },
];

describe('fundingBySource', () => {
  it('should group the codes by source, largest first, without codes lacking a source', () => {
    expect(fundingBySource(CODES)).toEqual([
      { id: 55, name: 'CEPI', amount: 400, codes: 1, activities: 1 },
      { id: 48, name: 'World Bank', amount: 150, codes: 2, activities: 1 },
    ]);
  });

  it('should name a source without a name by its id', () => {
    expect(fundingBySource([{ funding_source_id: 7, amount: 1 }])[0].name).toBe('Source 7');
  });
});

describe('fundingByUnit', () => {
  it('should group by Business Unit and keep codes without a unit apart', () => {
    expect(fundingByUnit(CODES.slice(0, 3))).toEqual([
      { unit: 'Digital', amount: 500, codes: 2 },
      { unit: 'No Business Unit', amount: 50, codes: 1 },
    ]);
  });
});

describe('shareOf', () => {
  it('should round the percent and return 0 for a zero total', () => {
    expect(shareOf(1, 3)).toBe(33);
    expect(shareOf(5, 0)).toBe(0);
  });
});
