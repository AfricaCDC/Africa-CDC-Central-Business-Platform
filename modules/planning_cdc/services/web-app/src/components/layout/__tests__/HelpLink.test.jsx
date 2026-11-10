import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Real routing: the global setup stubs useLocation and useNavigate.
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, roles: ['FOCAL_PERSON'] } }) }));

import HelpLink from '../HelpLink';

const renderAt = (path, props) => render(<MemoryRouter initialEntries={[path]}><HelpLink {...props} /></MemoryRouter>);

describe('HelpLink', () => {
  it('should open the chapter of the page in a new tab, as a tour anchor', () => {
    renderAt('/activity-report');
    const link = screen.getByRole('link', { name: 'Help' });
    expect(link.getAttribute('href')).toMatch(/^\/guides\/RBM-Focal-Person-Guide\.html\?v=[\d.]+#ch-7$/);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('title')).toBe('Focal Person Guide, chapter 7');
    expect(link.getAttribute('data-tour')).toBe('help');
  });

  it('should read « Help on this page » in the phone menu and close the menu', () => {
    const onNavigate = vi.fn();
    renderAt('/dashboard', { variant: 'menu', onNavigate });
    const link = screen.getByRole('link', { name: 'Help on this page' });
    expect(link.getAttribute('data-tour')).toBeNull();
    link.click();
    expect(onNavigate).toHaveBeenCalled();
  });

  it('should render nothing on a page no chapter covers', () => {
    const { container } = renderAt('/user-guides');
    expect(container.innerHTML).toBe('');
  });
});
