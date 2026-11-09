// ── quarterSums tests ──
//
// Pure helpers behind the VH-2 non-blocking coherence warnings:
//   - toNum: blank/NaN → 0
//   - sumQuarters: tolerant sum of raw form values
//   - quarterlyVsAnnualWarning: message when Q1..Q4 don't add up to the annual
//     total; null when coherent, not comparable, or within epsilon.

import { describe, it, expect } from 'vitest';
import { toNum, sumQuarters, quarterlyVsAnnualWarning } from '../quarterSums';

describe('toNum', () => {
  it('should parse numeric strings', () => {
    expect(toNum('42')).toBe(42);
    expect(toNum('3.5')).toBe(3.5);
  });
  it('should pass through finite numbers', () => {
    expect(toNum(7)).toBe(7);
  });
  it('should coerce blank/null/undefined/NaN to 0', () => {
    expect(toNum('')).toBe(0);
    expect(toNum(null)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum('not-a-number')).toBe(0);
  });
});

describe('sumQuarters', () => {
  it('should sum mixed string/number values', () => {
    expect(sumQuarters(['10', 20, '30', '40'])).toBe(100);
  });
  it('should treat blanks as 0', () => {
    expect(sumQuarters(['10', '', null, '40'])).toBe(50);
  });
  it('should return 0 for an empty or missing array', () => {
    expect(sumQuarters([])).toBe(0);
    expect(sumQuarters(undefined)).toBe(0);
  });
});

describe('quarterlyVsAnnualWarning', () => {
  it('should return null when quarters add up exactly to the annual total', () => {
    expect(quarterlyVsAnnualWarning(['10', '20', '30', '40'], '100')).toBeNull();
  });

  it('should return null within the default epsilon (floating point tolerance)', () => {
    expect(quarterlyVsAnnualWarning(['33.33', '33.33', '33.34', '0'], '100')).toBeNull();
  });

  it('should warn when the quarters exceed the total', () => {
    const msg = quarterlyVsAnnualWarning(['30', '30', '30', '30'], '100');
    expect(msg).toMatch(/sum to 120/);
    expect(msg).toMatch(/exceed/);
    expect(msg).toMatch(/100/);
    expect(msg).toMatch(/by 20/);
  });

  it('should warn when the quarters fall short of the total', () => {
    const msg = quarterlyVsAnnualWarning(['10', '20', '30', '40'], '150');
    expect(msg).toMatch(/sum to 100/);
    expect(msg).toMatch(/fall short of/);
    expect(msg).toMatch(/150/);
  });

  it('should append a unit when provided', () => {
    const msg = quarterlyVsAnnualWarning(['1', '1', '1', '1'], '10', { unit: 'USD' });
    expect(msg).toMatch(/4 USD/);
    expect(msg).toMatch(/10 USD/);
  });

  it('should return null when the annual total is blank (nothing to compare)', () => {
    expect(quarterlyVsAnnualWarning(['10', '20', '30', '40'], '')).toBeNull();
    expect(quarterlyVsAnnualWarning(['10', '20', '30', '40'], null)).toBeNull();
  });

  it('should return null when all quarters are blank (form not filled yet)', () => {
    expect(quarterlyVsAnnualWarning(['', '', '', ''], '100')).toBeNull();
  });

  it('should warn when only some quarters are filled and they miss the total', () => {
    const msg = quarterlyVsAnnualWarning(['50', '', '', ''], '100');
    expect(msg).toMatch(/sum to 50/);
    expect(msg).toMatch(/fall short of/);
  });

  it('should format decimals to 2 places, integers without decimals', () => {
    const msg = quarterlyVsAnnualWarning(['10.5', '0', '0', '0'], '10');
    expect(msg).toMatch(/sum to 10\.5/);
    expect(msg).toMatch(/by 0\.5/);
  });
});
