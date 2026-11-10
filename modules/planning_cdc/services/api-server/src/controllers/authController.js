// ── Auth Controller ──
//
// Microsoft Entra ID (Outlook) sign-in and token issuance. There is no
// password login (D-20261107-03): a user signs in with their Africa CDC
// Microsoft account, matched to a pre-provisioned RBM account.
//
// Security notes:
//   - Access tokens are short-lived (default 30m, controlled by JWT_ACCESS_TTL).
//   - Refresh tokens are long-lived (default 7d, controlled by JWT_REFRESH_TTL).
//   - Refresh tokens are signed with a SEPARATE secret (JWT_REFRESH_SECRET) so
//     a stolen access token cannot be used to mint refresh tokens.
//   - Every sign-in (granted or denied) is written to the audit log with IP +
//     user agent for incident response.

const db = require('../config/db');
const jwt = require('jsonwebtoken');
const { jwt: jwtConfig, cbp: cbpConfig } = require('../config/env');
const asyncHandler = require('../middleware/asyncHandler');
const { audit } = require('../middleware/auditLog');
const microsoftAuth = require('../services/microsoftAuth');
const {
  signAccessToken,
  signRefreshToken,
  verifyToken,
} = require('@rbm/lib/auth');
const { createLogger } = require('@rbm/lib/logger');
const {
  HTTP_STATUS,
  ERROR_CODES,
  buildError,
} = require('@rbm/lib/errors');

const log = createLogger('api-server').child({ module: 'authController' });

// ── Helpers ──

/**
 * Build the JWT payload from a user row + roles array. Kept tiny on purpose
 * — large JWTs are slow on every request. Anything beyond identity should be
 * looked up server-side via /api/auth/me.
 */
function buildAccessPayload(user, roleCodes) {
  return {
    id: user.id,
    email: user.email,
    roles: roleCodes,
    bu_id: user.business_unit_id || null,
  };
}

/**
 * Refresh tokens carry only the user id + a `type: 'refresh'` claim. The
 * type claim makes it impossible to mistakenly accept a refresh token where
 * an access token is expected (since the access verifier doesn't check the
 * `type` claim, but we always check it explicitly in `refresh` below).
 */
function buildRefreshPayload(user) {
  return {
    id: user.id,
    type: 'refresh',
  };
}

async function loadUserRoles(userId) {
  const rows = await db('user_roles')
    .join('roles', 'user_roles.role_id', 'roles.id')
    .where('user_roles.user_id', userId)
    .select('roles.code', 'roles.permissions');

  const roleCodes = rows.map((r) => r.code);
  const permSet = new Set();
  for (const r of rows) {
    let perms = r.permissions;
    if (typeof perms === 'string') {
      try { perms = JSON.parse(perms); } catch { perms = []; }
    }
    if (Array.isArray(perms)) perms.forEach((p) => permSet.add(p));
  }
  return { roleCodes, permissions: [...permSet].sort() };
}

async function loadUserScope(user) {
  const [bu, div] = await Promise.all([
    user.business_unit_id ? db('business_units').where({ id: user.business_unit_id }).first() : null,
    user.division_code ? db('division_codes').where({ code: user.division_code }).first() : null,
  ]);
  return { bu, div };
}

function scopeFields(bu, div) {
  return {
    bu_code: (bu && bu.code) || null,
    bu_name: (bu && bu.name) || null,
    division_name: (div && div.division_name) || null,
    directorate: (div && div.directorate) || null,
  };
}

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 *
 * Returns: { accessToken, expiresIn }
 *
 * Verifies the refresh token against `JWT_REFRESH_SECRET`, requires the
 * `type: 'refresh'` claim, then re-mints a fresh access token. Refresh
 * tokens are single-use ONLY in spirit (we don't yet store revoked refresh
 * IDs in the DB) — see SECURITY_AUDIT.md for the roadmap to add a
 * `revoked_refresh_tokens` table.
 */
