import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ORG_LEVEL_TYPES, SEARCH_GROUPS } from '@rbm/lib/enums';

const state = vi.hoisted(() => ({ countries: [], canAudit: false, isAdmin: false }));

vi.mock('@/contexts/PlanningYearContext', () => ({ usePlanningYear: () => ({ planningYear: '2026' }) }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => state.canAudit, isAdmin: state.isAdmin }) }));
vi.mock('@/components/layout/useNavItems', () => ({ default: () => [{ items: [{ label: 'PIRS', path: '/pirs' }] }] }));
vi.mock('@/pages/country-workplan/hooks/useCountryWorkplanQueries', () => ({ useViewableCountries: () => ({ data: state.countries }) }));
vi.mock('@/services/search.api', () => ({ searchApi: { find: vi.fn() } }));

import { searchApi } from '@/services/search.api';
import { useGlobalSearch, useSearchSections } from '../useSearchQueries';
import { useDebouncedValue } from '../useDebouncedValue';

const DATA = {
  q: 'ke', fiscal_year: '2026',
  groups: [{ group: SEARCH_GROUPS.UNIT, items: [{ code: 'KEP', name: 'Knowledge', level_type: ORG_LEVEL_TYPES.UNIT }] }, { group: SEARCH_GROUPS.COUNTRY, items: [{ code: 'KEN', name: 'Kenya', region: 'Eastern' }] }],
};

const wrapper = ({ children }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { countries: [], canAudit: false, isAdmin: false });
  searchApi.find.mockResolvedValue({ data: DATA });
});

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('should follow the value after a pause only', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), { initialProps: { value: 'a' } });
    rerender({ value: 'ab' });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(50));
    expect(result.current).toBe('ab');
  });
});

describe('useGlobalSearch', () => {
  it('should not call the API under 2 characters', () => {
    renderHook(() => useGlobalSearch(' k ', 6), { wrapper });
    expect(searchApi.find).not.toHaveBeenCalled();
  });

  it('should search the trimmed text, 100 characters at most, in the selected year', async () => {
    const { result } = renderHook(() => useGlobalSearch(` ${'k'.repeat(120)} `, 6), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(searchApi.find).toHaveBeenCalledWith({ q: 'k'.repeat(100), fiscal_year: '2026', limit: 6 });
    expect(result.current.data).toEqual(DATA);
  });
});

describe('useSearchSections', () => {
  it('should keep only the results the user can open', async () => {
    state.countries = [{ code: 'KEN', name: 'Kenya' }];
    const { result } = renderHook(() => useSearchSections('ke', { limit: 6 }), { wrapper });
    await waitFor(() => expect(result.current.sections).toHaveLength(1));
    expect(result.current.sections[0].rows[0].path).toBe('/country-workplan?country=KEN');
    expect(result.current.planningYear).toBe('2026');
  });

  it('should open Business Units for a user with the reference pages', async () => {
    state.canAudit = true;
    const { result } = renderHook(() => useSearchSections('ke', { limit: 6 }), { wrapper });
    await waitFor(() => expect(result.current.sections.map((s) => s.group)).toEqual([SEARCH_GROUPS.UNIT, SEARCH_GROUPS.COUNTRY]));
  });

  it('should add menu pages when asked, without searching under 2 characters', () => {
    const { result } = renderHook(() => useSearchSections('p', { limit: 6, withPages: true }), { wrapper });
    expect(result.current.hasTerm).toBe(false);
    expect(result.current.sections.map((s) => s.label)).toEqual(['Pages']);
    expect(searchApi.find).not.toHaveBeenCalled();
  });
});
