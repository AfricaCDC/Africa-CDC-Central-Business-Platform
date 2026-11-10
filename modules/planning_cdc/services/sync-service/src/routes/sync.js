// ── Sync Routes ──
// POST /trigger-cbp - Manually trigger CBP staff sync (RBAC-gated)
// GET  /status      - Get sync status for CBP job
//
// AMERT routes removed per D-04 (2026-04-15). Re-add when amert_* tables are
// populated.

const express = require('express');
const { asyncHandler, buildSuccess, ConflictError } = require('@rbm/lib/errors');

const syncCbpStaff = require('../jobs/sync-cbp-staff');
const config = require('../config');
const { requirePermission } = require('../middleware/rbac');

const router = express.Router();

/**
 * GET /status — return the in-memory sync state and cron schedule for the
 * CBP job. Consumed by the admin UI dashboard.
 */
router.get('/status', asyncHandler(async (req, res) => {
  res.json(buildSuccess({
    syncState: req.app.locals.syncState,
    cron: { cbp: config.CBP_SYNC_CRON, timezone: config.CRON_TIMEZONE },
    enabled: config.CRON_ENABLED,
  }));
}));

/**
 * POST /trigger-cbp — manually trigger a CBP staff sync. RBAC-gated on
 * `sync:execute:all`. The handler responds 202 immediately and runs the job
 * in the background; concurrent runs are blocked by the shared mutex
 * (cron vs manual).
 */
router.post(
  '/trigger-cbp',
  requirePermission({ module: 'sync', action: 'execute' }),
  asyncHandler(async (req, res) => {
    const { syncState, cbpMutex, log } = req.app.locals;

    const release = cbpMutex.tryAcquire(`user:${req.user.id}`);
    if (!release) {
      throw new ConflictError('CBP sync is already running');
    }

    syncState.cbp.status = 'running';
    syncState.cbp.lastRun = new Date().toISOString();

    // Fire-and-forget: release mutex + update state in the continuation.
    syncCbpStaff.run({ log })
      .then((result) => {
        syncState.cbp.status = 'completed';
        syncState.cbp.error = null;
        syncState.cbp.lastResult = result;
        log.info('cbp.manual.completed', result);
      })
      .catch((err) => {
        syncState.cbp.status = 'failed';
        syncState.cbp.error = err.message;
        log.error('cbp.manual.failed', { err: err.message });
      })
      .finally(() => { release(); });

    res.status(202).json(buildSuccess({
      message: 'CBP sync triggered',
      status: 'running',
      startedAt: syncState.cbp.lastRun,
    }));
  }),
);

module.exports = router;
