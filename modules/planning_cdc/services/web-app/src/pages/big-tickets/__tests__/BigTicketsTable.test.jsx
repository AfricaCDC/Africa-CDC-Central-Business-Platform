import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BigTicketsTable from '../list/BigTicketsTable';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));

const items = [
  { id: 5, code: 'BT05', title: 'Diagnostic capacity', pillar_id: 2, pillar_name: 'Pillar 2_PPPR', lead_division_code: 'CLDS',
    start_year: '2026', end_year: null, line_count: 1, indicator_codes: ['CLSN.5.2-1'],
    report: { status: 'APPROVED', progress_status: 'ACHIEVED', performance_pct: 114 } },
  { id: 19, code: 'BT19', title: 'Immunization strategy', pillar_id: 2, pillar_name: 'Pillar 2_PPPR', lead_division_code: 'IMZ',
    start_year: '2026', end_year: '2027', line_count: 2, indicator_codes: [],
    report: { status: 'APPROVED', progress_status: 'ACHIEVED', performance_pct: 40 } },
  { id: 1, code: 'BT01', title: 'Governance platform', pillar_id: 1, pillar_name: 'Pillar 1_Architecture', lead_division_code: 'PHD',
    start_year: '2026', end_year: null, line_count: 1, indicator_codes: ['PHD.13.1-6'], report: null },
];

const renderTable = () => render(<MemoryRouter><BigTicketsTable items={items} fiscalYear="2026" /></MemoryRouter>);

describe('BigTicketsTable', () => {
  it('should group the tickets by pillar', () => {
    renderTable();
    expect(screen.getByText('Pillar 2')).toBeInTheDocument();
    expect(screen.getByText('Pillar 1')).toBeInTheDocument();
    expect(screen.getByText('2 tickets')).toBeInTheDocument();
  });

  it('should flag an Achieved status below 100% of the target', () => {
    renderTable();
    expect(screen.getByText('Achieved at 40% of target')).toBeInTheDocument();
    expect(screen.queryByText('Achieved at 114% of target')).not.toBeInTheDocument();
  });

  it('should show years, multi-line tickets and unlinked indicators', () => {
    renderTable();
    expect(screen.getByText(/2026 – 2027 · 2 indicator lines/)).toBeInTheDocument();
    expect(screen.getByText('Big Ticket indicator')).toBeInTheDocument();
    expect(screen.getByText('Not reported')).toBeInTheDocument();
  });

  it('should open the ticket of the year when a row is clicked or Enter is pressed', () => {
    renderTable();
    fireEvent.click(screen.getByText('Diagnostic capacity'));
    expect(navigate).toHaveBeenCalledWith('/big-tickets/5?fy=2026');
    fireEvent.keyDown(screen.getByText('BT01').closest('[role="link"]'), { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('/big-tickets/1?fy=2026');
  });
});
