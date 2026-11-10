import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import DivisionActivityReportsPanel from '../DivisionActivityReportsPanel';

const renderPanel = (reports) => render(<MemoryRouter><DivisionActivityReportsPanel reports={reports} /></MemoryRouter>);

describe('DivisionActivityReportsPanel', () => {
  it('should list each report with a link to its activity and its filled fields', () => {
    renderPanel([{ id: 5, plan_node_id: 61, code: '1.2.3.01', title: 'Workshop', status: 'SUBMITTED', achievements: 'Trained 20', challenges: null }]);
    expect(screen.getByText('Activity reports (1)')).toBeTruthy();
    expect(screen.getByRole('link', { name: /1\.2\.3\.01\s*Workshop/ }).getAttribute('href')).toBe('/plan/node/61');
    expect(screen.getByText('Trained 20')).toBeTruthy();
    expect(screen.queryByText('Challenges')).toBeNull();
  });

  it('should say when the unit filed no report', () => {
    renderPanel([]);
    expect(screen.getByText('No activity report')).toBeTruthy();
  });
});
