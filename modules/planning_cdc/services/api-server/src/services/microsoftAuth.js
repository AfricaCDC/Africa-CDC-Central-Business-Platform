/**
 * Microsoft Entra ID (Outlook SSO) — backed by @azure/msal-node.
 *
 * Uses MSAL's `ConfidentialClientApplication` for the server-side
 * Authorization Code flow. MSAL handles all the Entra-specific
 * quirks (tenant URL formats, v1/v2 endpoint differences, token
 * caching) natively, which is why we prefer it over a generic
 * OIDC client.
 *
 * The exported API is kept intentionally narrow so the controller
 * (authController.microsoftLogin / microsoftCallback) can stay
 * provider-agnostic:
 *
 *   ssoEntryOptions(query) -> { returnTo, loginHint } (deep links)
 *   buildAuthRedirect({ loginHint }) -> { url, state, nonce }
 *   handleCallback(req, expectedState, expectedNonce) -> profile
 *
 * Config (env):
 *
 *   MS_TENANT_ID      Entra tenant GUID, or 'common' / 'organizations'
 *                     / 'consumers' for multi-tenant scenarios
 *   MS_CLIENT_ID      Application (client) ID from the Entra App
 *                     Registration
 *   MS_CLIENT_SECRET  Client secret value (NOT the secret id)
 *   MS_REDIRECT_URI   Absolute callback URL — must match EXACTLY one
 *                     of the redirect URIs registered on the Entra
 *                     app. Defaults to
 *                     `${APP_BASE_URL}/api/auth/microsoft/callback`
 *
 * If any required variable is missing, `buildAuthRedirect()` throws
 * a 503 error with a helpful message so the frontend button surfaces
 * a "SSO not configured" toast instead of a generic 500.
 */

const crypto = require('crypto');
const { ConfidentialClientApplication, LogLevel } = require('@azure/msal-node');
const { createLogger } = require('@rbm/lib/logger');

const logger = createLogger('api-server').child({ module: 'microsoftAuth' });

const SCOPES = ['openid', 'profile', 'email', 'User.Read'];
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cachedClient = null;

// eslint-disable-next-line complexity -- fans out over 4 required env vars + 4 missing-var branches (one per var); splitting would just relocate the branch count. (D-20260416-04)
function getConfigOrThrow() {
  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  const appBaseUrl = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  const redirectUri = process.env.MS_REDIRECT_URI
    || (appBaseUrl ? `${appBaseUrl}/api/auth/microsoft/callback` : '');

  if (!tenantId || !clientId || !clientSecret || !redirectUri) {
    const missing = [
      !tenantId && 'MS_TENANT_ID',
      !clientId && 'MS_CLIENT_ID',
      !clientSecret && 'MS_CLIENT_SECRET',
      !redirectUri && 'MS_REDIRECT_URI (or APP_BASE_URL)',
    ].filter(Boolean).join(', ');
    const e = new Error(`Microsoft SSO is not configured: missing ${missing}`);
    e.status = 503;
    throw e;
  }

  return { tenantId, clientId, clientSecret, redirectUri };
}

/**
 * Lazily create the MSAL ConfidentialClientApplication. Cached at
 * module scope so every request after the first skips the config
 * validation + construction cost.
 */
function getClient() {
  if (cachedClient) return cachedClient;

  const { tenantId, clientId, clientSecret } = getConfigOrThrow();

  cachedClient = new ConfidentialClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    },
    system: {
      loggerOptions: {
        // Silent by default — flip to Info/Verbose locally if you
        // need to debug an Entra handshake.
        loggerCallback(level, message) {
          if (level === LogLevel.Error) {
            logger.error({ source: 'msal' }, message);
          }
        },
        piiLoggingEnabled: false,
        logLevel: LogLevel.Error,
      },
    },
  });

  return cachedClient;
}

// Deep link from another Africa CDC system (CBP, D-20261015-08): only an
// internal SPA path, never a URL another site could be reached through.
const SAFE_RETURN_PATH = /^\/(?![/\\])[A-Za-z0-9\-._~!$&'()*+,;=:@/?%]*$/;
const EMAIL_HINT = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}$/;

/**
 * Reduce a requested post-sign-in path to a safe internal SPA path, or null.
 * Shared by the Microsoft entry URL and the CBP accept form.
 *
 * @param {unknown} value
 * @returns {string|null}
 * @example safeReturnPath('/decide/3'); // '/decide/3'
 * @example safeReturnPath('//evil.com'); // null
 */
function safeReturnPath(value) {
  const path = typeof value === 'string' ? value : '';
  return path.length <= 512 && SAFE_RETURN_PATH.test(path) && !path.startsWith('/auth/') ? path : null;
}

