// ── divisionHierarchy unit tests ──
//
// Pure helpers for the division / directorate filters. Level-type values come
// from LEVEL_TYPES (no string literals) so the fixtures stay charter-clean.

import { describe, it, expect } from 'vitest';
import { LEVEL_TYPES } from '@rbm/lib/enums';
import {
  indexByCode,
  directorateOf,
  directorateOptions,
  divisionOptions,
  matchesDivisionFilter,
} from '@/utils/divisionHierarchy';

const DIRECTORATE = LEVEL_TYPES.DIRECTORATE;
const DIVISION = LEVEL_TYPES.DIVISION;
const UNIT = LEVEL_TYPES.UNIT;

const divisions = [
  { code: 'PH', division_name: 'Public Health', level_type: DIRECTORATE, parent_code: null },
  { code: 'SURV', division_name: 'Surveillance', level_type: DIVISION, parent_code: 'PH' },
  { code: 'LAB', division_name: 'Lab', level_type: UNIT, parent_code: 'SURV' },
  { code: 'WD', division_name: 'Workforce', level_type: DIRECTORATE, parent_code: null },
  { code: 'ORPHAN', division_name: 'Orphan', level_type: DIVISION, parent_code: null },
];
const byCode = indexByCode(divisions);

describe('directorateOf', () => {
  it('resolves a division to its directorate by walking parent_code', () => {
    expect(directorateOf('SURV', byCode)).toBe('PH');
  });
  it('walks multiple levels (unit → division → directorate)', () => {
    expect(directorateOf('LAB', byCode)).toBe('PH');
  });
  it('returns the code itself when it is a directorate', () => {
    expect(directorateOf('PH', byCode)).toBe('PH');
  });
  it('returns null when no directorate ancestor exists', () => {
    expect(directorateOf('ORPHAN', byCode)).toBeNull();
  });
  it('is cycle-safe', () => {
    const cyclic = indexByCode([
      { code: 'A', level_type: DIVISION, parent_code: 'B' },
      { code: 'B', level_type: DIVISION, parent_code: 'A' },
    ]);
    expect(directorateOf('A', cyclic)).toBeNull();
  });
});

describe('directorateOptions', () => {
  it('returns only directorate rows as {value,label}', () => {
    const opts = directorateOptions(divisions);
    expect(opts.map((o) => o.value).sort()).toEqual(['PH', 'WD']);
    expect(opts.find((o) => o.value === 'PH').label).toBe('Public Health');
  });
});

describe('divisionOptions', () => {
  it('excludes directorate rows', () => {
    const codes = divisionOptions(divisions).map((o) => o.value);
    expect(codes).not.toContain('PH');
    expect(codes).not.toContain('WD');
    expect(codes.sort()).toEqual(['LAB', 'ORPHAN', 'SURV']);
  });
  it('narrows to one directorate when given', () => {
    const codes = divisionOptions(divisions, 'PH').map((o) => o.value).sort();
    expect(codes).toEqual(['LAB', 'SURV']);
  });
  it('treats "all" as no narrowing', () => {
    expect(divisionOptions(divisions, 'all')).toHaveLength(3);
  });
});

describe('matchesDivisionFilter', () => {
  const node = (code) => ({ responsible_division_code: code });
  it('passes everything when filters are "all"', () => {
    expect(matchesDivisionFilter(node('SURV'), { divisionId: 'all', directorate: 'all' }, byCode)).toBe(true);
  });
  it('matches an exact division', () => {
    expect(matchesDivisionFilter(node('SURV'), { divisionId: 'SURV' }, byCode)).toBe(true);
    expect(matchesDivisionFilter(node('SURV'), { divisionId: 'LAB' }, byCode)).toBe(false);
  });
  it('matches by directorate via the parent walk', () => {
    expect(matchesDivisionFilter(node('LAB'), { directorate: 'PH' }, byCode)).toBe(true);
    expect(matchesDivisionFilter(node('ORPHAN'), { directorate: 'PH' }, byCode)).toBe(false);
  });
});
