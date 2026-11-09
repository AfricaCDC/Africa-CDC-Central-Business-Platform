import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useWorkplanFilters } from '../useWorkplanFilters';

// The global setup stubs useSearchParams to a no-op pair. For this suite
// we want the real implementation so we can assert URL-driven behaviour.
vi.mock('react-router-dom', async () => await vi.importActual('react-router-dom'));

function wrapper({ children, initialEntries = ['/workplans'] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/workplans" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

const renderWithRouter = (initialEntries) =>
  renderHook(() => useWorkplanFilters(), {
    wrapper: ({ children }) => wrapper({ children, initialEntries }),
  });

describe('useWorkplanFilters', () => {
  it('returns defaults when no URL params are present', () => {
    const { result } = renderWithRouter(['/workplans']);
    expect(result.current.filters).toEqual({
      q: '',
      status: 'all',
      quarter: 'all',
      divisionId: 'all',
      directorateId: 'all',
      page: 1,
      pageSize: 15,
    });
    expect(result.current.activeFilterCount).toBe(0);
    expect(result.current.queryPayload).toEqual({ page: 1, pageSize: 15 });
  });

  it('reads filters from the URL and parses page / pageSize as integers', () => {
    const { result } = renderWithRouter(['/workplans?q=vaccine&status=IN_PROGRESS&page=3&pageSize=25']);
    expect(result.current.filters).toMatchObject({
      q: 'vaccine',
      status: 'IN_PROGRESS',
      page: 3,
      pageSize: 25,
    });
    expect(result.current.activeFilterCount).toBe(2);
    expect(result.current.queryPayload).toMatchObject({ q: 'vaccine', status: 'IN_PROGRESS', page: 3, pageSize: 25 });
  });

  it('falls back to defaults when numeric params are malformed', () => {
    const { result } = renderWithRouter(['/workplans?page=abc&pageSize=-1']);
    expect(result.current.filters.page).toBe(1);
    expect(result.current.filters.pageSize).toBe(15);
  });

  it('setFilter updates the key and resets page to 1', () => {
    const { result } = renderWithRouter(['/workplans?page=4']);
    expect(result.current.filters.page).toBe(4);
    act(() => result.current.setFilter('q', 'polio'));
    expect(result.current.filters.q).toBe('polio');
    expect(result.current.filters.page).toBe(1);
  });

  it('setFilter to a default value removes the param from the URL', () => {
    const { result } = renderWithRouter(['/workplans?status=IN_PROGRESS']);
    expect(result.current.filters.status).toBe('IN_PROGRESS');
    act(() => result.current.setFilter('status', 'all'));
    expect(result.current.filters.status).toBe('all');
    expect(result.current.activeFilterCount).toBe(0);
  });

  it('setFilter on page does NOT reset page', () => {
    const { result } = renderWithRouter(['/workplans?q=test']);
    act(() => result.current.setFilter('page', 5));
    expect(result.current.filters.page).toBe(5);
    expect(result.current.filters.q).toBe('test');
  });

  it('clearAllFilters strips every param', () => {
    const { result } = renderWithRouter(['/workplans?q=ebola&status=IN_PROGRESS&page=2']);
    expect(result.current.activeFilterCount).toBe(2);
    act(() => result.current.clearAllFilters());
    expect(result.current.filters).toEqual({
      q: '',
      status: 'all',
      quarter: 'all',
      divisionId: 'all',
      directorateId: 'all',
      page: 1,
      pageSize: 15,
    });
    expect(result.current.activeFilterCount).toBe(0);
  });

  it('queryPayload omits keys that match defaults', () => {
    const { result } = renderWithRouter(['/workplans?q=ebola']);
    expect(result.current.queryPayload).toEqual({ q: 'ebola', page: 1, pageSize: 15 });
    expect(result.current.queryPayload.status).toBeUndefined();
  });

  // Regression: picking a directorate also resets the division. Doing this with
  // two synchronous setFilter calls used to clobber the first (React Router does
  // not chain functional setSearchParams updaters). setFilters must be atomic.
  it('setFilters applies multiple keys in a single update', () => {
    const { result } = renderWithRouter(['/workplans']);
    act(() => result.current.setFilters({ directorateId: 'PHC', divisionId: 'all' }));
    expect(result.current.filters.directorateId).toBe('PHC');
    expect(result.current.filters.divisionId).toBe('all');
    expect(result.current.activeFilterCount).toBe(1); // only directorateId is non-default
  });

  it('setFilters resets a previously-set division when switching directorate', () => {
    const { result } = renderWithRouter(['/workplans?directorateId=SCI&divisionId=CHSISD']);
    expect(result.current.filters.divisionId).toBe('CHSISD');
    act(() => result.current.setFilters({ directorateId: 'PHC', divisionId: 'all' }));
    expect(result.current.filters.directorateId).toBe('PHC');
    expect(result.current.filters.divisionId).toBe('all');
  });

  it('setFilters resets page to 1 on a non-pagination change', () => {
    const { result } = renderWithRouter(['/workplans?page=4']);
    act(() => result.current.setFilters({ directorateId: 'PHC', divisionId: 'all' }));
    expect(result.current.filters.page).toBe(1);
  });
});
