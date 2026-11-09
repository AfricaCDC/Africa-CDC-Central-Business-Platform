import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ divisions: [], loaded: true }));

vi.mock('@/components/layout/DashboardLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, email: 'lennyt@africacdc.org', full_name: 'Lenny Tandou', division_code: null } }) }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ roles: [] }) }));
vi.mock('@/contexts/ActiveDivisionContext', () => ({ useActiveDivision: () => state }));

import ProfilePage from '../ProfilePage';

const unit = (code, name, extra) => ({ code, division_name: name, parent_code: 'DSI', reasons: ['attached'], junction_roles: ['MEMBER'], is_primary: false, ...extra });

beforeEach(() => {
  state.loaded = true;
  state.divisions = [
    unit('DIGITAL', 'Digital Health'),
    unit('MIS', 'Management Information Systems', { is_primary: true, junction_roles: ['MEMBER', 'FOCAL_PERSON'] }),
    { code: 'DSI', division_name: 'Science Directorate', reasons: ['directorate_child'], junction_roles: [], is_primary: false },
  ];
});

describe('ProfilePage business units', () => {
  it('should list the units the user belongs to, primary first, without units reached through a directorate', () => {
    render(<ProfilePage />);
    expect(screen.getByText('Management Information Systems, Digital Health')).toBeTruthy();
    expect(screen.getByText('My Business Units (2)')).toBeTruthy();
    expect(screen.getByText('PRIMARY')).toBeTruthy();
    expect(screen.getByText('FOCAL PERSON')).toBeTruthy();
    expect(screen.getAllByText('MEMBER')).toHaveLength(2);
    expect(screen.queryByText('Science Directorate')).toBeNull();
  });

  it('should say None when the user has no unit', () => {
    state.divisions = [];
    render(<ProfilePage />);
    expect(screen.getByText('None')).toBeTruthy();
    expect(screen.queryByText(/My Business Units/)).toBeNull();
  });
});