function decodeRefreshToken(refreshToken, secret) {
  try {
    const decoded = verifyToken(refreshToken, secret);
    if (!decoded || decoded.type !== 'refresh' || !decoded.id) {
      return { err: { code: ERROR_CODES.TOKEN_INVALID } };
    }
    return { decoded };
  } catch (e) {
    const code = e && e.name === 'TokenExpiredError' ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.TOKEN_INVALID;
    return { err: { code } };
  }
}

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken || typeof refreshToken !== 'string') {
    return res
      .status(HTTP_STATUS.BAD_REQUEST)
      .json(buildError(ERROR_CODES.BAD_REQUEST, 'refreshToken is required'));
  }

  const { decoded, err } = decodeRefreshToken(refreshToken, jwtConfig.refreshSecret);
  if (err) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json(buildError(err.code));
  }

  const user = await db('users').where({ id: decoded.id }).first();
  if (!user || user.status !== 'ACTIVE') {
    await audit(req, 'REFRESH_FAILED', 'user', decoded.id, { reason: 'user_inactive_or_missing' });
    return res
      .status(HTTP_STATUS.UNAUTHORIZED)
      .json(buildError(ERROR_CODES.UNAUTHORIZED));
  }

  const { roleCodes } = await loadUserRoles(user.id);
  const accessToken = signAccessToken(
    buildAccessPayload(user, roleCodes),
    jwtConfig.accessSecret,
    { expiresIn: jwtConfig.accessTtl }
  );

  await audit(req, 'TOKEN_REFRESH', 'user', user.id);

  return res.json({
    accessToken,
    token: accessToken, // back-compat
    expiresIn: jwtConfig.accessTtl,
  });
});

/**
 * POST /api/auth/logout
 *
 * In a token-based auth model logout is mostly a client-side concern (the
 * client drops the token). We still record an audit event so security ops
 * have a complete picture.
 */
const logout = asyncHandler(async (req, res) => {
  if (req.user && req.user.id) {
    await audit(req, 'LOGOUT', 'user', req.user.id);
  }
  return res.json({ success: true });
});

/**
 * GET /api/auth/profile
 * Returns the raw JWT payload attached to `req.user` by the auth middleware.
 * Kept for back-compat with older SPA builds that read `/profile` instead of `/me`.
 *
 * @param {express.Request} req — authenticated request
 * @param {express.Response} res — sends `{ user }`
 * @returns {Promise<void>}
 * @example
 * // curl -H "Authorization: Bearer $TOKEN" /api/auth/profile
 */
const getProfile = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

/**
 * GET /api/auth/me
 * Returns fresh user data including roles and division. Used by the SPA
 * after page reload to rehydrate the auth context.
 */
const getMe = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res
      .status(HTTP_STATUS.UNAUTHORIZED)
      .json(buildError(ERROR_CODES.UNAUTHORIZED, 'Not authenticated'));
  }
  const user = await db('users').where({ id: userId }).first();
  if (!user) {
    return res
      .status(HTTP_STATUS.NOT_FOUND)
      .json(buildError(ERROR_CODES.NOT_FOUND, 'User not found'));
  }

  const { roleCodes } = await loadUserRoles(user.id);
  const { bu, div } = await loadUserScope(user);

  res.json({
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      roles: roleCodes,
      business_unit_id: user.business_unit_id,
      ...scopeFields(bu, div),
      division_code: user.division_code || null,
    },
  });
});

/**
 * GET /api/auth/microsoft/login
 *
 * Entry point of the Microsoft Entra ID (Outlook SSO) flow. Generates
 * a random state + nonce, stashes them in a short-lived signed cookie
 * ("ms_oauth"), and 302-redirects the browser to Microsoft's
 * authorization endpoint. The same cookie is consumed by the callback
 * handler below to prevent CSRF and replay.
 *
 * If the backend isn't configured with MS_* env vars yet we return a
 * 503 with a friendly message so the frontend button surfaces a
 * useful error instead of a generic 500.
 *
 * Deep link from another system (CBP, D-20261015-08):
 *   /api/auth/microsoft/login?return_to=/dashboard&login_hint=user@africacdc.org
 * signs the user in without the account picker when Microsoft already has
 * their session, then opens `return_to` (internal SPA path only).
 */
const microsoftLogin = asyncHandler(async (req, res) => {
  try {
    const { returnTo, loginHint } = microsoftAuth.ssoEntryOptions(req.query);
    const { url, state, nonce } = await microsoftAuth.buildAuthRedirect({ loginHint });
    res.cookie('ms_oauth', JSON.stringify({ state, nonce, returnTo }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      signed: true,
      maxAge: 10 * 60 * 1000, // 10 min
      path: '/api/auth/microsoft',
    });
    return res.redirect(302, url);
  } catch (err) {
    const status = err.status || 500;
    if (status === 503) {
      return res.status(503).json(buildError(ERROR_CODES.SERVICE_UNAVAILABLE || 'SERVICE_UNAVAILABLE', err.message));
    }
    throw err;
  }
});

/**
 * GET /api/auth/microsoft/callback
 *
 * Return leg of the OAuth flow. Verifies the state + nonce against
 * the cookie, exchanges the authorization code for tokens, looks up
 * the local user by microsoft_oid OR email (pre-provisioned policy
 * decided 2026-04-08: an unknown email is rejected, the admin has
 * to create the user first). On success, issues our standard
 * access + refresh tokens and redirects the browser to the SPA
 * callback page with the tokens in the URL fragment so they never
 * hit any access log.
 */
