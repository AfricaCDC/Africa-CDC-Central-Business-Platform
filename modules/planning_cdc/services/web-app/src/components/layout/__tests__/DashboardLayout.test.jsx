// ── DashboardLayout per-zone error boundary tests ──
//
// CLAUDE.md §10: a crash in ONE functional zone must not blank the others. The
// layout wraps the navigation (TopNav + MainNav) and the page content in two
// SIBLING error boundaries. We mock the nav components and usePageTracker so we
// can drive a crash in either zone and assert the other zone survives.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Silence the boundary's structured logger.
vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
// usePageTracker hits the audit API — stub it out.
vi.mock('@/hooks/usePageTracker', () => ({ default: vi.fn() }));

// Nav stubs. TopNav can be told to throw to simulate a navigation-zone crash.
let topNavThrows = false;
vi.mock('../TopNav', () => ({
  default: () => {
    if (topNavThrows) throw new Error('nav boom');
    return <nav data-testid="topnav">TOPNAV</nav>;
  },
}));
vi.mock('../MainNav', () => ({
  default: () => <nav data-testid="mainnav">MAINNAV</nav>,
}));

import DashboardLayout from '../DashboardLayout';

/** Page content that throws on demand. */
function Content({ boom }) {
  if (boom) throw new Error('content boom');
  return <div>page content</div>;
}

const renderLayout = (children) =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <DashboardLayout>{children}</DashboardLayout>
    </MemoryRouter>,
  );

describe('<DashboardLayout /> — per-zone error boundaries', () => {
  let consoleErr;
  beforeEach(() => {
    topNavThrows = false;
    consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
  });
  afterEach(() => consoleErr.mockRestore());

  it('renders nav + content when healthy', () => {
    renderLayout(<Content />);
    expect(screen.getByTestId('topnav')).toBeInTheDocument();
    expect(screen.getByTestId('mainnav')).toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('isolates a CONTENT crash — nav survives, content shows the fallback', () => {
    renderLayout(<Content boom />);
    // Navigation zone is untouched…
    expect(screen.getByTestId('topnav')).toBeInTheDocument();
    expect(screen.getByTestId('mainnav')).toBeInTheDocument();
    // …and the content area shows the recoverable boundary fallback, not a blank.
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByText('page content')).not.toBeInTheDocument();
  });

  it('isolates a NAVIGATION crash — content survives, nav shows the fallback', () => {
    topNavThrows = true;
    renderLayout(<Content />);
    // Page content is untouched…
    expect(screen.getByText('page content')).toBeInTheDocument();
    // …and the nav zone shows its own fallback with a reload affordance.
    expect(screen.getByText(/navigation bar failed to load/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });
});
