// ── Auth Routes ──
//
// All auth-touching endpoints in one place. The refresh limiter is applied
// here AND the gateway limits /api/auth (nginx `auth:10m rate=60r/m`) for
// defense in depth. Sign-in is Microsoft only (D-20261107-03).
//
// Endpoints:
//   POST /api/auth/refresh            — exchange refresh token for a fresh access token
//   POST /api/auth/logout             — record logout in the audit log
//   GET  /api/auth/microsoft/login    — start Microsoft sign-in (the only way in, D-20261107-03)
//   GET  /api/auth/microsoft/callback — finish it and issue access+refresh tokens
//   POST /api/auth/cbp/accept         — CBP Staff Portal SSO handoff (D-20261110-01)
//   GET  /api/auth/me                 — fresh user data for the current token
//   GET  /api/auth/profile            — raw JWT payload (back-compat)

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validate');
const { refreshLimiter, ssoAcceptLimiter } = require('../middleware/rateLimit');
const { refreshSchema } = require('@rbm/schemas');

// Refresh has its own, more lenient limiter so legitimate token rotation
// doesn't trigger the tighter login limit.
router.post('/refresh', refreshLimiter, validate(refreshSchema), authController.refresh);

// Logout requires a valid bearer (otherwise we have nothing to log).
router.post('/logout', authenticateToken, authController.logout);

// Microsoft Entra ID (Outlook) SSO — server-side Authorization Code
// flow. /microsoft/login stashes state in a signed cookie and
// redirects to Microsoft; /microsoft/callback consumes the cookie
// and issues our access+refresh tokens. Both routes are public.
router.get('/microsoft/login', authController.microsoftLogin);
router.get('/microsoft/callback', authController.microsoftCallback);

// CBP Staff Portal SSO: the portal auto-POSTs a form with a signed token.
// Only this route parses urlencoded bodies; 404 unless CBP_SSO_JWT_SECRET is set.
router.post('/cbp/accept', express.urlencoded({ extended: false, limit: '16kb' }), ssoAcceptLimiter, authController.cbpAccept);

router.get('/me', authenticateToken, authController.getMe);
router.get('/me/permissions', authenticateToken, authController.getMyPermissions);
router.get('/profile', authenticateToken, authController.getProfile);

module.exports = router;
