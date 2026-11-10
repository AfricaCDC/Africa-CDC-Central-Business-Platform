/**
 * @rbm/schemas/notification — Zod schemas for notification-service payloads.
 *
 * The service accepts TWO request shapes during the D-05 migration window:
 *   1. Canonical `{ type, to, subject?, data, correlationId? }` — new callers.
 *   2. Legacy   `{ type, channels?, recipients:[{email,userId?}], data }`
 *      — api-server's `notifyService.js` still uses this.
 *
 * Both resolve to the same outbox row per recipient.
 */

const { z } = require('zod');
const { NOTIFICATION_TYPES, NOTIFICATION_TYPE_ALIASES } = require('@rbm/lib/enums');

const CANONICAL_TYPES = Object.values(NOTIFICATION_TYPES);
const ALIAS_KEYS = Object.keys(NOTIFICATION_TYPE_ALIASES);

/**
 * Accept either the canonical SCREAMING_SNAKE_CASE symbol or the legacy
 * kebab-case alias; both normalize to the canonical value.
 */
const notificationTypeSchema = z
  .string()
  .min(1)
  .max(64)
  .transform((val, ctx) => {
    if (CANONICAL_TYPES.includes(val)) return val;
    if (NOTIFICATION_TYPE_ALIASES[val]) return NOTIFICATION_TYPE_ALIASES[val];
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unknown notification type '${val}'. Expected one of: ${[...CANONICAL_TYPES, ...ALIAS_KEYS].join(', ')}`,
    });
    return z.NEVER;
  });

const recipientSchema = z.object({
  email: z.string().email(),
  userId: z.union([z.string(), z.number()]).optional(),
});

/**
 * Request body for `POST /send` — accepts both the canonical shape and the
 * legacy `recipients[]` shape. Exactly one recipient form must be present.
 */
const notificationRequestSchema = z
  .object({
    type: notificationTypeSchema,
    to: z.union([
      z.string().email(),
      z.array(z.string().email()).min(1).max(50),
    ]).optional(),
    recipients: z.array(recipientSchema).min(1).max(50).optional(),
    channels: z.array(z.enum(['in-app', 'email'])).optional(),
    subject: z.string().min(1).max(255).optional(),
    data: z.record(z.string(), z.any()).default({}),
    correlationId: z.string().min(1).max(64).optional(),
  })
  .refine((v) => v.to != null || (v.recipients && v.recipients.length > 0), {
    message: 'Either `to` or `recipients` is required',
    path: ['to'],
  });

/**
 * Response body returned by notification-service after enqueue.
 */
const notificationResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    enqueued: z.number().int().nonnegative(),
    ids: z.array(z.union([z.string(), z.number()])),
    correlationId: z.string().optional(),
  }),
});

module.exports = {
  notificationRequestSchema,
  notificationResponseSchema,
  notificationTypeSchema,
};
