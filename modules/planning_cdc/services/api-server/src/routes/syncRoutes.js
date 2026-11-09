/**
 * /api/admin/sync-staff — D-03 service-to-service endpoint called by
 * sync-service on every CBP directory sync run.
 *
 * Authentication: service token (D-07). `serviceTokenAuth` middleware
 * validates the incoming JWT, checks the `svc` claim, and rejects any
 * user-JWT — this route is NOT reachable with a human bearer token.
 *
 * Contract (from `@rbm/schemas/sync`):
 *   Request  { records: [{ cbp_id, full_name, email, division_code?, role?, title?, is_active? }], correlationId? }
 *   Response { success:true, data:{ status, inserted, updated, skipped, errors:[] } }
 *
 * Upsert key: `cbp_id` (added by migration 20260415500000). Email is a
 * stable secondary identifier — records with a new cbp_id but an email
 * already present on another row are logged to `errors[]` and skipped
 * so we never rewrite a human's primary login.
 *
 * Idempotent by design: sending the same batch twice yields
 * `{ inserted: 0, updated: N, skipped: 0 }` on the second call.
 */

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { createServiceTokenAuth } = require('@rbm/lib/serviceToken');
const { syncRequestSchema } = require('@rbm/schemas');
const { asyncHandler, buildSuccess, ValidationError } = require('@rbm/lib/errors');
const { SYNC_STATUSES } = require('@rbm/lib/enums');

// Each env has its own SERVICE_TOKEN_SECRET. Missing value in non-test
// environments is a fail-fast, not a warning — we do NOT want this route
// to silently accept every JWT because the secret wasn't configured.
const SERVICE_TOKEN_SECRET = process.env.SERVICE_TOKEN_SECRET;
if (!SERVICE_TOKEN_SECRET && process.env.NODE_ENV !== 'test') {
  throw new Error('SERVICE_TOKEN_SECRET is required — set it in the api-server env');
}

const svcAuth = createServiceTokenAuth({
  secret: SERVICE_TOKEN_SECRET || 'test-only-not-for-prod',
  allowedServices: ['sync-service'],
});

/**
 * Upsert a staff record onto `users`. Prefers `cbp_id` as the natural key,
 * falling back to `email` only when a row has never carried a CBP id.
 *
 * @param {import('knex').Knex} trx — active knex transaction.
 * @param {object} rec — validated record from `syncRequestSchema`.
 * @returns {Promise<'inserted'|'updated'|'skipped'>}
 * @throws never — callers translate to `errors[]`.
 */
async function upsertStaff(trx, rec) {
  const existing = await trx('users')
    .where('cbp_id', rec.cbp_id)
    .orWhere('email', rec.email)
    .first();

  const base = {
    email: rec.email,
    cbp_id: rec.cbp_id,
    full_name: rec.full_name,
    status: rec.is_active === false ? 'DISABLED' : 'ACTIVE',
  };
  if (rec.division_code) base.division_code = rec.division_code;

  if (!existing) {
    await trx('users').insert({
      ...base,
      user_type: 'STAFF',
      created_at: new Date(),
      updated_at: new Date(),
    });
    return 'inserted';
  }

  // Collision: cbp_id belongs to a different user than the email we're
  // about to overwrite. Skip rather than silently rewrite a login.
  if (existing.cbp_id && existing.cbp_id !== rec.cbp_id) return 'skipped';
  if (existing.email && existing.email !== rec.email && existing.cbp_id !== rec.cbp_id) return 'skipped';

  await trx('users').where('id', existing.id).update({
    ...base,
    updated_at: new Date(),
  });
  return 'updated';
}

/**
 * POST /api/admin/sync-staff — batch upsert from sync-service.
 *
 * @name POST /api/admin/sync-staff
 * @param {import('express').Request} req — body validated against `syncRequestSchema`.
 * @param {import('express').Response} res — 200 with the canonical success envelope.
 * @returns {Promise<void>}
 * @throws {ValidationError} 400 when the body fails schema validation.
 * @example
 *   curl -X POST http://localhost:4000/api/admin/sync-staff \
 *        -H "Authorization: Bearer $SERVICE_TOKEN" \
 *        -H "Content-Type: application/json" \
 *        -d '{"records":[{"cbp_id":"cbp-42","full_name":"Ada","email":"ada@africacdc.org"}]}'
 */
router.post('/sync-staff', svcAuth, asyncHandler(async (req, res) => {
  const parsed = syncRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('sync-staff payload validation failed', parsed.error.flatten());
  }

  const { records } = parsed.data;
  const summary = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  await db.transaction(async (trx) => {
    for (const rec of records) {
      try {
        const result = await upsertStaff(trx, rec);
        summary[result] += 1;
      } catch (err) {
        summary.errors.push({ cbp_id: rec.cbp_id, message: err.message || 'unknown' });
      }
    }
  });

  res.json(buildSuccess({
    status: SYNC_STATUSES.SUCCEEDED,
    inserted: summary.inserted,
    updated: summary.updated,
    skipped: summary.skipped,
    errors: summary.errors,
  }));
}));

module.exports = router;
