// ── LogframePage regression tests ──
//
// Regression guard for the crash that made /logframe unreachable: the page
// destructured a non-existent `allInds` key from useLogframeData and called
// `allInds.filter(...)` → "Cannot read properties of undefined (reading
// 'filter')". useFullPlanData actually returns { impact, t1, areas, t2, t3, t4 },
// so the per-area indicators are the union of t2/t3/t4. These tests assert the
// page renders goal + output narratives and the area's child indicator without
// throwing.
//
// DashboardLayout is stubbed; the React Query hook is mocked so no API/QueryClient
// is needed. The presentational rows (LogframeRows) render for real, hence MemoryRouter.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockLogframe } = vi.hoisted(() => ({ mockLogframe: vi.fn() }));
vi.mock('@/hooks/usePlanNodeQueries', () => ({
  useLogframeData: (...args) => mockLogframe(...args),
}));

vi.mock('@/components/layout/DashboardLayout', () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="dashboard">{children}</div>,
}));

import LogframePage from '@/pages/LogframePage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <LogframePage />
    </MemoryRouter>,
  );

beforeEach(() => {
  mockLogframe.mockReset();
});

describe('LogframePage', () => {
  it('should render goal + output rows and area indicators from the t2/t3/t4 union', () => {
    mockLogframe.mockReturnValue({
      isLoading: false,
      data: {
        impact: { id: 1, title: 'Improved health security across Africa' },
        t1: [{ id: 10, code: 'IMP.1', title: 'Impact indicator one' }],
        areas: [{ id: 100, code: 'OUT.1', title: 'Strengthened integrated health systems' }],
        t2: [],
        // The area's child indicator lives in t3 — the exact case the old
        // `allInds` (undefined) crashed on.
        t3: [{ id: 200, code: 'OUT.1.1', title: 'Proportion of AU Member States reporting', parent_id: 100 }],
        t4: [],
      },
    });

    renderPage();

    // Goal narrative (regression: was read from a non-existent `.name`).
    // It appears twice — the document title and the GOAL row — so assert ≥1.
    expect(screen.getAllByText('Improved health security across Africa').length).toBeGreaterThan(0);
    // Output row narrative
    expect(screen.getByText('Strengthened integrated health systems')).toBeInTheDocument();
    // Area's child indicator (regression: crashed on `allInds.filter`)
    expect(screen.getByText(/Proportion of AU Member States reporting/)).toBeInTheDocument();
    // Impact indicator from t1
    expect(screen.getByText(/Impact indicator one/)).toBeInTheDocument();
  });

  it('should show a loading spinner while data is loading', () => {
    mockLogframe.mockReturnValue({ isLoading: true, data: undefined });
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('should render an empty state when there is no impact or areas', () => {
    mockLogframe.mockReturnValue({
      isLoading: false,
      data: { impact: null, t1: [], areas: [], t2: [], t3: [], t4: [] },
    });
    renderPage();
    expect(screen.getByText(/Aucun résultat défini/)).toBeInTheDocument();
  });
});
