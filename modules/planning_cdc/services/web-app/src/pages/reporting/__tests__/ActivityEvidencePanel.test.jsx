import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ query: { data: [] } }));
vi.mock('../hooks/useActivityEvidence', () => ({ useActivityEvidence: () => state.query }));

import ActivityEvidencePanel from '../ActivityEvidencePanel';

const REPORTS = [
  { id: 7, code: '1.2.3.01', title: 'EQA round', text: '3 labs assessed', link: '/activity-report/42/report/7' },
  { id: 8, code: '1.2.3.02', title: 'Workshop', text: '', link: '/activity-report/43/report/8' },
];
const renderPanel = (onAppend = vi.fn()) => render(
  <MemoryRouter>
    <ActivityEvidencePanel indicatorId="40" quarter="Q4" fiscalYear="2026" divisionCode="EPR" onAppend={onAppend} />
  </MemoryRouter>,
);

beforeEach(() => { state.query = { data: REPORTS }; });

describe('ActivityEvidencePanel', () => {
  it('should list the approved activity reports with a link to each', () => {
    renderPanel();
    expect(screen.getByText('2 approved activity reports this quarter')).toBeTruthy();
    expect(screen.getByText('1.2.3.01').closest('a').getAttribute('href')).toBe('/activity-report/42/report/7');
  });

  it('should add one line per report to the narrative', () => {
    const onAppend = vi.fn();
    renderPanel(onAppend);
    fireEvent.click(screen.getByText('Add to the narrative'));
    expect(onAppend).toHaveBeenCalledWith('1.2.3.01 EQA round: 3 labs assessed\n1.2.3.02 Workshop');
  });

  it('should render nothing without reports, while loading or on error', () => {
    state.query = { data: undefined };
    const { container } = renderPanel();
    expect(container.innerHTML).toBe('');
  });
});
