import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useApprovalInboxFilters } from '../hooks/useApprovalInboxFilters';

vi.mock('react-router-dom', async () => await vi.importActual('react-router-dom'));

function wrapper({ children, initialEntries = ['/approvals/inbox'] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/approvals/inbox" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

const renderWithRouter = (initialEntries) =>
  renderHook(() => useApprovalInboxFilters(), {
    wrapper: ({ children }) => wrapper({ children, initialEntries }),
  });

describe('useApprovalInboxFilters', () => {
  it('returns defaults when no URL params are present', () => {
    const { result } = renderWithRouter(['/approvals/inbox']);
    expect(result.current.filters).toEqual({
      step: 'all',
      entityType: 'all',
      divisionCode: 'all',
      page: 1,
      pageSize: 15,
    });
    expect(result.current.activeFilterCount).toBe(0);
    expect(result.current.queryPayload).toEqual({ page: 1, pageSize: 15 });
  });

  it('reads filters from the URL', () => {
    const { result } = renderWithRouter([
      '/approvals/inbox?step=2&entityType=ACTIVITY_REPORT&divisionCode=DPHI&page=3',
    ]);
    expect(result.current.filters).toMatchObject({
      step: '2',
      entityType: 'ACTIVITY_REPORT',
      divisionCode: 'DPHI',
      page: 3,
    });
    expect(result.current.activeFilterCount).toBe(3);
    expect(result.current.queryPayload).toEqual({
      step: '2',
      entityType: 'ACTIVITY_REPORT',
      divisionCode: 'DPHI',
      page: 3,
      pageSize: 15,
    });
  });

  it('setFilter resets page to 1 on non-pagination keys', () => {
    const { result } = renderWithRouter(['/approvals/inbox?page=4']);
    act(() => result.current.setFilter('step', '2'));
    expect(result.current.filters.page).toBe(1);
    expect(result.current.filters.step).toBe('2');
  });

  it('setFilter keeps page when paging', () => {
    const { result } = renderWithRouter(['/approvals/inbox?step=2']);
    act(() => result.current.setFilter('page', 3));
    expect(result.current.filters.page).toBe(3);
    expect(result.current.filters.step).toBe('2');
  });

  it('setFilter with default value removes the key from URL', () => {
    const { result } = renderWithRouter(['/approvals/inbox?step=2']);
    act(() => result.current.setFilter('step', 'all'));
    expect(result.current.filters.step).toBe('all');
    expect(result.current.activeFilterCount).toBe(0);
  });

  it('clearAllFilters resets everything', () => {
    const { result } = renderWithRouter([
      '/approvals/inbox?step=2&entityType=ACTIVITY_REPORT&page=3',
    ]);
    act(() => result.current.clearAllFilters());
    expect(result.current.filters.step).toBe('all');
    expect(result.current.filters.entityType).toBe('all');
    expect(result.current.filters.page).toBe(1);
    expect(result.current.activeFilterCount).toBe(0);
  });

  it('queryPayload omits default values', () => {
    const { result } = renderWithRouter(['/approvals/inbox?step=2']);
    expect(result.current.queryPayload).toEqual({
      step: '2',
      page: 1,
      pageSize: 15,
    });
    expect(result.current.queryPayload.entityType).toBeUndefined();
    expect(result.current.queryPayload.divisionCode).toBeUndefined();
  });

  it('invalid page values fall back to default 1', () => {
    const { result } = renderWithRouter(['/approvals/inbox?page=-5']);
    expect(result.current.filters.page).toBe(1);
  });
});
