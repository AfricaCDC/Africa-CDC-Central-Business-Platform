import { describe, it, expect } from 'vitest';
import { initialForm, toPayload, validateForm } from '../form/useTicketForm';
import { pillarShort, pillarTitle, groupByPillar, yearsLabel } from '../config';

const ticket = {
  id: 18, code: 'BT18', title: 'Workforce trained', pillar_id: 2, lead_division_code: 'Wkf',
  contributors: [{ division_code: 'NPHI' }], contributors_note: null, expected_result: null,
  delivery_model: 'Mapping', success_factors: null, start_year: '2026', end_year: null, is_active: 1,
  lines: [{ id: 5, label: 'Long-term', indicator_code: 'Wkf.8.2-5', tier: 'Tier 4', target: { annual_target: '163', annual_target_numeric: '163.0000', q2_milestone: '25' } }],
};

describe('initialForm', () => {
  it('should start a new ticket with one empty line in the chosen year', () => {
    const form = initialForm(null, '2027');
    expect(form.start_year).toBe('2027');
    expect(form.lines).toHaveLength(1);
    expect(form.lines[0].id).toBeNull();
  });

  it('should load an existing ticket with its targets as strings', () => {
    const form = initialForm(ticket, '2026');
    expect(form).toMatchObject({ code: 'BT18', pillar_id: '2', contributors: ['NPHI'], end_year: '', is_active: true });
    expect(form.lines[0]).toMatchObject({ id: 5, indicator_code: 'Wkf.8.2-5' });
    expect(form.lines[0].target).toMatchObject({ annual_target: '163', q2_milestone: '25', q3_milestone: '' });
  });
});

describe('toPayload', () => {
  it('should send numbers, nulls for blanks and the targets year', () => {
    const form = initialForm(ticket, '2026');
    form.lines[0].target.q3_milestone_numeric = '40';
    const payload = toPayload(form, '2026');
    expect(payload).toMatchObject({ pillar_id: 2, end_year: null, fiscal_year: '2026', contributors_note: null, delivery_model: 'Mapping' });
    expect(payload.lines[0]).toMatchObject({ id: 5, label: 'Long-term' });
    expect(payload.lines[0].target).toMatchObject({ annual_target_numeric: 163, q3_milestone_numeric: 40, q4_milestone: null, q4_milestone_numeric: null });
  });

  it('should leave the id out of a new line', () => {
    const payload = toPayload(initialForm(null, '2026'), '2026');
    expect(payload.lines[0]).not.toHaveProperty('id');
  });
});

describe('validateForm', () => {
  const valid = () => ({ ...initialForm(ticket, '2026') });

  it('should accept a complete ticket', () => {
    expect(validateForm(valid(), '2026')).toEqual([]);
  });

  it.each([
    ['a bad code', (f) => { f.code = 'B T'; }, 'Code'],
    ['no title', (f) => { f.title = ''; }, 'Title'],
    ['no lead BU', (f) => { f.lead_division_code = ''; }, 'lead business unit'],
    ['an end year before the start', (f) => { f.end_year = '2025'; }, 'End year'],
    ['no line', (f) => { f.lines = []; }, 'at least one'],
    ['a negative target', (f) => { f.lines[0].target.annual_target_numeric = '-1'; }, 'negative'],
  ])('should refuse %s', (_label, mutate, message) => {
    const form = valid();
    mutate(form);
    expect(validateForm(form, '2026').join(' ')).toContain(message);
  });

  it('should refuse targets for a year outside the ticket', () => {
    const form = { ...valid(), end_year: '2026' };
    expect(validateForm(form, '2027').join(' ')).toContain('outside the ticket years');
  });
});

describe('config helpers', () => {
  it('should shorten and title pillar names', () => {
    expect(pillarShort('Pillar 4_Digital transformation')).toBe('Pillar 4');
    expect(pillarTitle('Pillar 4_Digital transformation')).toBe('Digital transformation');
    expect(pillarShort('Crosscuting')).toBe('Cross-cutting');
    expect(pillarShort(null)).toBe('No pillar');
  });

  it('should group rows by pillar in their order', () => {
    const groups = groupByPillar([{ id: 1, pillar_id: 2, pillar_name: 'B' }, { id: 2, pillar_id: 1, pillar_name: 'A' }, { id: 3, pillar_id: 2, pillar_name: 'B' }]);
    expect(groups.map((g) => [g.key, g.items.length])).toEqual([['2', 2], ['1', 1]]);
  });

  it('should label the years of a ticket', () => {
    expect(yearsLabel({ start_year: '2026', end_year: null })).toBe('2026 – open');
    expect(yearsLabel({ start_year: '2026', end_year: '2026' })).toBe('2026');
  });
});
