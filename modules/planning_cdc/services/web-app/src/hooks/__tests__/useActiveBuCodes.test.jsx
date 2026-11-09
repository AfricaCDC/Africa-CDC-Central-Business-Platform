// ── BU codes of the Aggregates views (D-20261105-06) ──

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RBAC_MODULES, RBAC_SCOPES } from '@rbm/lib/rbac';

const ctx = vi.hoisted(() => ({ division: {}, scope: null }));
vi.mock('@/contexts/ActiveDivisionContext', () => ({ useActiveDivision: () => ctx.division }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ getScope: () => ctx.scope }) }));
vi.mock('@/services/budget.api', () => ({
  budgetApi: { getSummary: vi.fn(() => Promise.resolve({ data: {} })), getCodes: vi.fn(() => Promise.resolve({ data: [] })) },
}));

import { budgetApi } from '@/services/budget.api';
import { useActiveBuCodes } from '../useActiveBuCodes';
import { useFundingOverview } from '../useBudgetQueries';

const wrapper = ({ children }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => { vi.clearAllMocks(); });

describe('useActiveBuCodes', () => {
  it('should filter on the BU picked in the selector, even for an all-scope reader', () => {
    ctx.division = { activeCode: 'SDI', activeCodes: new Set(['SDI', 'SDIX']) };
    ctx.scope = RBAC_SCOPES.ALL;
    const { result } = renderHook(() => useActiveBuCodes(RBAC_MODULES.BUDGET));
    expect(result.current).toEqual(['SDI', 'SDIX']);
  });

  it('should show every BU to an all-scope reader on « All my divisions »', () => {
    ctx.division = { activeCode: null, activeCodes: new Set(['SDI', 'EPR']) };
    ctx.scope = RBAC_SCOPES.ALL;
    const { result } = renderHook(() => useActiveBuCodes(RBAC_MODULES.PIRS));
    expect(result.current).toBeNull();
  });

  it('should keep a division-scope reader on their own units on « All my divisions »', () => {
    ctx.division = { activeCode: null, activeCodes: new Set(['EPR', 'SDI']) };
    ctx.scope = RBAC_SCOPES.DIVISION;
    const { result } = renderHook(() => useActiveBuCodes(RBAC_MODULES.PIRS));
    expect(result.current).toEqual(['EPR', 'SDI']);
  });
});

describe('useFundingOverview', () => {
  it('should send the BU codes as the division filter', async () => {
    const { result } = renderHook(() => useFundingOverview('2027', ['SDI', 'EPR']), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(budgetApi.getCodes).toHaveBeenCalledWith({ fiscal_year: '2027', division: 'SDI,EPR' });
    expect(budgetApi.getSummary).toHaveBeenCalledWith({ fiscal_year: '2027', division: 'SDI,EPR' });
  });

  it('should not filter when the codes are null', async () => {
    const { result } = renderHook(() => useFundingOverview('2027', null), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(budgetApi.getCodes).toHaveBeenCalledWith({ fiscal_year: '2027' });
  });

  it('should show nothing, without calling the API, to a reader with no unit', async () => {
    const { result } = renderHook(() => useFundingOverview('2027', []), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(budgetApi.getCodes).not.toHaveBeenCalled();
    expect(result.current.data.codes).toEqual([]);
    expect(result.current.data.totals.line_count).toBe(0);
  });
});
