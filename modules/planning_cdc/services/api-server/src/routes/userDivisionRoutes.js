/* eslint-disable max-lines --
 * 224 lines. Four CRUD handlers + a listing + shared Zod schemas in one
 * file — splitting produces a 3-file shuffle for zero clarity gain. (D-20260420-36)
 */
/**
 * CRUD for user ↔ division assignments (user_divisions junction table).
 *
 * All endpoints are scoped under /admin/users/:userId/divisions and
 * require the `users:update` RBAC permission.
 *
 * @name userDivisionRoutes
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const knex = require('../config/db');
const { buildSuccess, buildError, ConflictError } = require('@rbm/lib/errors');
const { DIVISION_ASSIGNMENT_ROLE_LIST } = require('@rbm/lib/user-divisions');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const divisionAssignmentService = require('../services/divisionAssignmentService');

router.use(authenticateToken);

const canUpdateUsers = authorize({ module: 'users', action: 'update' });

const createSchema = z.object({
  division_code: z.string().min(1).max(20),
  role: z.enum(DIVISION_ASSIGNMENT_ROLE_LIST),
  is_primary: z.boolean().optional().default(false),
});

const updateSchema = z.object({
  role: z.enum(DIVISION_ASSIGNMENT_ROLE_LIST).optional(),
  is_primary: z.boolean().optional(),
}).refine((d) => d.role !== undefined || d.is_primary !== undefined, {
  message: 'At least one field (role or is_primary) must be provided',
});

/**
 * @param {string} raw
 * @returns {number|null}
 */
function safeParseInt(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * List all division assignments for a user.
 *
 * @name GET /admin/users/:userId/divisions
 * @returns {{ success: true, data: Array }}
 */
router.get(
  '/users/:userId/divisions',
  canUpdateUsers,
  asyncHandler(async (req, res) => {
    const userId = safeParseInt(req.params.userId);
    if (!userId) {
      return res.status(400).json(buildError('VALIDATION_FAILED', 'Invalid user ID'));
    }

    const rows = await knex('user_divisions as ud')
      .leftJoin('division_codes as dc', 'ud.division_code', 'dc.code')
      .where('ud.user_id', userId)
      .select(
        'ud.id',
        'ud.division_code',
        'dc.division_name',
        'dc.level_type',
        'ud.role',
        'ud.is_primary',
        'ud.assigned_at',
      )
      .orderBy('ud.is_primary', 'desc')
      .orderBy('dc.division_name', 'asc');

    res.json(buildSuccess(rows));
  }),
);

/**
 * Add a division assignment for a user.
 *
 * @name POST /admin/users/:userId/divisions
 * @param {{ division_code: string, role: string, is_primary?: boolean }} body
 * @returns {{ success: true, data: { id: number } }}
 */
router.post(
  '/users/:userId/divisions',
  canUpdateUsers,
  asyncHandler(async (req, res) => {
    const userId = safeParseInt(req.params.userId);
    if (!userId) {
      return res.status(400).json(buildError('VALIDATION_FAILED', 'Invalid user ID'));
    }

    const result = createSchema.safeParse(req.body);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join('; ');
      return res.status(400).json(buildError('VALIDATION_FAILED', msg));
    }
    const parsed = result.data;

    const user = await knex('users').where('id', userId).first('id');
    if (!user) {
      return res.status(404).json(buildError('NOT_FOUND', 'User not found'));
    }

    const div = await knex('division_codes').where('code', parsed.division_code).first('code');
    if (!div) {
      return res.status(404).json(buildError('NOT_FOUND', 'Division not found'));
    }

    const existing = await knex('user_divisions')
      .where({ user_id: userId, division_code: parsed.division_code, role: parsed.role })
      .first('id');
    if (existing) {
      return res.status(409).json(
        buildError('DUPLICATE_ENTRY', 'User already has this role in this division'),
      );
    }

    await knex.transaction((trx) => divisionAssignmentService.addDivisionRole(trx, {
      userId,
      code: parsed.division_code,
      role: parsed.role,
      isPrimary: parsed.is_primary,
    }));
    const created = await knex('user_divisions')
      .where({ user_id: userId, division_code: parsed.division_code, role: parsed.role })
      .first('id');
    if (created) {
      await knex('user_divisions').where('id', created.id).update({ assigned_by: req.user.id });
    }
    // Global roles follow user_divisions inside the service (D-20261009-03).
    res.status(201).json(buildSuccess({ id: created ? created.id : null }));
  }),
);

