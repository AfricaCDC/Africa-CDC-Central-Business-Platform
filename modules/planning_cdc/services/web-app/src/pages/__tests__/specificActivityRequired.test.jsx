// ── H-5: SpecificActivityFormPage required-field gate ──
//
// The create form must not let a user save until the five business-mandated
// fields are filled (grant_name was dropped from the required set — H-5,
// D-20260621). The page computes `canSave` from the SAME shared rule the
// backend uses (@rbm/lib/enums), so these tests lock that contract: the exact
// `missingRequired` / `canSave` computation the page performs, driven off real
// form-shaped values. (Live in-browser gating is verified separately via
// Playwright; this guards the pure logic against drift.)

import { describe, it, expect } from 'vitest';
import {
  REQUIRED_SPECIFIC_ACTIVITY_FIELDS,
  isActivityFieldProvided,
} from '@rbm/lib/enums';

// Mirror of SpecificActivityFormPage's gate.
function gate(form) {
  const missingRequired = REQUIRED_SPECIFIC_ACTIVITY_FIELDS.filter(
    (f) => !isActivityFieldProvided(f, form[f]),
  );
  const canSave = Boolean(form.title.trim()) && Boolean(form.parent_id) && missingRequired.length === 0;
  return { missingRequired, canSave };
}

const COMPLETE = {
  title: 'My activity',
  parent_id: 7,
  activity_type: 'TRAINING',
  implementation_at_rcc: '1',     // form stores Yes/No as strings
  budgeting_arrangement: 'Extramural',
  primary_funding_source: 'World Bank',
  budget_main: '50000',           // form stores numbers as strings
};

describe('SpecificActivityFormPage canSave gate (H-5)', () => {
  it('allows saving a fully-completed form', () => {
    const { canSave, missingRequired } = gate(COMPLETE);
    expect(missingRequired).toEqual([]);
    expect(canSave).toBe(true);
  });

  it('blocks saving when title or parent is missing even if the five fields are set', () => {
    expect(gate({ ...COMPLETE, title: '   ' }).canSave).toBe(false);
    expect(gate({ ...COMPLETE, parent_id: '' }).canSave).toBe(false);
  });

  it('still allows saving when grant_name is empty (H-5: no longer required)', () => {
    const { canSave, missingRequired } = gate({ ...COMPLETE, grant_name: '' });
    expect(missingRequired).not.toContain('grant_name');
    expect(canSave).toBe(true);
  });

  it('blocks saving and reports the empty funding source', () => {
    const { canSave, missingRequired } = gate({ ...COMPLETE, primary_funding_source: '' });
    expect(canSave).toBe(false);
    expect(missingRequired).toEqual(['primary_funding_source']);
  });

  it('treats an empty cost as missing and accepts 0 for an activity with no cost', () => {
    expect(gate({ ...COMPLETE, budget_main: '0' }).missingRequired).not.toContain('budget_main');
    expect(gate({ ...COMPLETE, budget_main: '' }).missingRequired).toContain('budget_main');
    expect(gate({ ...COMPLETE, budget_main: '1' }).missingRequired).not.toContain('budget_main');
  });

  it('accepts "No" (implementation_at_rcc = "0") as a provided answer', () => {
    const { canSave } = gate({ ...COMPLETE, implementation_at_rcc: '0' });
    expect(canSave).toBe(true);
  });

  it('lists all five fields as missing on a blank form', () => {
    const blank = { title: 'x', parent_id: 1 };
    expect(gate(blank).missingRequired.sort()).toEqual([...REQUIRED_SPECIFIC_ACTIVITY_FIELDS].sort());
  });
});
