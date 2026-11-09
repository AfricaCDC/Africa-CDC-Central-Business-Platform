import { describe, it, expect } from 'vitest';
import { STATUSES, ACTIVITY_RISK_LEVELS, ACTIVITY_TYPES, BUDGETING_ARRANGEMENTS } from '@rbm/lib/enums';
import { filterSpecifics, sortSpecifics, distinctOptions } from '../specificsList';

const row = (id, over = {}) => ({
  id, status: STATUSES.APPROVED, title: `Activity ${id}`, code: `1.1.1.0${id}`, updated_at: '2026-11-01T00:00:00Z', ...over,
});

describe('filterSpecifics', () => {
  const rows = [
    row(1, { activity_type: ACTIVITY_TYPES.EVENT, primary_funding_source: 'World Bank', budgeting_arrangement: BUDGETING_ARRANGEMENTS.EXTRAMURAL, risk_level: ACTIVITY_RISK_LEVELS.HIGH }),
    row(2, { status: STATUSES.DRAFT, activity_type: ACTIVITY_TYPES.TRAINING, primary_funding_source: 'Member States' }),
    row(3, { activity_type: ACTIVITY_TYPES.EVENT, indicator_code: 'SDI.2.1-3' }),
  ];

  it('should keep every row when no filter is set, and treat the ALL status as none', () => {
    expect(filterSpecifics(rows, {}).length).toBe(3);
    expect(filterSpecifics(rows, { status: 'ALL' }).length).toBe(3);
  });

  it('should combine the status, type, funding, arrangement and risk filters', () => {
    expect(filterSpecifics(rows, { status: STATUSES.DRAFT }).map((r) => r.id)).toEqual([2]);
    expect(filterSpecifics(rows, { type: ACTIVITY_TYPES.EVENT }).map((r) => r.id)).toEqual([1, 3]);
    expect(filterSpecifics(rows, { type: ACTIVITY_TYPES.EVENT, risk: ACTIVITY_RISK_LEVELS.HIGH }).map((r) => r.id)).toEqual([1]);
    expect(filterSpecifics(rows, { funding: 'Member States' }).map((r) => r.id)).toEqual([2]);
    expect(filterSpecifics(rows, { arrangement: BUDGETING_ARRANGEMENTS.INTRAMURAL })).toEqual([]);
  });

  it('should search the title, the code and the indicator code, ignoring case', () => {
    expect(filterSpecifics(rows, { q: 'sdi.2' }).map((r) => r.id)).toEqual([3]);
    expect(filterSpecifics(rows, { q: '1.1.1.02' }).map((r) => r.id)).toEqual([2]);
    expect(filterSpecifics(rows, { q: '  ' }).length).toBe(3);
  });
});

describe('sortSpecifics', () => {
  it('should put rejected and drafts first, then the riskiest, then the latest change', () => {
    const sorted = sortSpecifics([
      row(1, { risk_level: ACTIVITY_RISK_LEVELS.LOW }),
      row(2, { status: STATUSES.CANCELLED }),
      row(3, { risk_level: ACTIVITY_RISK_LEVELS.HIGH }),
      row(4, { status: STATUSES.DRAFT }),
      row(5, { status: STATUSES.REJECTED }),
      row(6, { updated_at: '2026-11-04T00:00:00Z' }),
      row(7, { risk_level: ACTIVITY_RISK_LEVELS.MEDIUM }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual([5, 4, 3, 7, 1, 6, 2]);
  });

  it('should not change the input array', () => {
    const input = [row(1), row(2, { status: STATUSES.REJECTED })];
    sortSpecifics(input);
    expect(input.map((r) => r.id)).toEqual([1, 2]);
  });
});

describe('distinctOptions', () => {
  it('should list each non-empty value once, sorted', () => {
    const opts = distinctOptions([{ f: 'b' }, { f: 'a' }, { f: 'b' }, { f: null }, { f: '' }], 'f');
    expect(opts).toEqual([{ value: 'a', label: 'a' }, { value: 'b', label: 'b' }]);
  });
});