/**
 * Update a division assignment (role and/or is_primary).
 *
 * @name PUT /admin/users/:userId/divisions/:id
 * @param {{ role?: string, is_primary?: boolean }} body
 * @returns {{ success: true, data: { id: number } }}
 */
router.put(
  '/users/:userId/divisions/:id',
  canUpdateUsers,
  asyncHandler(async (req, res) => {
    const userId = safeParseInt(req.params.userId);
    const id = safeParseInt(req.params.id);
    if (!userId || !id) {
      return res.status(400).json(buildError('VALIDATION_FAILED', 'Invalid ID'));
    }

    const result = updateSchema.safeParse(req.body);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join('; ');
      return res.status(400).json(buildError('VALIDATION_FAILED', msg));
    }
    const parsed = result.data;

    const row = await knex('user_divisions')
      .where({ id, user_id: userId })
      .first('id', 'division_code', 'role', 'is_primary');
    if (!row) {
      return res.status(404).json(buildError('NOT_FOUND', 'Division assignment not found'));
    }

    await knex.transaction(async (trx) => {
      if (parsed.role !== undefined && parsed.role !== row.role) {
        // Changing the role moves the holder pointer through the shared service.
        const clash = await trx('user_divisions')
          .where({ user_id: userId, division_code: row.division_code, role: parsed.role })
          .first('id');
        if (clash) throw new ConflictError('User already has this role in this division');
        // Add before remove: the user never leaves the division mid-change,
        // so users.division_code is not moved off it (syncLegacyDivision).
        await divisionAssignmentService.addDivisionRole(trx, {
          userId,
          code: row.division_code,
          role: parsed.role,
          isPrimary: parsed.is_primary !== undefined ? parsed.is_primary : Boolean(row.is_primary),
        });
        await divisionAssignmentService.removeDivisionRole(trx, {
          userId, code: row.division_code, role: row.role,
        });
        return;
      }

      if (parsed.is_primary !== undefined) {
        if (parsed.is_primary) {
          await trx('user_divisions').where('user_id', userId).update({ is_primary: false });
        }
        await trx('user_divisions').where('id', id).update({ is_primary: parsed.is_primary });
      }
    });

    res.json(buildSuccess({ id }));
  }),
);

/**
 * Remove a division assignment.
 *
 * @name DELETE /admin/users/:userId/divisions/:id
 * @returns {{ success: true, data: { deleted: true } }}
 */
router.delete(
  '/users/:userId/divisions/:id',
  canUpdateUsers,
  asyncHandler(async (req, res) => {
    const userId = safeParseInt(req.params.userId);
    const id = safeParseInt(req.params.id);
    if (!userId || !id) {
      return res.status(400).json(buildError('VALIDATION_FAILED', 'Invalid ID'));
    }

    const row = await knex('user_divisions')
      .where({ id, user_id: userId })
      .first('id', 'division_code', 'role');
    if (!row) {
      return res.status(404).json(buildError('NOT_FOUND', 'Division assignment not found'));
    }

    // Removing a holder row clears the division's holder pointer as well.
    await knex.transaction((trx) => divisionAssignmentService.removeDivisionRole(trx, {
      userId, code: row.division_code, role: row.role,
    }));

    res.json(buildSuccess({ deleted: true }));
  }),
);

module.exports = router;
