import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const state = vi.hoisted(() => ({ result: {} }));

// Real routing: the global setup stubs useLocation and useNavigate.
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/hooks/useDebouncedValue', () => ({ useDebouncedValue: (value) => value }));
vi.mock('@/hooks/useSearchQueries', () => ({
  useSearchSections: (text, options) => { state.text = text; state.options = options; return state.result; },
}));

import GlobalSearch, { nextIndex } from '../GlobalSearch';

const SECTIONS = [
  { group: 'PAGES', label: 'Pages', rows: [{ key: 'page-/pirs', group: 'PAGES', label: 'PIRS', path: '/pirs' }] },
  { group: 'SPECIFIC', label: 'Specific activities', rows: [{ key: 'SPECIFIC-41', group: 'SPECIFIC', code: 'SDI.2.1.3', label: 'Train lab staff', sub: 'SDI · Approved', path: '/plan/node/41' }] },
];

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
}

const renderBar = () => render(
  <MemoryRouter initialEntries={['/dashboard']}>
    <Routes><Route path="*" element={<><GlobalSearch /><Where /></>} /></Routes>
  </MemoryRouter>,
);
const type = (text) => {
  const input = screen.getByRole('combobox', { name: 'Search' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  return input;
};

beforeEach(() => {
  state.result = { sections: SECTIONS, hasTerm: true, isSearching: false, isError: false, planningYear: '2026', refetch: vi.fn() };
});

describe('GlobalSearch', () => {
  it('should search pages and data, 6 per group, as a tour anchor', () => {
    const { container } = renderBar();
    type(' sdi ');
    expect(state.text).toBe('sdi');
    expect(state.options).toEqual({ limit: 6, withPages: true });
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByText('Train lab staff')).toBeTruthy();
    expect(screen.getByText('See all results for "sdi"')).toBeTruthy();
    expect(container.querySelector('[data-tour="search"]')).toBeTruthy();
  });

  it('should open the highlighted result with the arrows and Enter', () => {
    renderBar();
    const input = type('sdi');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('global-search-option-1');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('where').textContent).toBe('/plan/node/41');
    expect(input.value).toBe('');
  });

  it('should open all results on Enter with nothing highlighted', () => {
    renderBar();
    const input = type('lab staff');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('where').textContent).toBe('/search?q=lab%20staff');
  });

  it('should open a result on click', () => {
    renderBar();
    type('pirs');
    fireEvent.mouseDown(screen.getByText('PIRS'));
    expect(screen.getByTestId('where').textContent).toBe('/pirs');
  });

  it('should close on Escape', () => {
    renderBar();
    const input = type('sdi');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('should say when nothing matches in the plan year', () => {
    state.result = { ...state.result, sections: [] };
    renderBar();
    type('zzz');
    expect(screen.getByText('Nothing matches "zzz" in the 2026 plan.')).toBeTruthy();
  });

  it('should show a readable message when the search fails', () => {
    state.result = { ...state.result, sections: [], isError: true };
    renderBar();
    type('sdi');
    expect(screen.getByText('Search is unavailable right now. Try again in a moment.')).toBeTruthy();
  });

  it('should show a spinner while the first results load', () => {
    state.result = { ...state.result, sections: [], isSearching: true };
    renderBar();
    type('sdi');
    expect(screen.getByText('Searching...')).toBeTruthy();
  });

  it('should put the cursor in the box on Ctrl+K', () => {
    renderBar();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Search' }));
  });
});

describe('nextIndex', () => {
  it('should start at the first or last option and wrap around', () => {
    expect(nextIndex(-1, 1, 3)).toBe(0);
    expect(nextIndex(-1, -1, 3)).toBe(2);
    expect(nextIndex(2, 1, 3)).toBe(0);
    expect(nextIndex(0, -1, 3)).toBe(2);
  });
});
