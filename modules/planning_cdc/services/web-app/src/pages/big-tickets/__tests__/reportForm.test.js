import { describe, it, expect } from 'vitest';
import { initialForm, toPayload } from '../report/reportForm';

const ticket = { lines: [{ id: 7 }, { id: 8 }] };

describe('reportForm', () => {
  it('should start from the saved report', () => {
    const report = { progress_status: 'ON_TRACK', narrative: 'N', values: [{ line_id: 7, achieved: '27 MS', achieved_numeric: '27.0000' }] };
    const form = initialForm({ ticket, report, prefill: {} });
    expect(form).toMatchObject({ progress_status: 'ON_TRACK', narrative: 'N', challenges: '' });
    expect(form.values[7]).toEqual({ achieved: '27 MS', achieved_numeric: 27 });
    expect(form.values[8]).toEqual({ achieved: '', achieved_numeric: '' });
  });

  it('should pre-fill from the indicator reports when there is no report', () => {
    const form = initialForm({ ticket, report: null, prefill: { 8: { suggested: 12 } } });
    expect(form.values[8]).toEqual({ achieved: '12', achieved_numeric: 12 });
  });

  it('should build the payload with numbers and nulls', () => {
    const form = { progress_status: '', narrative: 'x', challenges: '', next_steps: '', values: { 7: { achieved: '90%', achieved_numeric: '90' }, 8: { achieved: '', achieved_numeric: '' } } };
    expect(toPayload(form, '2026', true)).toEqual({
      fiscal_year: '2026', submit: true, progress_status: null, narrative: 'x', challenges: null, next_steps: null,
      values: [{ line_id: 7, achieved: '90%', achieved_numeric: 90 }, { line_id: 8, achieved: null, achieved_numeric: null }],
    });
  });
});