function parseSsoStateCookie(raw) {
  if (!raw) return { err: 'sso_expired' };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { err: 'sso_invalid' }; }
  if (!parsed || !parsed.state || !parsed.nonce) return { err: 'sso_invalid' };
  return { parsed };
}

async function lookupSsoUser(profile) {
  let user = profile.oid
    ? await db('users').where('microsoft_oid', profile.oid).first()
    : null;
  if (user) return { user };
  user = await db('users').whereRaw('LOWER(email) = ?', [profile.email]).first();
  if (!user) return { user: null, reason: 'not_provisioned' };
  // An account already linked to another Microsoft identity is not taken
  // over by whoever presents the same email (D-20261108-02).
  if (user.microsoft_oid && user.microsoft_oid !== profile.oid) return { user: null, reason: 'oid_mismatch' };
  if (profile.oid && !user.microsoft_oid) {
    await db('users').where('id', user.id).update({ microsoft_oid: profile.oid });
  }
  return { user };
}

async function resolveSsoProfile(req, parsed) {
  try {
    return { profile: await microsoftAuth.handleCallback(req, parsed.state, parsed.nonce) };
  } catch (err) {
    log.error('auth.microsoft_callback_token_exchange_failed', { message: err.message });
    return { err: 'sso_failed' };
  }
}

/**
 * Issue our access and refresh tokens for a verified user, bump last_login_at,
 * audit the sign-in, and bounce the browser to the SPA callback with the tokens
 * in the URL fragment (#). Fragments are never sent to a server and stay out of
 * access logs and Referer headers, the closest a 302 gets to a safe handoff.
 * Shared by the Microsoft callback and the CBP accept endpoint.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ user: object, appBase: string, returnTo?: string|null, provider: string }} opts
 * @example await issueSessionAndRedirect(req, res, { user, appBase, returnTo: '/dashboard', provider: 'cbp' });
 */
async function issueSessionAndRedirect(req, res, { user, appBase, returnTo, provider }) {
  const { roleCodes } = await loadUserRoles(user.id);
  const accessToken = signAccessToken(
    buildAccessPayload(user, roleCodes),
    jwtConfig.accessSecret,
    { expiresIn: jwtConfig.accessTtl }
  );
  const refreshToken = signRefreshToken(
    buildRefreshPayload(user),
    jwtConfig.refreshSecret,
    { expiresIn: jwtConfig.refreshTtl }
  );

  await db('users').where({ id: user.id }).update({ last_login_at: db.fn.now() });
  await audit(req, 'SSO_LOGIN', 'user', user.id, { provider, email: user.email }, user.id);

  const fragment = new URLSearchParams({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: jwtConfig.accessTtl,
  });
  // Deep link (D-20261015-08): the page asked for on the entry URL.
  if (returnTo) fragment.set('return_to', returnTo);
  return res.redirect(302, `${appBase}/auth/microsoft/callback#${fragment.toString()}`);
}

const SSO_ERROR_MESSAGES = {
  sso_expired: 'The sign-in session expired. Please try again.',
  sso_invalid: 'Invalid sign-in session. Please try again.',
  sso_failed: 'Microsoft sign-in failed. Please try again.',
  sso_no_email: 'Your Microsoft account did not provide an email address.',
  sso_inactive: 'Your account is disabled. Contact your administrator.',
  sso_unknown_user: 'No RBM account matches your Central Business Platform account. Ask your administrator for access.',
  sso_cbp_invalid: 'Your Central Business Platform sign-in link is invalid or expired. Open the app from the portal again.',
};

