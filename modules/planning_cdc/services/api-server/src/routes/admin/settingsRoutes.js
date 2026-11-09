/**
 * Admin App Settings (D-20260707-01).
 *
 * GET /api/admin/settings?prefix=reminders.
 *   List app_settings rows (key/value/description/updated_at), optionally
 *   filtered by key prefix. Scope: settings:read.
 *
 * PUT /api/admin/settings
 *   body: { settings: { '<key>': '<value>', ... } }
 *   Bulk-update EXISTING settings. Unknown keys are rejected with 422 —
 *   new settings are introduced by migration, never by API.
 *   Scope: settings:update.
 *
 * @name adminSettingsRoutes
 */
'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const { authorize } = require('../../middleware/rbacMiddleware');
const { buildSuccess, buildError } = require('@rbm/lib/errors');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const { createLogger } = require('@rbm/lib/logger');
const settingsService = require('../../services/settingsService');

const log = createLogger('api-server').child({ module: 'adminSettings' });

router.use(authenticateToken);
const canRead = authorize({ module: RBAC_MODULES.SETTINGS, action: RBAC_ACTIONS.READ });
const canUpdate = authorize({ module: RBAC_MODULES.SETTINGS, action: RBAC_ACTIONS.UPDATE });

router.get('/settings', canRead, asyncHandler(async (req, res) => {
  const prefix = req.query.prefix ? String(req.query.prefix) : undefined;
  const rows = await settingsService.listSettings(prefix);
  res.json(buildSuccess(rows));
}));

router.put('/settings', canUpdate, asyncHandler(async (req, res) => {
  const entries = req.body && req.body.settings;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries) || !Object.keys(entries).length) {
    return res.status(400).json(buildError(
      'VALIDATION_FAILED',
      'Body must be { settings: { "<key>": "<value>", ... } } with at least one key.',
    ));
  }

  const { updated, unknown } = await settingsService.setSettings(entries, req.user.id);
  if (unknown.length) {
    return res.status(422).json(buildError(
      'VALIDATION_FAILED',
      `Unknown setting key(s): ${unknown.join(', ')}. Settings are created by migration, not by API.`,
    ));
  }

  log.info({ updated, userId: req.user.id }, 'app settings updated');
  res.json(buildSuccess({ updated }));
}));

module.exports = router;
