import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { safeReturnTo } from '@/utils/returnTo';
import { DEFAULT_API_URL } from '@/utils/basePath';
import { USER_GUIDES, guideUrl } from '@/config/userGuides';
import AuthShell from './auth/AuthShell';

// The Microsoft SSO flow lives 100% server-side: the backend
// endpoints /api/auth/microsoft/login and /api/auth/microsoft/callback
// handle the OAuth 2.0 Authorization Code dance via MSAL Node.
// This constant points at the start endpoint — clicking the button
// just navigates the browser there (no XHR, no popup). The backend
// does the redirect to Microsoft and eventually bounces back to
// /auth/microsoft/callback on the SPA with the tokens in the URL
// fragment. See services/api-server/src/services/microsoftAuth.js.
const MICROSOFT_LOGIN_URL = DEFAULT_API_URL + '/auth/microsoft/login';

// The callback brings the user back to `return_to` (D-20261105-10).
const ssoUrl = (params) => {
    const back = safeReturnTo(params);
    return back ? `${MICROSOFT_LOGIN_URL}?return_to=${encodeURIComponent(back)}` : MICROSOFT_LOGIN_URL;
};

// Translate the `?error=xxx` codes the backend uses when it bounces a failed
// SSO back to /login. Only known codes are shown: free text from the URL is
// never rendered, so a crafted link cannot put its own words on this page.
const SSO_ERROR_MESSAGES = {
    sso_expired:        'Your sign-in session expired. Please try again.',
    sso_invalid:        'Invalid sign-in session. Please try again.',
    sso_failed:         'Microsoft sign-in failed. Please try again.',
    sso_no_email:       'Your Microsoft account did not provide an email address.',
    sso_unknown_user:   'No RBM account matches this Microsoft account. Check that you chose your Africa CDC account, or ask for access.',
    sso_inactive:       'Your account is disabled. Contact your administrator.',
    sso_cbp_invalid:    'Your Central Business Platform sign-in link is invalid or expired. Open the app from the portal again.',
    sso_missing_token:  'Microsoft sign-in did not return a valid session.',
    sso_profile:        'Microsoft sign-in completed but loading your profile failed.',
};

// `?reason=xxx` codes the app itself sends here (api.js forceLogout): shown as
// information, not as an error. Same rule: known codes only.
const NOTICES = {
    session_expired: 'Your session expired. Sign in again to carry on where you were.',
};

const MicrosoftLogo = () => (
    <svg className="w-4 h-4" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="1"  y="1"  width="9" height="9" fill="#f25022" />
        <rect x="11" y="1"  width="9" height="9" fill="#7fba00" />
        <rect x="1"  y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
);

const linkClass = 'text-[#1A5632] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1A5632]';

/** Why the user is on this page: a failed sign-in (alert) or a notice from the app (status). */
function SignInMessage({ errCode, reason, supportEmail }) {
    if (errCode) {
        return (
            <div role="alert" className="mb-4 px-3.5 py-2.5 text-[13px] font-medium bg-[#9F2241]/10 text-[#9F2241]">
                {SSO_ERROR_MESSAGES[errCode] || 'Sign-in failed. Please try again.'}
                {errCode === 'sso_unknown_user' && supportEmail && (
                    <a
                        href={`mailto:${supportEmail}?subject=${encodeURIComponent('RBM Platform: access request')}`}
                        className="block mt-1.5 font-semibold underline underline-offset-2"
                    >
                        Request access
                    </a>
                )}
            </div>
        );
    }
    if (!NOTICES[reason]) return null;
    return (
        <div role="status" className="mb-4 px-3.5 py-2.5 text-[13px] bg-[#F5F0E0] text-gray-800">
            {NOTICES[reason]}
        </div>
    );
}

/**
 * The Microsoft button: a plain <a> link so the entire flow is server-side
 * (no MSAL.js on the frontend, no popup, no XHR). Once clicked it says it is
 * redirecting and ignores a second click.
 */
function MicrosoftButton({ href }) {
    const [isRedirecting, setIsRedirecting] = useState(false);

    // Back from Microsoft with the browser's Back button, the page comes out of
    // the back-forward cache with the spinner still on: turn it off.
    useEffect(() => {
        const handlePageShow = (e) => { if (e.persisted) setIsRedirecting(false); };
        window.addEventListener('pageshow', handlePageShow);
        return () => window.removeEventListener('pageshow', handlePageShow);
    }, []);

    return (
        <a
            href={href}
            onClick={() => setIsRedirecting(true)}
            aria-disabled={isRedirecting || undefined}
            className={`w-full h-12 flex items-center justify-center gap-3 bg-[#1A5632] text-white text-[14px] font-semibold hover:bg-[#14442A] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A5632] ${isRedirecting ? 'pointer-events-none opacity-80' : ''}`}
        >
            {isRedirecting ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    Redirecting to Microsoft…
                </>
            ) : (
                <>
                    <span className="w-6 h-6 bg-white flex items-center justify-center"><MicrosoftLogo /></span>
                    Sign in with Microsoft
                </>
            )}
        </a>
    );
}

/** The user guides (public PDFs) and, when configured, the RBM team address. */
function HelpLinks({ supportEmail }) {
    return (
        <div className="mt-10 pt-5 border-t border-gray-200 text-[12px] text-gray-600">
            <p className="font-semibold text-gray-700 mb-1.5">Need help?</p>
            <ul className="space-y-1">
                {USER_GUIDES.map((guide) => (
                    <li key={guide.key}>
                        <a href={guideUrl(guide)} target="_blank" rel="noreferrer" className={linkClass}>
                            {guide.title} (PDF)
                        </a>
                    </li>
                ))}
                {supportEmail && (
                    <li>
                        <a href={`mailto:${supportEmail}`} className={linkClass}>Contact the RBM team</a>
                    </li>
                )}
            </ul>
        </div>
    );
}

/**
 * Public sign-in page. Sign-in is with the Africa CDC Microsoft account only
 * (D-20261107-03): there is no password. A signed-in user goes straight on to
 * the app. Shows the error of a failed sign-in that the backend bounced back
 * here, or why the app signed the user out. Links to the user guides and, when
 * `VITE_SUPPORT_EMAIL` is set, to the RBM team (D-20261108-01).
 *
 * @returns {JSX.Element}
 * @example <Route path="/login" element={<LoginPage />} />
 */
export default function LoginPage() {
    const [searchParams] = useSearchParams();
    const { user } = useAuth();
    const errCode = searchParams.get('error');
    if (user && !errCode) return <Navigate to={safeReturnTo(searchParams) || '/'} replace />;

    const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL;

    return (
        <AuthShell>
            <div className="mb-8">
                <h2 className="text-[24px] font-bold tracking-tight text-[#1A5632]">Sign in</h2>
                <p className="text-gray-600 text-[14px] mt-1">
                    Use your Africa CDC Microsoft account, the same one as Outlook and Teams.
                </p>
            </div>

            <SignInMessage errCode={errCode} reason={searchParams.get('reason')} supportEmail={supportEmail} />
            <MicrosoftButton href={ssoUrl(searchParams)} />

            <p className="text-center text-[12px] text-gray-600 mt-3">
                There is no separate password for this platform.
            </p>

            <HelpLinks supportEmail={supportEmail} />
        </AuthShell>
    );
}
