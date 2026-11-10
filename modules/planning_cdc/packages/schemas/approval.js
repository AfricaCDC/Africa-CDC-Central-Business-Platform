/**
 * @rbm/schemas/approval — Zod schemas for the contributor approval chain.
 *
 * Route handlers on `/api/governance/workflows/*` (both per-step actions
 * and admin-bypass) validate request bodies against these schemas.
 *
 * Related: D-20260415-05, docs/specs/contributor-approval-chain.md.
 */

const { z } = require('zod');

/**
 * POST /workflows/steps/:stepId/approve
 * Optional approver comment on a step approval.
 */
const approveStepBodySchema = z.object({
  comments: z.string().trim().max(2000).optional().nullable(),
});

/**
 * POST /workflows/steps/:stepId/reject
 * Rejection always requires a reason — enforced server-side.
 */
const rejectStepBodySchema = z.object({
  comments: z
    .string({ required_error: 'Rejection reason is required' })
    .trim()
    .min(3, 'Rejection reason must be at least 3 characters')
    .max(2000),
});

/**
 * POST /workflows/:instanceId/admin-bypass
 * Admin / M&E officer overrides a blocked step. Comment is mandatory and
 * recorded on every step that is force-approved.
 */
const adminBypassBodySchema = z.object({
  comments: z
    .string({ required_error: 'Admin-bypass justification is required' })
    .trim()
    .min(3, 'Justification must be at least 3 characters')
    .max(2000),
  bypassAll: z.boolean().optional().default(false),
});

module.exports = {
  approveStepBodySchema,
  rejectStepBodySchema,
  adminBypassBodySchema,
};
