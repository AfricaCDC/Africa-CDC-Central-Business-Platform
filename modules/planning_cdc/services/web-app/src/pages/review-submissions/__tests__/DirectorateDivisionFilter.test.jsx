import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LEVEL_TYPES } from '@rbm/lib/enums';
import DirectorateDivisionFilter from '../DirectorateDivisionFilter';

const divisions = [
  { code: 'DPS', division_name: 'Prog Support', parent_code: null, level_type: LEVEL_TYPES.DIRECTORATE },
  { code: 'DCM', division_name: 'Case Mgmt', parent_code: 'DPS', level_type: LEVEL_TYPES.DIVISION },
  { code: 'DSI', division_name: 'Surveillance', parent_code: 'DPS', level_type: LEVEL_TYPES.DIVISION },
];

describe('DirectorateDivisionFilter', () => {
  it('renders directorate and division comboboxes', () => {
    render(
      <DirectorateDivisionFilter
        divisions={divisions} directorate="ALL" division="ALL"
        onDirectorateChange={vi.fn()} onDivisionChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/All directorates/i)).toBeInTheDocument();
    expect(screen.getByText(/All divisions/i)).toBeInTheDocument();
  });
});
