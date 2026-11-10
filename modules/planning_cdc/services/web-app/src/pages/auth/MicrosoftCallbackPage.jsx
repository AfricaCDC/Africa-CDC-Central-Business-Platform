/**
 * MicrosoftCallbackPage — tiny landing page the backend redirects to
 * after a successful Microsoft SSO round-trip.
 *
 * The backend puts the access + refresh tokens in the URL FRAGMENT
 * (not the query string) so they never hit server access logs. This
 * component reads the fragment, stores the tokens, fetches /auth/me
 * to hydrate the AuthContext, and navigates the user to their
 * landing page. Microsoft is the only way to sign in (D-20261107-03).
 *
 * Failure handling: if the fragment is missing / malformed / the
 * user-fetch fails, we bounce back to /login with a generic error.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { authService } from '../../services/api';
import AuthShell from './AuthShell';
import { isSafePath } from '../../utils/returnTo';
import { withBase } from '../../utils/basePath';

export default function MicrosoftCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const fragment = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : '';
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    // Deep link from another system (D-20261015-08): open the page it asked
    // for. Internal paths only: the backend checked it, and the fragment can
    // be crafted, so the same rule runs here (isSafePath, D-20261108-02).
    const returnTo = params.get('return_to');
    const target = isSafePath(returnTo) ? returnTo : '/';

    if (!accessToken) {
      setError('Microsoft sign-in did not return a valid session. Please try again.');
      setTimeout(() => navigate('/login?error=sso_missing_token', { replace: true }), 1500);
      return;
    }

    // Clear the fragment ASAP so the tokens don't linger in history.
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      /* history API unavailable — non-fatal */
    }

    // Persist the session + load the profile via the services layer, then full
    // reload so AuthProvider re-reads storage and SmartRedirect at "/" picks the
    // landing page from the dynamic RBAC matrix.
    authService.completeSsoSession({ accessToken, refreshToken })
      .then(() => window.location.replace(withBase(target)))
      .catch(() => {
        setError('Microsoft sign-in completed but loading your profile failed.');
        setTimeout(() => navigate('/login?error=sso_profile', { replace: true }), 1500);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthShell>
      <div className="mb-8">
        <h2 className="text-[24px] font-bold tracking-tight text-[#1A5632]">
          {error ? 'Sign-in did not complete' : 'Signing you in…'}
        </h2>
        <p className="text-gray-600 text-[14px] mt-1">
          {error ? 'Taking you back to the sign-in page…' : 'Finishing Microsoft sign-in and loading your profile.'}
        </p>
      </div>
      {error ? (
        <div role="alert" className="px-3.5 py-2.5 text-[13px] font-medium bg-[#9F2241]/10 text-[#9F2241]">
          {error}
        </div>
      ) : (
        <div className="flex items-center gap-3 text-[13px] text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin text-[#348F41]" />
          One moment…
        </div>
      )}
    </AuthShell>
  );
}
