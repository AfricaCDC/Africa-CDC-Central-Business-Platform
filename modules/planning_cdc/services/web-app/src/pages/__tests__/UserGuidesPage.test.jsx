import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/layout/DashboardLayout', () => ({ default: ({ children }) => <div>{children}</div> }));

import UserGuidesPage from '../UserGuidesPage';
import { USER_GUIDES, USER_GUIDES_VERSION } from '@/config/userGuides';

describe('UserGuidesPage', () => {
  it('should offer each role guide to open and to download, with the version as cache buster', () => {
    render(<UserGuidesPage />);
    expect(screen.getByText('Focal Person Guide')).toBeTruthy();
    expect(screen.getByText('Responsible Person of the Business Unit Guide')).toBeTruthy();
    expect(screen.getByText('M&E Guide')).toBeTruthy();
    const downloads = screen.getAllByText('Download').map((el) => el.closest('a'));
    expect(downloads).toHaveLength(USER_GUIDES.length);
    expect(downloads[0].getAttribute('href')).toBe(`/guides/RBM-Focal-Person-Guide.pdf?v=${USER_GUIDES_VERSION}`);
    expect(downloads[0].getAttribute('download')).toBe('RBM-Focal-Person-Guide.pdf');
    expect(screen.getAllByText('Open')[0].closest('a').getAttribute('target')).toBe('_blank');
  });
});
