import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

// Real routing: the global setup stubs useLocation and useNavigate.
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import { useAdoptionFilters } from '../hooks/useAdoptionFilters';

const run = (url) => renderHook(() => ({ f: useAdoptionFilters(), loc: useLocation() }), {
  wrapper: ({ children }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>,
});

describe('useAdoptionFilters', () => {
  it('should read the URL and build the API payload, the unit as `unit`', () => {
    const { result } = run('/admin/adoption?filter=NO_TOUR&bu=SDI&q=jane&page=3');
    expect(result.current.f.filters).toEqual({ filter: 'NO_TOUR', q: 'jane', bu: 'SDI', page: 3 });
    expect(result.current.f.queryPayload).toEqual({ filter: 'NO_TOUR', q: 'jane', unit: 'SDI', page: 3 });
    expect(result.current.f.activeFilterCount).toBe(3);
  });

  it('should send the name search after a typing pause, not on every key', () => {
    vi.useFakeTimers();
    try {
      const { result } = run('/admin/adoption');
      act(() => result.current.f.setFilter('q', 'ja'));
      act(() => vi.advanceTimersByTime(100));
      act(() => result.current.f.setFilter('q', 'jan'));
      act(() => vi.advanceTimersByTime(200));
      expect(result.current.f.filters.q).toBe('jan');
      expect(result.current.f.queryPayload).toEqual({});
      act(() => vi.advanceTimersByTime(100));
      expect(result.current.f.queryPayload).toEqual({ q: 'jan' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('should leave the first page and empty filters out of the payload', () => {
    const { result } = run('/admin/adoption?page=abc');
    expect(result.current.f.filters.page).toBe(1);
    expect(result.current.f.queryPayload).toEqual({});
  });

  it('should go back to page 1 when a filter changes', () => {
    const { result } = run('/admin/adoption?page=4');
    act(() => result.current.f.setFilter('filter', 'NEVER_SIGNED_IN'));
    expect(result.current.loc.search).toBe('?filter=NEVER_SIGNED_IN');
  });

  it('should keep the filters when the page changes, and clear them all', () => {
    const { result } = run('/admin/adoption?filter=NO_TOUR');
    act(() => result.current.f.setFilter('page', 2));
    expect(result.current.loc.search).toBe('?filter=NO_TOUR&page=2');
    act(() => result.current.f.clearAllFilters());
    expect(result.current.loc.search).toBe('');
  });
});
