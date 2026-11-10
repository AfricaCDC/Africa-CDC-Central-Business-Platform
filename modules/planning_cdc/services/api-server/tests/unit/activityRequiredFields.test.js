// ── H-5 required-activity-field validation ──
//
// Unit tests for the shared per-field rule (@rbm/lib/enums.isActivityFieldProvided)
// and the two route helpers built on it:
//   · missingRequiredActivityFields  — CREATE: every required field must be set
//   · invalidProvidedActivityFields  — UPDATE: a SENT required field may not be blanked
//
// These are pure functions (no DB), so no knex interaction is exercised.

const {
  REQUIRED_SPECIFIC_ACTIVITY_FIELDS,
  isActivityFieldProvided,
} = require('@rbm/lib/enums');
const {
  missingRequiredActivityFields,
  invalidProvidedActivityFields,
} = require('../../src/routes/plan-nodes/_helpers');

// A complete, valid set of required fields.
// H-5 (D-20260621): grant_name is intentionally NOT part of the required set.
const COMPLETE = {
  activity_type: 'TRAINING',
  implementation_at_rcc: 1,
  budgeting_arrangement: 'Extramural',
  primary_funding_source: 'World Bank',
  budget_main: 50000,
};

describe('REQUIRED_SPECIFIC_ACTIVITY_FIELDS', () => {
  it('lists exactly the five business-mandated fields (grant_name excluded — H-5)', () => {
    expect([...REQUIRED_SPECIFIC_ACTIVITY_FIELDS].sort()).toEqual([
      'activity_type',
      'budget_main',
      'budgeting_arrangement',
      'implementation_at_rcc',
      'primary_funding_source',
    ]);
  });

  it('does NOT require grant_name (H-5: grant reference list unavailable)', () => {
    expect([...REQUIRED_SPECIFIC_ACTIVITY_FIELDS]).not.toContain('grant_name');
  });
});

describe('isActivityFieldProvided', () => {
  it('treats null / undefined / blank string as not provided', () => {
    expect(isActivityFieldProvided('primary_funding_source', null)).toBe(false);
    expect(isActivityFieldProvided('primary_funding_source', undefined)).toBe(false);
    expect(isActivityFieldProvided('primary_funding_source', '   ')).toBe(false);
  });

  it('requires budget_main to be a finite number, 0 allowed for an activity with no cost', () => {
    expect(isActivityFieldProvided('budget_main', 0)).toBe(true);
    expect(isActivityFieldProvided('budget_main', '0')).toBe(true);
    expect(isActivityFieldProvided('budget_main', '')).toBe(false);
    expect(isActivityFieldProvided('budget_main', -5)).toBe(false);
    expect(isActivityFieldProvided('budget_main', 'abc')).toBe(false);
    expect(isActivityFieldProvided('budget_main', 1)).toBe(true);
    expect(isActivityFieldProvided('budget_main', '1500')).toBe(true);
  });

  it('accepts implementation_at_rcc of 0 or 1 (Yes/No), rejects anything else', () => {
    expect(isActivityFieldProvided('implementation_at_rcc', 0)).toBe(true);
    expect(isActivityFieldProvided('implementation_at_rcc', 1)).toBe(true);
    expect(isActivityFieldProvided('implementation_at_rcc', '0')).toBe(true);
    expect(isActivityFieldProvided('implementation_at_rcc', '1')).toBe(true);
    expect(isActivityFieldProvided('implementation_at_rcc', 2)).toBe(false);
    expect(isActivityFieldProvided('implementation_at_rcc', '')).toBe(false);
  });

  it('accepts any non-blank value for the plain string fields', () => {
    expect(isActivityFieldProvided('activity_type', 'TRAINING')).toBe(true);
    expect(isActivityFieldProvided('budgeting_arrangement', 'Extramural')).toBe(true);
  });
});

describe('missingRequiredActivityFields (CREATE)', () => {
  it('returns [] when every required field is present and valid', () => {
    expect(missingRequiredActivityFields(COMPLETE)).toEqual([]);
  });

  it('returns every field when the body is empty', () => {
    expect(missingRequiredActivityFields({}).sort()).toEqual(
      [...REQUIRED_SPECIFIC_ACTIVITY_FIELDS].sort(),
    );
  });

  it('flags a blank cost and a blank funding source', () => {
    const out = missingRequiredActivityFields({ ...COMPLETE, budget_main: '', primary_funding_source: '' });
    expect(out).toContain('budget_main');
    expect(out).toContain('primary_funding_source');
    expect(out).not.toContain('grant_name');
  });
});

describe('invalidProvidedActivityFields (UPDATE)', () => {
  it('returns [] for a partial patch that omits all required fields', () => {
    expect(invalidProvidedActivityFields({ title: 'x', end_date: '2026-12-31' })).toEqual([]);
  });

  it('flags only the required fields that were sent AND blanked', () => {
    const out = invalidProvidedActivityFields({ primary_funding_source: '', activity_type: 'EVENT' });
    expect(out).toEqual(['primary_funding_source']);
  });

  it('does not flag a blanked grant_name on update (H-5: not a required field)', () => {
    expect(invalidProvidedActivityFields({ grant_name: '' })).toEqual([]);
  });

  it('returns [] when a sent required field carries a valid value', () => {
    expect(invalidProvidedActivityFields({ budget_main: 1200 })).toEqual([]);
  });
});
