// ── LoginPage tests ──
//
// Sign-in is Microsoft only (D-20261107-03). Behaviour under test:
//   1. The Microsoft button links to the server-side SSO start URL
//   2. A `return_to` from the URL is carried to the SSO start URL
//   3. There is no email or password field
//   4. A known `?error=` code shows its message; free text from the URL is never shown
//   5. Sign-in page UX (D-20261108-01): logo, redirecting state, signed-in
//      redirect, session-expired notice, guides, Request access

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

let currentSearchParams = new URLSearchParams();
let currentUser = null;

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useSearchParams: () => [currentSearchParams, vi.fn()] };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: currentUser }) }));

import LoginPage from '../LoginPage';

beforeEach(() => {
  currentSearchParams = new URLSearchParams();
  currentUser = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('<LoginPage /> — Microsoft only', () => {
  it('should link the Microsoft button to the server-side SSO start URL', () => {
    render(<LoginPage />);
    const ssoLink = screen.getByRole('link', { name: /Sign in with Microsoft/i });
    expect(ssoLink.getAttribute('href')).toBe('/api/auth/microsoft/login');
  });

  it('should carry return_to to the SSO start URL', () => {
    currentSearchParams = new URLSearchParams('return_to=/review-submissions?q=Q4');
    render(<LoginPage />);
    const href = screen.getByRole('link', { name: /Sign in with Microsoft/i }).getAttribute('href');
    expect(href).toBe(`/api/auth/microsoft/login?return_to=${encodeURIComponent('/review-submissions?q=Q4')}`);
  });

  it('should not offer any password field or forgot-password link', () => {
    render(<LoginPage />);
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/forgot password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^sign in$/i })).not.toBeInTheDocument();
  });
});

describe('<LoginPage /> — sign-in errors', () => {
  it('should show the message of a known SSO error code', () => {
    currentSearchParams = new URLSearchParams('error=sso_inactive');
    render(<LoginPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Your account is disabled. Contact your administrator.');
  });

  it('should never render free text passed in the URL', () => {
    currentSearchParams = new URLSearchParams('error=sso_failed&message=Call+0800+to+recover+your+account');
    render(<LoginPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Microsoft sign-in failed. Please try again.');
    expect(screen.queryByText(/Call 0800/)).not.toBeInTheDocument();
  });

  it('should fall back to a generic message for an unknown code', () => {
    currentSearchParams = new URLSearchParams('error=whatever');
    render(<LoginPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in failed. Please try again.');
  });

  it('should show no error banner without an error code', () => {
    render(<LoginPage />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('<LoginPage /> — sign-in page UX', () => {
  it('should show the Africa CDC logo', () => {
    render(<LoginPage />);
    expect(screen.getByRole('img', { name: 'Africa CDC' })).toHaveAttribute('src', '/africa-cdc-logo-trimmed.png');
  });

  it('should show a redirecting state and block a second click once the button is clicked', () => {
    render(<LoginPage />);
    const ssoLink = screen.getByRole('link', { name: /Sign in with Microsoft/i });
    ssoLink.addEventListener('click', (e) => e.preventDefault()); // jsdom cannot navigate
    fireEvent.click(ssoLink);
    const busy = screen.getByRole('link', { name: /Redirecting to Microsoft/i });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
  });

  it('should send a signed-in user on to the page in return_to', () => {
    currentUser = { id: 1 };
    currentSearchParams = new URLSearchParams('return_to=/decide/3');
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/decide/3" element={<p>Decision page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Decision page')).toBeInTheDocument();
  });

  it('should keep a signed-in user on the page when it shows a sign-in error', () => {
    currentUser = { id: 1 };
    currentSearchParams = new URLSearchParams('error=sso_profile');
    render(<LoginPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('loading your profile failed');
  });

  it('should say the session expired, as information and not as an error', () => {
    currentSearchParams = new URLSearchParams('reason=session_expired&return_to=/plan');
    render(<LoginPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Your session expired.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should ignore an unknown reason code', () => {
    currentSearchParams = new URLSearchParams('reason=Call+0800');
    render(<LoginPage />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('should link the three user guides', () => {
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: /Focal Person Guide/ })).toHaveAttribute('href', expect.stringMatching(/^\/guides\/RBM-Focal-Person-Guide\.pdf/));
    expect(screen.getByRole('link', { name: /M&E Guide/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Responsible Person/ })).toBeInTheDocument();
  });

  it('should offer Request access on an unknown account when a support address is set', () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', 'rbm@example.org');
    currentSearchParams = new URLSearchParams('error=sso_unknown_user');
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: 'Request access' }).getAttribute('href')).toMatch(/^mailto:rbm@example\.org\?subject=/);
    expect(screen.getByRole('link', { name: 'Contact the RBM team' })).toHaveAttribute('href', 'mailto:rbm@example.org');
  });

  it('should hide the contact links when no support address is set', () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', '');
    currentSearchParams = new URLSearchParams('error=sso_unknown_user');
    render(<LoginPage />);
    expect(screen.queryByRole('link', { name: 'Request access' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Contact the RBM team' })).not.toBeInTheDocument();
  });
});
