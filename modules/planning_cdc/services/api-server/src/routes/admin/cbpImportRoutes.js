/**
 * Admin: one-click CBP staff import (D-20260713-01).
 *
 * POST /api/admin/import-cbp-users
 *   body: { dryRun?: boolean, domain?: string }   (domain default africacdc.org)
 *   Scope: sync:execute (seeded by 20260713000000).
 *
 * Pulls the CBP staff directory via cbpService (basic auth) and inserts the
 * missing platform users; existing accounts only get empty cbp_id/full_name
 * backfilled. Returns the run summary for the admin UI toast.
 *
 * @name adminCbpImportRoutes
 */
'use strict';

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const { authorize } = require('../../middleware/rbacMiddleware');
const { audit } = require('../../middleware/auditLog');
const { buildSuccess, buildError } = require('@rbm/lib/errors');
const { importCbpUsers } = require('../../services/cbpImportService');
const { createLogger } = require('@rbm/lib/logger');

const log = createLogger('api-server').child({ module: 'adminCbpImportRoutes' });

router.use(authenticateToken);
const canExecuteSync = authorize({ module: 'sync', action: 'execute' });

router.post('/import-cbp-users', canExecuteSync, asyncHandler(async (req, res) => {
  const { dryRun = false, domain } = req.body || {};
  let summary;
  try {
    summary = await importCbpUsers({ dryRun: Boolean(dryRun), ...(domain ? { domain } : {}) });
  } catch (err) {
    if (err.code === 'IMPORT_IN_PROGRESS') {
      res.status(409).json(buildError('IMPORT_IN_PROGRESS', 'A CBP import is already running. Wait for it to finish, then try again.'));
      return;
    }
    // Log the upstream cause server-side (status only, never credentials); the
    // client gets a neutral message instead of an ops hint.
    log.error({ status: err.response?.status, code: err.code, error: err.message }, 'CBP import: staff fetch failed');
    res.status(502).json(buildError(
      'CBP_UNREACHABLE',
      'Could not reach the CBP staff directory. Please try again in a few minutes.',
    ));
    return;
  }
  if (!dryRun) {
    await audit(req, 'CBP_USERS_IMPORT', 'user', null, {
      inserted: summary.inserted, updated: summary.updated, skipped: summary.skipped,
    });
  }
  res.json(buildSuccess(summary));
}));

module.exports = router;
