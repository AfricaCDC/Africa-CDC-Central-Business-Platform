/**
 * Zod schemas + resolver-scope constant for notificationAdminRoutes.
 * Kept local to api-server (not in packages/schemas) to limit blast radius.
 *
 * RESOLVER_SCOPES must stay in sync with the registry in
 * services/api-server/src/services/notificationResolvers.js.
 */

const { z } = require('zod');

const RESOLVER_SCOPES = Object.freeze([
  'actor',
  'actor_division_hod',
  'actor_directorate_director',
  'entity_responsible',
  'entity_owner',
  'entity_previous_owner',
  'entity_division_hod',
  'entity_main_hod',
  'entity_contrib_hods',
  'focal_of_main',
  'entity_division_me_officer',
  'role_all',
  'role_all_active',
]);

const channelSchema = z.enum(['email', 'in_app', 'both']);

const subscriptionCreateSchema = z.object({
  event_key: z.string().min(1).max(120),
  recipient_role: z.string().min(1).max(40).nullable().optional(),
  recipient_scope: z.string().min(1).max(60)
    .refine((v) => RESOLVER_SCOPES.includes(v), {
      message: `Unknown recipient_scope. Expected one of: ${RESOLVER_SCOPES.join(', ')}`,
    }),
  channel: channelSchema.default('email'),
  template_key: z.string().min(1).max(120),
  priority: z.number().int().min(0).max(255).default(100),
  is_active: z.boolean().default(true),
  throttle_window_sec: z.number().int().min(0).max(86400).default(0),
  metadata: z.record(z.string(), z.any()).default({}),
});

const subscriptionUpdateSchema = subscriptionCreateSchema.partial();

const toggleSchema = z.object({ is_active: z.boolean() });

const testSendSchema = z.object({
  event_key: z.string().min(1).max(120),
  entity: z.record(z.string(), z.any()).default({}),
  metadata: z.record(z.string(), z.any()).default({}),
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

module.exports = {
  RESOLVER_SCOPES,
  subscriptionCreateSchema,
  subscriptionUpdateSchema,
  toggleSchema,
  testSendSchema,
  idParamSchema,
};
