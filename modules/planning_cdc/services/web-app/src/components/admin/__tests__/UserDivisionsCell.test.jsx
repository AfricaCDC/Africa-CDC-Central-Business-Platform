// ── UserDivisionsCell tests ──
//
// Staff list division column. Must show every division a user belongs to with
// the role labels supplied by the API (sourced from packages/lib), show a
// division once even when several roles apply, and show an empty state.

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import UserDivisionsCell from '../UserDivisionsCell';

describe('<UserDivisionsCell />', () => {
  it('should show a division the user is only responsible of, with its role label', () => {
    const divisions = [
      {
        code: 'DPHI',
        division_name: 'Public Health',
        is_primary: false,
        roles: [{ code: 'HEAD_OF_DIVISION', label: 'Head of Division' }],
      },
    ];
    render(<UserDivisionsCell divisions={divisions} />);

    expect(screen.getByText('DPHI')).toBeInTheDocument();
    expect(screen.getByText(/Head of Division/)).toBeInTheDocument();
    expect(screen.getByTitle('Public Health')).toBeInTheDocument();
  });

  it('should show a focal + member division once, listing both roles', () => {
    const divisions = [
      {
        code: 'WARCC',
        division_name: 'WARCC',
        is_primary: true,
        roles: [
          { code: 'FOCAL_PERSON', label: 'Focal Person' },
          { code: 'MEMBER', label: 'Member' },
        ],
      },
    ];
    render(<UserDivisionsCell divisions={divisions} />);

    expect(screen.getAllByText('WARCC')).toHaveLength(1);
    expect(screen.getByText(/Focal Person \/ Member/)).toBeInTheDocument();
  });

  it('should render one line per division for a multi-division user', () => {
    const divisions = [
      { code: 'AAA', division_name: 'Alpha', is_primary: true, roles: [{ code: 'MEMBER', label: 'Member' }] },
      { code: 'BBB', division_name: 'Beta', is_primary: false, roles: [{ code: 'ME_OFFICER', label: 'M&E Officer' }] },
    ];
    const { container } = render(<UserDivisionsCell divisions={divisions} />);

    const items = within(container).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent('M&E Officer');
  });

  it('should show the business unit as a muted fallback when the user has no division', () => {
    render(<UserDivisionsCell divisions={[]} businessUnit="HQ" />);

    expect(screen.getByText('HQ')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('should show a dash when the user has neither a division nor a business unit', () => {
    render(<UserDivisionsCell divisions={undefined} businessUnit={null} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
