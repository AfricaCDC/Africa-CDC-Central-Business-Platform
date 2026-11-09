import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ dirs: {}, digest: {}, params: new URLSearchParams(), setParams: vi.fn() }));

vi.mock('@/components/layout/DashboardLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useSearchParams: () => [state.params, state.setParams] };
});
vi.mock('../hooks/useDigestQueries', () => ({
  useDigestDirectorates: () => state.dirs,
  useDigest: (code) => ({ ...state.digest, code }),
}));

import DigestPage from '../DigestPage';

const DIGEST = {
  directorate: { code: 'DSI', name: 'Science and Innovation' }, units: ['DSI', 'LAB'], fiscal_year: '2026', quarter: 'Q3', waiting_days: 7,
  specifics: [{ status: 'APPROVED', count: 12 }],
  waiting: { count: 1, items: [{ type_label: 'Activity report', code: '1.2.3.01', title: 'EQA', unit_code: 'LAB', since: '2026-10-02', link_id: 61 }] },
  high_risk: { count: 0, items: [] },
  activity_reports: { by_status: [{ status: 'SUBMITTED', count: 4 }], not_started: 2 },
  indicator_reports: { owned: 9, by_status: [] },
  budget: { as_of: '2026-11-05', units: [{ code: 'LAB', name: 'Laboratories', execution_pct: 120, flagged: 2 }] },
};
const renderPage = () => render(<MemoryRouter><DigestPage /></MemoryRouter>);

beforeEach(() => {
  state.params = new URLSearchParams();
  state.setParams.mockReset();
  state.dirs = { data: [{ code: 'DSI', name: 'Science' }, { code: 'APPM', name: 'Programmes' }], isLoading: false, error: null };
  state.digest = { data: DIGEST, isLoading: false, error: null, refetch: vi.fn() };
});

describe('DigestPage', () => {
  it('should show every section of the first directorate', () => {
    renderPage();
    expect(screen.getByText('Monthly digest: Science and Innovation')).toBeTruthy();
    expect(screen.getByText('Waiting more than 7 days for a decision: 1')).toBeTruthy();
    expect(screen.getByText('1.2.3.01').closest('a').getAttribute('href')).toBe('/plan/node/61');
    expect(screen.getByText('High-risk activities: 0')).toBeTruthy();
    expect(screen.getByText('No high-risk activity.')).toBeTruthy();
    expect(screen.getByText('9 T3/T4 indicators owned by these units.')).toBeTruthy();
    expect(screen.getByText('2 activities')).toBeTruthy();
  });

  it('should open the directorate of the link and switch on demand', () => {
    state.params = new URLSearchParams('code=appm');
    renderPage();
    expect(screen.getByLabelText('Choose a directorate').value).toBe('APPM');
    fireEvent.change(screen.getByLabelText('Choose a directorate'), { target: { value: 'DSI' } });
    expect(state.setParams).toHaveBeenCalled();
  });

  it('should explain when the user reads no directorate', () => {
    state.dirs = { data: [], isLoading: false, error: null };
    state.digest = { data: undefined, isLoading: false, error: null, refetch: vi.fn() };
    renderPage();
    expect(screen.getByText('No digest for you')).toBeTruthy();
  });

  it('should not offer a retry on a refusal', () => {
    state.digest = { data: undefined, isLoading: false, error: { response: { status: 403 } }, refetch: vi.fn() };
    renderPage();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('should write one flagged activity in the singular', () => {
    state.digest = { ...state.digest, data: { ...DIGEST, budget: { ...DIGEST.budget, units: [{ ...DIGEST.budget.units[0], flagged: 1 }] } } };
    renderPage();
    expect(screen.getByText('1 activity')).toBeTruthy();
  });

  it('should say when no budget execution was imported', () => {
    state.digest = { ...state.digest, data: { ...DIGEST, budget: null } };
    renderPage();
    expect(screen.getByText('No budget execution imported for this year yet.')).toBeTruthy();
  });
});