/**
 * Read the optional deep-link parameters of the SSO entry URL: the SPA path
 * to open after sign-in and the account to sign in with. Anything unsafe is
 * dropped, never rejected, so a bad link still signs the user in.
 *
 * @param {{ return_to?: string, login_hint?: string }} query
 * @returns {{ returnTo: string|null, loginHint: string|null }}
 * @example ssoEntryOptions({ return_to: '/dashboard', login_hint: 'a@africacdc.org' });
 */
function ssoEntryOptions(query = {}) {
  const hint = typeof query.login_hint === 'string' ? query.login_hint.trim() : '';
  return { returnTo: safeReturnPath(query.return_to), loginHint: EMAIL_HINT.test(hint) ? hint.toLowerCase() : null };
}

/**
 * Build the Microsoft authorization URL the browser should follow.
 * Also returns the freshly generated state + nonce so the caller
 * can stash them in a signed cookie for the callback step.
 *
 * With a `loginHint` (deep link from another system) the account picker
 * is skipped: Entra signs the user in silently when that account already
 * has a Microsoft session. Without it the picker stays, for shared machines.
 *
 * @param {{ loginHint?: string|null }} [opts]
 * @returns {Promise<{ url: string, state: string, nonce: string }>}
 * @throws {Error} 503 when SSO is not configured
 */
async function buildAuthRedirect({ loginHint = null } = {}) {
  const client = getClient();
  const { redirectUri } = getConfigOrThrow();

  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');

  const url = await client.getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri,
    state,
    nonce,
    ...(loginHint
      ? { loginHint }
      // Force the account picker so users on shared machines don't
      // silently reuse somebody else's cached session.
      : { prompt: 'select_account' }),
  });

  return { url, state, nonce };
}

/**
 * Exchange the authorization code for tokens and return the
 * decoded claims in a provider-agnostic shape.
 *
 * Validates:
 *   - The `state` query parameter matches the one we stashed in
 *     the signed cookie (CSRF protection).
 *   - MSAL internally validates `nonce`, signature, audience,
 *     issuer and expiry during acquireTokenByCode.
 *
 * Throws if any check fails; the caller wraps the error into a
 * friendly redirect-with-error.
 */
// eslint-disable-next-line complexity -- Entra SSO callback validation pipeline: MS error check + code check + state/CSRF check + token exchange + nonce cross-check + multi-field email/name coalesce. Each branch is a distinct security gate; extracting helpers would fragment the contract. (D-20260416-04)
async function handleCallback(req, expectedState, expectedNonce) {
  const client = getClient();
  const { redirectUri } = getConfigOrThrow();

  // Pull the code + state out of the query. MSAL's callback does
  // not read req.query itself — it takes them as explicit params.
  const { code, state, error, error_description: errorDescription } = req.query || {};
  if (error) {
    const e = new Error(`Microsoft returned error: ${error} — ${errorDescription || 'no detail'}`);
    e.status = 400;
    throw e;
  }
  if (!code) {
    const e = new Error('Missing authorization code');
    e.status = 400;
    throw e;
  }
  if (!expectedState || state !== expectedState) {
    const e = new Error('Invalid state — possible CSRF or expired session');
    e.status = 400;
    throw e;
  }

  // msal-node 7 compares the id_token nonce with request.nonce and refuses
  // the exchange when it is missing, so the nonce we sent must go here.
  const result = await client.acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri,
    nonce: expectedNonce,
  });

  const claims = result.idTokenClaims || {};

  // The id_token must carry the nonce we sent (replay protection). MSAL
  // checks it too; this guard keeps the rule if the library changes.
  if (!expectedNonce || claims.nonce !== expectedNonce) {
    const e = new Error('Nonce mismatch on id_token');
    e.status = 400;
    throw e;
  }

  // Single-tenant app: the id_token must come from the Africa CDC tenant
  // (guests included), even if the authority setting changes (D-20261108-02).
  const { tenantId } = getConfigOrThrow();
  if (GUID.test(tenantId) && claims.tid !== tenantId) {
    const e = new Error('id_token issued by another tenant');
    e.status = 400;
    throw e;
  }

  // Some tenants return the email under `preferred_username` or
  // `upn` rather than `email`. Coalesce in order of trust.
  const email = (claims.email || claims.preferred_username || claims.upn || '').toLowerCase();
  const fullName = claims.name
    || [claims.given_name, claims.family_name].filter(Boolean).join(' ')
    || email;

  return {
    oid: claims.oid || null,
    email,
    fullName,
    tenantId: claims.tid || null,
    rawClaims: claims,
  };
}

module.exports = {
  getClient,
  ssoEntryOptions,
  safeReturnPath,
  buildAuthRedirect,
  handleCallback,
};
