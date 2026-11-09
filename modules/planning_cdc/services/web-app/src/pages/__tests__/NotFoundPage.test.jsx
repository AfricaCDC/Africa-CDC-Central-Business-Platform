// ── NotFoundPage tests ──
//
// The catch-all 404 (CLAUDE.md §10: never a blank screen on an unmatched URL)
// must render standalone — no auth/permission hooks — and link back to "/".

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFoundPage from '../NotFoundPage';

describe('<NotFoundPage />', () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );

  it('renders the 404 code and a not-found message', () => {
    renderPage();
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });

  it('offers a link back to the home route', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /back to home/i });
    expect(link).toHaveAttribute('href', '/');
  });
});
