import { describe, it, expect } from 'vitest';
import { formFromDetail, copyFormFrom, nextPlanYear, copyPath } from '../copyActivity';

const SOURCE = {
  id: 42, code: '1.2.3.01', fiscal_year: '2026', title: 'EQA workshop', description: 'Five days', parent_id: 7,
  linked_indicator_id: 40, focal_user_id: 9, activity_type: 'EVENT', risk_level: 'HIGH', implementation_at_rcc: 0,
  secondary_division_codes: '["LAB","EPR"]', responsible_division_code: 'LAB', budgeting_arrangement: 'Intramural',
  primary_funding_source: 'AU', other_funding_source: null, grant_name: null, budget_main: 12000,
  q1_budget: 0, q2_budget: 12000, q3_budget: null, q4_budget: undefined, location: 'Kenya; Uganda',
  start_date: '2026-05-04T00:00:00.000Z', end_date: '2026-05-08', is_operational: 1,
};

describe('formFromDetail', () => {
  it('should turn a saved activity into form values', () => {
    const f = formFromDetail(SOURCE);
    expect(f).toMatchObject({
      title: 'EQA workshop', parent_id: 7, linked_indicator_id: 40, risk_level: 'HIGH', other_funding_source: '',
      implementation_at_rcc: '0', is_operational: '1', budget_main: 12000, q1_budget: 0, q3_budget: '', q4_budget: '',
      start_date: '2026-05-04', end_date: '2026-05-08',
    });
    expect(f.secondary_division_codes).toEqual(['LAB', 'EPR']);
    expect(f.locations.length).toBe(2);
  });
});

describe('copyFormFrom', () => {
  it('should keep the content and leave the broad, the indicator and the dates to choose', () => {
    const f = copyFormFrom(SOURCE);
    expect(f).toMatchObject({ title: 'EQA workshop', focal_user_id: 9, budget_main: 12000, parent_id: '', linked_indicator_id: '', start_date: '', end_date: '' });
  });
});

describe('nextPlanYear and copyPath', () => {
  it('should offer the next year only once its plan is loaded', () => {
    expect(nextPlanYear('2026', ['2027', '2026'])).toBe('2027');
    expect(nextPlanYear('2027', ['2027', '2026'])).toBeNull();
    expect(copyPath(42, '2027')).toBe('/my-specifics/new?copy=42&fy=2027');
  });
});
