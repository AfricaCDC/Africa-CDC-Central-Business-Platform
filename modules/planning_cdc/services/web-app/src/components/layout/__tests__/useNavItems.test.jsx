// ── Nav filtered by RBAC: report lists follow the Review Submissions route gate ──

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ROLES } from '@rbm/lib/roles';

const perms = { approve: false };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, roles: [ROLES.FOCAL_PERSON] } }) }));
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    isAdmin: false,
    canAccessModule: () => true,
    can: (module, action) => module === 'quarterly_report' && action === 'approve' && perms.approve,
  }),
}));
vi.mock('@/pages/country-workplan/hooks/useCountryWorkplanQueries', () => ({ useViewableCountries: () => ({ data: [] }) }));

import useNavItems from '../useNavItems';

const labelsOf = (nav) => nav.flatMap((g) => g.items.flatMap((i) => [i.label, ...(i.children || []).map((c) => c.label)]));

beforeEach(() => { perms.approve = false; });

describe('useNavItems', () => {
  it('should hide Review Submissions and the report lists from a user who cannot approve', () => {
    const labels = labelsOf(renderHook(() => useNavItems()).result.current);
    expect(labels).toEqual(expect.arrayContaining(['Write Activity Reports', 'Write Indicator Report', 'Specific Activities']));
    expect(labels).not.toContain('Review Submissions');
    expect(labels).not.toContain('Approve Activity Reports');
    expect(labels).not.toContain('Approve Indicator Reports');
  });

  it('should show them to a reviewer', () => {
    perms.approve = true;
    const labels = labelsOf(renderHook(() => useNavItems()).result.current);
    expect(labels).toEqual(expect.arrayContaining(['Review Submissions', 'Approve Activity Reports', 'Approve Indicator Reports']));
  });

  it('should list User guides once, for every user (D-20261105-16)', () => {
    const nav = renderHook(() => useNavItems()).result.current;
    expect(labelsOf(nav).filter((l) => l === 'User guides')).toHaveLength(1);
    expect(nav.at(-1).items.map((i) => i.path)).toEqual(['/user-guides']);
  });
});
