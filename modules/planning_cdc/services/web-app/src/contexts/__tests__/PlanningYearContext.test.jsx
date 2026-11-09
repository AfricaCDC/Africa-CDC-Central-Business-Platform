// ── PlanningYearContext tests ──
//
// Two properties carry the whole design and are pinned here:
//   1. `planningYear` is what the user chose and may be in the future.
//   2. `reportableYear` is the year that has started, and never follows the
//      selection — the server refuses a report on anything later.
//
// Plus the one that silently breaks dashboards: `fyNum` must track the SELECTED
// year (2026 -> 4, 2027 -> 5), because that index picks the target column.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { PlanningYearProvider, usePlanningYear, resolveYear } from '../PlanningYearContext';

// src/__tests__/setup.js stubs useSearchParams to an empty, frozen instance and
// tells tests that need real routing to re-mock locally. The whole point of
// this context is that ?fy= selects the year, so we need a stateful one.
// The hook goes through the API service, not axios directly (CHARTER §8).
const listFiscalYears = vi.fn();
vi.mock('@/services/planNodes.api', () => ({
  planNodesApi: { listFiscalYears: (...a) => listFiscalYears(...a) },
}));

// The provider wraps the login page too, so it must stay dormant without a
// session. Default to an authenticated user; the regression test below flips it.
let authUser = { id: 1, email: 'someone@africacdc.org' };
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: authUser, login: vi.fn(), logout: vi.fn(), loading: false }),
}));

let searchState = new URLSearchParams();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({}),
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'test' }),
    useSearchParams: () => {
      const [, force] = React.useReducer((n) => n + 1, 0);
      return [searchState, (next) => { searchState = new URLSearchParams(next); force(); }];
    },
  };
});

const THIS_YEAR = String(new Date().getFullYear());
const NEXT_YEAR = String(new Date().getFullYear() + 1);

function Probe() {
  const { planningYear, reportableYear, isFuturePlan, fyNum, years, setPlanningYear } = usePlanningYear();
  return (
    <div>
      <span data-testid="year">{planningYear}</span>
      <span data-testid="reportable">{reportableYear}</span>
      <span data-testid="future">{String(isFuturePlan)}</span>
      <span data-testid="fynum">{fyNum}</span>
      <span data-testid="count">{years.length}</span>
      <button onClick={() => setPlanningYear(NEXT_YEAR)}>switch</button>
    </div>
  );
}

