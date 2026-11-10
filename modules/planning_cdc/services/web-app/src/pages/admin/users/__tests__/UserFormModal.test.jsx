// ── UserFormModal — admin staff edit modal ──
//
// Covers: name fields populated on every open (including CBP rows that only
// carry full_name), Cancel / Escape always close, Save-only validation with an
// inline message and no API call, and a successful save payload.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockApi, mockToast } = vi.hoisted(() => ({
  mockApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/services/api', () => ({ __esModule: true, default: mockApi }));
vi.mock('sonner', () => ({ toast: mockToast }));
vi.mock('@/components/admin/DivisionAssignmentEditor', () => ({
  __esModule: true,
  default: ({ userId }) => <div data-testid="division-editor">{userId}</div>,
}));

import UserFormModal from '../UserFormModal';

const ROLES = [
  { id: 1, code: 'PLANNER', name: 'Planner' },
  { id: 2, code: 'STAFF', name: 'Staff' },
];

// Row as returned by GET /admin/users, with structured names populated.
const ADA = {
  id: 7,
  title: 'Mr',
  first_name: 'Ada',
  middle_name: '',
  last_name: 'Mensah',
  full_name: 'Mr Ada Mensah',
  email: 'ada@africacdc.org',
  status: 'ACTIVE',
  user_type: 'STAFF',
  division_code: 'DPHI',
  roles: [{ id: 1, code: 'PLANNER', name: 'Planner' }],
};

// Row created by the CBP import: full_name only, structured fields NULL.
const BEN_CBP = {
  id: 9,
  title: null,
  first_name: null,
  middle_name: null,
  last_name: null,
  full_name: 'Ben Kofi Mwangi',
  email: 'ben@africacdc.org',
  status: 'ACTIVE',
  user_type: 'STAFF',
  division_code: null,
  roles: [],
};

function renderModal(props = {}) {
  const handlers = { onClose: vi.fn(), onSaved: vi.fn() };
  const element = (overrides) => (
    <MemoryRouter>
      <UserFormModal
        open
        mode="edit"
        user={ADA}
        roles={ROLES}
        divisions={[]}
        {...handlers}
        {...props}
        {...overrides}
      />
    </MemoryRouter>
  );
  const utils = render(element());
  return { ...utils, ...handlers, rerenderWith: (overrides) => utils.rerender(element(overrides)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.put.mockResolvedValue({ data: { success: true } });
  mockApi.post.mockResolvedValue({ data: { success: true } });
  mockApi.delete.mockResolvedValue({ data: { success: true } });
});

describe('UserFormModal — name fields', () => {
  it('should show the existing first and last name when editing', () => {
    renderModal();
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Ada');
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Mensah');
  });

  it('should recover first, middle and last name from full_name for CBP rows', () => {
    renderModal({ user: BEN_CBP });
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Ben');
    expect(screen.getByLabelText(/middle name/i)).toHaveValue('Kofi');
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Mwangi');
  });

  it('should show the new user name each time the modal is reopened', () => {
    const { rerenderWith } = renderModal();
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Ada');
    rerenderWith({ open: false });
    rerenderWith({ user: BEN_CBP });
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Ben');
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Mwangi');
  });

  it('should keep what the admin typed when the same row is refetched', () => {
    const { rerenderWith } = renderModal();
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Typed' } });
    rerenderWith({ user: { ...ADA, full_name: 'Mr Ada Mensah (refetched)' } });
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Typed');
  });
});

describe('UserFormModal — closing', () => {
  it('should close on Cancel even when required fields are empty', () => {
    const { onClose } = renderModal();
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockApi.put).not.toHaveBeenCalled();
  });

  it('should close on Escape', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('UserFormModal — save validation', () => {
  it('should show a message and not call the API when first name is empty', () => {
    const { onSaved } = renderModal();
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('First name, last name and email are required.');
    expect(mockApi.put).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('should reject an invalid email without calling the API', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(mockApi.put).not.toHaveBeenCalled();
  });
});

describe('UserFormModal — save', () => {
  it('should PUT the trimmed payload, then close and refresh', async () => {
    const { onClose, onSaved } = renderModal();
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: '  Adaeze ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockApi.put).toHaveBeenCalledWith('/admin/users/7', expect.objectContaining({
      first_name: 'Adaeze',
      last_name: 'Mensah',
      email: 'ada@africacdc.org',
    }));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(mockApi.post).not.toHaveBeenCalled();
    expect(mockApi.delete).not.toHaveBeenCalled();
  });

  it('should show a readable message when the API rejects the save', async () => {
    mockApi.put.mockRejectedValue({ response: { data: { message: 'Email already in use' } } });
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email already in use');
    expect(onClose).not.toHaveBeenCalled();
  });
});
