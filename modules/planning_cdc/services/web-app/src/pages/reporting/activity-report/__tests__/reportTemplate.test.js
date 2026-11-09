// ── Activity Reporting Template: form model (D-20261001-01) ──

import { describe, it, expect } from 'vitest';
import { calcDuration, formFromData, buildPayload, budgetCodesOf, listMissingForSubmit, upcomingQuarters, EMPTY_FORM } from '../reportTemplate';

describe('calcDuration', () => {
  it('should count a one-day activity as one day', () => {
    expect(calcDuration('2026-03-01', '2026-03-01')).toBe(1);
  });

  it('should include both the start and the end day', () => {
    expect(calcDuration('2026-03-01', '2026-03-05')).toBe(5);
  });

  it('should return null for an inverted range or a missing bound', () => {
    expect(calcDuration('2026-03-05', '2026-03-01')).toBeNull();
    expect(calcDuration('', '2026-03-01')).toBeNull();
  });
});

describe('formFromData', () => {
  it('should take the mission type from the activity, even over the report', () => {
    expect(formFromData({ activity_type: 'EVENT' }, null).mission_type).toBe('EVENT');
    expect(formFromData({ activity_type: 'TRAINING' }, { mission_type: 'OTHER' }).mission_type).toBe('TRAINING');
  });

  it('should keep the report mission type for a legacy activity without a type', () => {
    expect(formFromData({ activity_type: null }, { mission_type: 'OTHER' }).mission_type).toBe('OTHER');
    expect(formFromData({}, null).mission_type).toBe('');
  });

  it('should prefill the objectives from the planned description', () => {
    expect(formFromData({ description: 'Train 30 officers' }, null).objectives).toBe('Train 30 officers');
  });

  it('should not prefill objectives for an in-office activity', () => {
    const form = formFromData({ description: 'x' }, { mission_type: 'IN_OFFICE' });
    expect(form.objectives).toBe('');
  });

  it('should keep what the report holds over the activity defaults', () => {
    const form = formFromData(
      { activity_type: 'EVENT', description: 'planned', location: 'Virtual' },
      { mission_type: 'OFFICIAL_ENGAGEMENT', objectives: 'reported', location: 'Kenya', status: 'DRAFT' },
    );
    expect(form).toMatchObject({ mission_type: 'EVENT', objectives: 'reported', location: 'Kenya' });
  });

  it('should parse stored JSON and survive a corrupt value', () => {
    const ok = formFromData({}, { type_details: '{"trainees_total":3}', member_states: '["Kenya"]' });
    expect(ok.type_details).toEqual({ trainees_total: 3 });
    expect(ok.member_states).toEqual(['Kenya']);
    expect(formFromData({}, { type_details: '{oops' }).type_details).toEqual({});
  });
});

describe('budgetCodesOf', () => {
  it('should fall back to the codes of the broad activity', () => {
    expect(budgetCodesOf({ budget_codes: [], parent_broad: { budget_codes: [{ fund_code: 'MS-1' }, { fund_code: 'GF-2' }] } }))
      .toEqual(['MS-1', 'GF-2']);
  });

  it('should return an empty list when nothing is linked', () => {
    expect(budgetCodesOf({})).toEqual([]);
  });
});

describe('buildPayload', () => {
  const activity = { budget_main: 500, parent_broad: { budget_codes: [{ fund_code: 'MS-1' }] } };
  const ctx = { activityId: '5', quarter: 'Q3', fiscalYear: '2026', activity };

  it('should send the template fields and the primary budget code', () => {
    const form = {
      ...formFromData(activity, null),
      mission_type: 'TRAINING', venue: 'UNCC', strategic_needs: 'AHSS',
      type_details: { trainees_total: '30' }, start_date: '2026-07-01', end_date: '2026-07-01',
    };
    expect(buildPayload(form, ctx)).toMatchObject({
      plan_node_id: 5, mission_type: 'TRAINING', venue: 'UNCC', strategic_needs: 'AHSS',
      type_details: { trainees_total: '30' }, budget_code: 'MS-1', duration_days: 1, total_budget: 500,
    });
  });

  it('should keep a zero spend instead of dropping it', () => {
    const payload = buildPayload({ ...formFromData(activity, null), actual_spend: '0' }, ctx);
    expect(payload.actual_spend).toBe(0);
  });

  it('should send null rather than empty strings', () => {
    const payload = buildPayload(formFromData(activity, null), ctx);
    expect(payload.venue).toBeNull();
    expect(payload.mission_type).toBeNull();
  });
});

describe('listMissingForSubmit', () => {
  it('should not require the new template fields to submit', () => {
    const form = {
      start_date: '2026-07-01', end_date: '2026-07-01', location: 'Kenya',
      lead_organiser: 'Jane', narrative: 'x', actual_spend: 0,
    };
    expect(listMissingForSubmit(form, 1)).toEqual([]);
  });
});

describe('activity not started yet (D-20261013-08)', () => {
  it('should offer every quarter after the reported one, to the end of next year', () => {
    expect(upcomingQuarters('Q3', '2026').map((o) => o.value)).toEqual(['Q4-2026', 'Q1-2027', 'Q2-2027', 'Q3-2027', 'Q4-2027']);
    expect(upcomingQuarters('Q4', '2026')[0]).toEqual({ value: 'Q1-2027', label: 'Q1 2027' });
  });

  it('should only require the expected start when the activity has not started', () => {
    expect(listMissingForSubmit({ ...EMPTY_FORM, not_started: true }, 0)).toEqual(['expected start quarter']);
    expect(listMissingForSubmit({ ...EMPTY_FORM, not_started: true, expected_start: 'Q4-2026' }, 0)).toEqual([]);
  });

  it('should round-trip the expected start between the report row and the payload', () => {
    const form = formFromData({}, { not_started: 1, expected_start_quarter: 'Q1', expected_start_year: '2027' });
    expect(form).toMatchObject({ not_started: true, expected_start: 'Q1-2027' });
    const body = buildPayload(form, { activityId: '5', quarter: 'Q3', fiscalYear: '2026', activity: {} });
    expect(body).toMatchObject({ not_started: true, expected_start_quarter: 'Q1', expected_start_year: '2027' });
    const started = buildPayload({ ...form, not_started: false }, { activityId: '5', quarter: 'Q3', fiscalYear: '2026', activity: {} });
    expect(started).toMatchObject({ not_started: false, expected_start_quarter: null, expected_start_year: null });
  });
});