const microsoftCallback = asyncHandler(async (req, res) => {
  const appBase = (process.env.APP_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const redirectWithError = (code, message) => {
    const params = new URLSearchParams({ error: code, message: message || SSO_ERROR_MESSAGES[code] || code });
    return res.redirect(302, `${appBase}/login?${params.toString()}`);
  };

  const raw = req.signedCookies && req.signedCookies.ms_oauth;
  res.clearCookie('ms_oauth', { path: '/api/auth/microsoft' });
  const cookie = parseSsoStateCookie(raw);
  if (cookie.err) return redirectWithError(cookie.err);

  const resolved = await resolveSsoProfile(req, cookie.parsed);
  if (resolved.err) return redirectWithError(resolved.err);
  const { profile } = resolved;

  if (!profile.email) return redirectWithError('sso_no_email');

  const { user, reason } = await lookupSsoUser(profile);
  if (!user) {
    await audit(req, 'SSO_LOGIN_DENIED', 'user', null, { email: profile.email, reason, oid: profile.oid });
    return redirectWithError('sso_unknown_user', `No RBM account exists for ${profile.email}. Ask your administrator to create one first.`);
  }
  if (user.status !== 'ACTIVE') {
    await audit(req, 'SSO_LOGIN_DENIED', 'user', user.id, { email: profile.email, reason: 'inactive' });
    return redirectWithError('sso_inactive');
  }

  return issueSessionAndRedirect(req, res, {
    user, appBase, returnTo: cookie.parsed.returnTo, provider: 'microsoft',
  });
});

/**
 * Look up the RBM user for a verified CBP identity. Matches users.cbp_id first,
 * then the lower-cased work email. A user already linked to a different CBP
 * staff id is never matched by email (same takeover rule as lookupSsoUser).
 */
async function lookupCbpUser(staffId, email) {
  let user = await db('users').where('cbp_id', staffId).first();
  if (user) return { user };
  user = email ? await db('users').whereRaw('LOWER(email) = ?', [email]).first() : null;
  if (!user) return { user: null, reason: 'not_provisioned' };
  if (user.cbp_id && String(user.cbp_id) !== staffId) return { user: null, reason: 'cbp_id_mismatch' };
  if (!user.cbp_id) await db('users').where('id', user.id).update({ cbp_id: staffId });
  return { user };
}

/** Verify the CBP token: HS256 only, signature and a numeric exp required. */
function verifyCbpToken(token) {
  try {
    const claims = jwt.verify(token, cbpConfig.ssoJwtSecret, { algorithms: ['HS256'] });
    if (typeof claims.exp !== 'number') return null;
    const staffId = claims.staff_id == null ? '' : String(claims.staff_id).trim();
    if (!/^\d{1,20}$/.test(staffId)) return null;
    const email = String(claims.work_email || claims.email || '').trim().toLowerCase();
    return { staffId, email };
  } catch {
    return null;
  }
}

/** The CBP launcher sends next without its leading slash (sanitizeModuleNext in cbpLaunch.ts). */
function cbpReturnPath(value) {
  if (typeof value !== 'string' || !value || value.includes('://')) return null;
  return microsoftAuth.safeReturnPath(value.startsWith('/') ? value : `/${value}`);
}

/**
 * POST /api/auth/cbp/accept (D-20261110-01). The CBP Staff Portal auto-POSTs
 * a form with `staff_sso_jwt` (HS256, signed with the CBP root JWT_SECRET) and
 * an optional `next` SPA path. Signs in the matching, pre-provisioned, active
 * user and redirects like the Microsoft callback. 404 when the feature is off.
 */
const cbpAccept = asyncHandler(async (req, res) => {
  if (!cbpConfig.ssoJwtSecret) {
    return res.status(HTTP_STATUS.NOT_FOUND).json(buildError(ERROR_CODES.NOT_FOUND, 'Not found'));
  }
  const appBase = (process.env.APP_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '');
  const redirectWithError = (code) => {
    const params = new URLSearchParams({ error: code, message: SSO_ERROR_MESSAGES[code] });
    return res.redirect(302, `${appBase}/login?${params.toString()}`);
  };

  const body = req.body || {};
  const identity = typeof body.staff_sso_jwt === 'string' ? verifyCbpToken(body.staff_sso_jwt) : null;
  if (!identity) return redirectWithError('sso_cbp_invalid');

  const { user, reason } = await lookupCbpUser(identity.staffId, identity.email);
  if (!user) {
    await audit(req, 'SSO_LOGIN_DENIED', 'user', null, { provider: 'cbp', staff_id: identity.staffId, email: identity.email, reason });
    return redirectWithError('sso_unknown_user');
  }
  if (user.status !== 'ACTIVE') {
    await audit(req, 'SSO_LOGIN_DENIED', 'user', user.id, { provider: 'cbp', staff_id: identity.staffId, reason: 'inactive' });
    return redirectWithError('sso_inactive');
  }
  return issueSessionAndRedirect(req, res, {
    user, appBase, returnTo: cbpReturnPath(body.next), provider: 'cbp',
  });
});

/**
 * GET /api/auth/me/permissions — structured permission map for frontend store.
 * Returns { permissions: { 'module.action': scope }, modules: [...] }
 */
const rbacService = require('../services/rbacService');
const getMyPermissions = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Not authenticated', code: 'UNAUTHORIZED' });
  }
  const data = await rbacService.getPermissionMap(userId);
  res.json({ success: true, data });
});

module.exports = {
  refresh, logout, getProfile, getMe, getMyPermissions,
  microsoftLogin, microsoftCallback, cbpAccept,
  lookupSsoUser, // exported for its unit tests (account takeover rule)
};