function renderWith({ years = [NEXT_YEAR, THIS_YEAR], fy = null } = {}) {
  searchState = new URLSearchParams(fy ? { fy } : {});
  // services/api.js unwraps {success,data} in its response interceptor, so a
  // caller receives the array directly. Mocking the envelope here is what let
  // an empty year list reach production unnoticed.
  listFiscalYears.mockResolvedValue({ data: years.map((y) => ({ fiscal_year: y, node_count: 10 })) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlanningYearProvider><Probe /></PlanningYearProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  searchState = new URLSearchParams();
  authUser = { id: 1, email: 'someone@africacdc.org' };
});

describe('resolveYear', () => {
  it('should prefer the year in the URL', () => {
    expect(resolveYear('2027', '2026', ['2027', '2026'])).toBe('2027');
  });

  it('should fall back to the stored choice', () => {
    expect(resolveYear(null, '2027', ['2027', '2026'])).toBe('2027');
  });

  it('should ignore a stored year that no longer holds a plan', () => {
    expect(resolveYear(null, '2019', [THIS_YEAR, '2025'])).toBe(THIS_YEAR);
  });

  it('should ignore a malformed URL value', () => {
    expect(resolveYear('FY2027', null, [THIS_YEAR])).toBe(THIS_YEAR);
  });

  it('should default to the calendar year rather than the newest plan', () => {
    // Opening the app must not drop a user into a year that has not started.
    expect(resolveYear(null, null, [NEXT_YEAR, THIS_YEAR])).toBe(THIS_YEAR);
  });

  it('should fall back to the newest year when the calendar year holds no plan', () => {
    expect(resolveYear(null, null, ['2025', '2024'])).toBe('2025');
  });
});

describe('PlanningYearProvider', () => {
  it('should default to the current calendar year', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
    expect(screen.getByTestId('year')).toHaveTextContent(THIS_YEAR);
    expect(screen.getByTestId('future')).toHaveTextContent('false');
  });

  it('should honour ?fy= in the URL', async () => {
    renderWith({ fy: NEXT_YEAR });
    await waitFor(() => expect(screen.getByTestId('year')).toHaveTextContent(NEXT_YEAR));
  });

  it('should keep reportableYear on the year that has started when a future year is selected', async () => {
    renderWith({ fy: NEXT_YEAR });
    await waitFor(() => expect(screen.getByTestId('year')).toHaveTextContent(NEXT_YEAR));
    expect(screen.getByTestId('reportable')).toHaveTextContent(THIS_YEAR);
    expect(screen.getByTestId('future')).toHaveTextContent('true');
  });

  it('should move fyNum with the selected year, not with the clock', async () => {
    // The index picks the target column: 2026 -> target_y4, 2027 -> target_y5.
    const { unmount } = renderWith();
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
    const onThisYear = Number(screen.getByTestId('fynum').textContent);
    unmount();

    renderWith({ fy: NEXT_YEAR });
    await waitFor(() => expect(screen.getByTestId('year')).toHaveTextContent(NEXT_YEAR));
    expect(Number(screen.getByTestId('fynum').textContent)).toBe(onThisYear + 1);
  });

  it('should persist the selection', async () => {
    renderWith();
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
    await userEvent.click(screen.getByText('switch'));
    await waitFor(() => expect(screen.getByTestId('year')).toHaveTextContent(NEXT_YEAR));
    expect(localStorage.getItem('rbm.planningYear')).toBe(NEXT_YEAR);
  });

  it('should still render when the year list cannot be fetched', async () => {
    listFiscalYears.mockRejectedValue(new Error('offline'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PlanningYearProvider><Probe /></PlanningYearProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('year')).toHaveTextContent(THIS_YEAR));
  });

  it('should survive a browser that refuses localStorage', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    renderWith();
    await waitFor(() => expect(screen.getByTestId('year')).toHaveTextContent(THIS_YEAR));
    spy.mockRestore();
  });
});

describe('response shapes', () => {
  it('should read the unwrapped array the interceptor produces', async () => {
    listFiscalYears.mockResolvedValue({ data: [{ fiscal_year: NEXT_YEAR, node_count: 1 }, { fiscal_year: THIS_YEAR, node_count: 2 }] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PlanningYearProvider><Probe /></PlanningYearProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
  });

  it('should still cope with a raw envelope from a cached response', async () => {
    listFiscalYears.mockResolvedValue({ data: { success: true, data: [{ fiscal_year: THIS_YEAR, node_count: 2 }] } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PlanningYearProvider><Probe /></PlanningYearProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
  });
});

describe('authentication gate', () => {
  // A 401 on this query is not harmless: the response interceptor tries to
  // refresh the token, finds none on the login page, and calls forceLogout(),
  // which redirects to /login and fires the query again. That loop put 15 453
  // failing requests through production in 72 hours, at up to 300 per minute.
  it('should not call the API while the user is unauthenticated', async () => {
    authUser = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PlanningYearProvider><Probe /></PlanningYearProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('year')).toHaveTextContent(THIS_YEAR));
    expect(listFiscalYears).not.toHaveBeenCalled();
  });

  it('should still render the calendar year for an anonymous visitor', async () => {
    authUser = null;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PlanningYearProvider><Probe /></PlanningYearProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'));
  });

  it('should call the API once a session exists', async () => {
    renderWith();
    await waitFor(() => expect(listFiscalYears).toHaveBeenCalledTimes(1));
  });
});
