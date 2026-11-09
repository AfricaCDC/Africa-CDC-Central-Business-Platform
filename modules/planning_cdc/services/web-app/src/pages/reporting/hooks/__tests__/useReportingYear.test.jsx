import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

// Real routing: the global setup stubs useLocation and useNavigate.
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
// Like the real context: the URL's ?fy= wins, else the stored year (2025 here).
vi.mock('@/contexts/PlanningYearContext', async () => {
  const { useSearchParams } = await vi.importActual('react-router-dom');
  return { usePlanningYear: () => ({ planningYear: useSearchParams()[0].get('fy') || '2025', years: ['2027', '2026', '2025'], isLoading: false }) };
});

import { useReportingYear } from '../useReportingYear';

const OPEN_Q4_2026 = [{ quarter: 'Q4', fiscal_year: 2026, status: 'OPEN', end_date: '2027-01-30' }];

const run = (url, periods, isLoading = false) => renderHook(() => ({ year: useReportingYear(periods, isLoading), loc: useLocation() }), {
  wrapper: ({ children }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>,
});

describe('useReportingYear', () => {
  it('should use the year of the open period and pin it into the URL', () => {
    const { result } = run('/division-reports?q=Q4', OPEN_Q4_2026);
    expect(result.current.year).toEqual({ fiscalYear: '2026', isResolvingYear: false });
    expect(result.current.loc.search).toBe('?q=Q4&fy=2026');
  });

  it('should follow the year of the URL (the year selector)', () => {
    const { result } = run('/division-reports?fy=2025', OPEN_Q4_2026);
    expect(result.current.year.fiscalYear).toBe('2025');
    expect(result.current.loc.search).toBe('?fy=2025');
  });

  it('should keep the selected year when the open period belongs to a year without a plan', () => {
    const { result } = run('/division-reports', [{ quarter: 'Q4', fiscal_year: 2024, status: 'OPEN', end_date: '2025-01-30' }]);
    expect(result.current.year.fiscalYear).toBe('2025');
    expect(result.current.loc.search).toBe('?fy=2025');
  });

  it('should wait for the periods before writing the URL', () => {
    const { result } = run('/division-reports', [], true);
    expect(result.current.year.isResolvingYear).toBe(true);
    expect(result.current.loc.search).toBe('');
  });
});
