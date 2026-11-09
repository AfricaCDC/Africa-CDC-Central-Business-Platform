import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { SEARCH_GROUPS } from '@rbm/lib/enums';

const state = vi.hoisted(() => ({ result: {} }));

// Real routing: the global setup stubs useLocation and useNavigate.
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/components/layout/DashboardLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('@/hooks/useSearchQueries', () => ({
  useSearchSections: (text, options) => { state.text = text; state.options = options; return state.result; },
}));

import SearchResults from '../SearchResults';

const SECTIONS = [
  { group: SEARCH_GROUPS.SPECIFIC, label: 'Specific activities', rows: [{ key: 'SPECIFIC-41', group: SEARCH_GROUPS.SPECIFIC, code: 'SDI.2.1.3', label: 'Train lab staff', sub: 'SDI · Approved', path: '/plan/node/41' }] },
  { group: SEARCH_GROUPS.UNIT, label: 'Business Units', rows: [{ key: 'SDI', group: SEARCH_GROUPS.UNIT, code: 'SDI', label: 'Surveillance', sub: 'Level 2', path: '/reference/org/SDI' }] },
];

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
}

const renderAt = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/search" element={<><SearchResults /><Where /></>} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  state.result = { sections: SECTIONS, hasTerm: true, isSearching: false, isError: false, planningYear: '2026', refetch: vi.fn() };
});

describe('SearchResults', () => {
  it('should list every group for ?q=, 50 per group, in the plan year', () => {
    renderAt('/search?q=sdi');
    expect(state.text).toBe('sdi');
    expect(state.options).toEqual({ limit: 50 });
    expect(screen.getByText('Plan 2026 · 2 results')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'All (2)' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Train lab staff')).toBeTruthy();
    expect(screen.getByText('Surveillance')).toBeTruthy();
  });

  it('should keep the type tab in the URL', () => {
    renderAt('/search?q=sdi');
    fireEvent.click(screen.getByRole('tab', { name: 'Business Units (1)' }));
    expect(screen.getByTestId('where').textContent).toBe(`/search?q=sdi&type=${SEARCH_GROUPS.UNIT}`);
    expect(screen.queryByText('Train lab staff')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'All (2)' }));
    expect(screen.getByTestId('where').textContent).toBe('/search?q=sdi');
  });

  it('should open a result from its row', () => {
    renderAt('/search?q=sdi');
    fireEvent.click(screen.getByText('Train lab staff'));
    expect(screen.getByTestId('where').textContent).toBe('/plan/node/41');
  });

  it('should ask for 2 characters', () => {
    state.result = { ...state.result, sections: [], hasTerm: false };
    renderAt('/search?q=s');
    expect(screen.getByText('Type at least 2 characters in the search box.')).toBeTruthy();
  });

  it('should say when nothing matches', () => {
    state.result = { ...state.result, sections: [] };
    renderAt('/search?q=zzz');
    expect(screen.getByText('Nothing matches "zzz" in the 2026 plan. Try a code, or another year in the year selector.')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('should offer a retry when the search fails', () => {
    state.result = { ...state.result, sections: [], isError: true };
    renderAt('/search?q=sdi');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.result.refetch).toHaveBeenCalled();
  });

  it('should note when a group is cut at 50', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ ...SECTIONS[0].rows[0], key: `SPECIFIC-${i}` }));
    state.result = { ...state.result, sections: [{ ...SECTIONS[0], rows }] };
    renderAt('/search?q=lab');
    expect(screen.getByText('First 50 shown. Type a longer text or a code to narrow the list.')).toBeTruthy();
  });
});
