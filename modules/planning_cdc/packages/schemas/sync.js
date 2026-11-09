/**
 * @rbm/schemas/sync — Zod schemas for sync-service endpoints (staff sync
 * from the CBP directory; AMERT sync is currently disabled per D-04).
 */

const { z } = require('zod');
const { SYNC_STATUSES } = require('@rbm/lib/enums');

/**
 * Single staff record coming from the CBP directory. Shape deliberately
 * loose on optional fields so a directory change doesn't break the sync —
 * only the required identifiers are strictly enforced.
 */
const staffRecordSchema = z.object({
  cbp_id: z.string().min(1).max(64),
  full_name: z.string().min(1).max(255),
  email: z.string().email(),
  division_code: z.string().min(1).max(32).optional(),
  role: z.string().max(64).optional(),
  title: z.string().max(255).optional(),
  is_active: z.boolean().optional(),
});

/**
 * Request body for `POST /api/admin/sync-staff` (D-03).
 */
const syncRequestSchema = z.object({
  records: z.array(staffRecordSchema).min(1).max(5000),
  correlationId: z.string().min(1).max(64).optional(),
});

/**
 * Response body after staff upsert.
 */
const syncResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    status: z.enum(Object.values(SYNC_STATUSES)),
    inserted: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    errors: z.array(z.object({
      cbp_id: z.string().optional(),
      message: z.string(),
    })).default([]),
  }),
});

module.exports = { syncRequestSchema, syncResponseSchema, staffRecordSchema };
