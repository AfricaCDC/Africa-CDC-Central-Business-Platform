// ── Plan-Nodes · Activity Focal Person ──
//
// Per-activity focal person (plan_nodes.focal_user_id): eligibility rules
// and the division-staff picker endpoint. The focal must be an ACTIVE
// STAFF user assigned to the activity's responsible division
// (user_divisions, any role, alias-aware).
// Spec: docs/superpowers/specs/2026-07-21-activity-focal-person-design.md

const router = require('express').Router();
const { authenticateToken } = require('../../middleware/authMiddleware');
const { knex, log, envelopeError } = require('./_helpers');

/**
 * Whether the user is the designated focal person of this activity row.
 *
 * @param {number} userId
 * @param {{focal_user_id: ?number}} row - plan_nodes row
 * @returns {boolean}
 * @example isActivityFocal(10, { focal_user_id: 10 }) // true
 */
function isActivityFocal(userId, row) {
  return !!userId && !!row && row.focal_user_id === userId;
}

/**
 * Whether a user may be designated focal of an activity in a division:
 * ACTIVE STAFF + assigned to the division in user_divisions (alias-aware).
 *
 * @param {number} userId
 * @param {string} divisionCode
 * @returns {Promise<boolean>}
 * @example await isEligibleFocal(10, 'DDPHI') // true when member
 */
async function isEligibleFocal(userId, divisionCode) {
  if (!userId || !divisionCode) return false;
  const user = await knex('users').where('id', userId).first('id', 'user_type', 'status');
  if (!user || user.user_type !== 'STAFF' || user.status !== 'ACTIVE') return false;
  const memberships = await knex('user_divisions')
    .where('user_id', userId)
    .pluck('division_code');
  const { sameDivision } = require('../../services/divisionAliasService');
  for (const code of memberships) {
    if (await sameDivision(code, divisionCode)) return true;
  }
  return false;
}

router.use(authenticateToken);

// GET /plan-nodes/division-staff/:code — ACTIVE STAFF members of a division,
// for the activity-focal picker. Auth-only (not admin-gated): focal persons
// fill the activity form and cannot read /api/admin/divisions/:code.
/**
 * List ACTIVE STAFF users assigned to a division (alias-aware).
 *
 * @name GET /api/plan-nodes/division-staff/:code
 * @param {express.Request} req — path param `code` = division code
 * @param {express.Response} res — 200 `{success:true,data:[...]}`; 404 unknown division
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/plan-nodes/division-staff/DDPHI
 */
router.get('/division-staff/:code', async (req, res) => {
  try {
    const code = req.params.code;
    const div = await knex('division_codes').where('code', code).first('code');
    if (!div) return envelopeError(res, 404, 'Division not found');
    const { resolveAliases } = require('../../services/divisionAliasService');
    const codes = await resolveAliases(code);
    const rows = await knex('user_divisions as ud')
      .join('users as u', 'u.id', 'ud.user_id')
      .whereIn('ud.division_code', codes)
      .where('u.user_type', 'STAFF')
      .where('u.status', 'ACTIVE')
      .distinct('u.id', 'u.first_name', 'u.last_name', 'u.email')
      .orderBy('u.first_name', 'asc');
    res.json({ success: true, data: rows });
  } catch (err) {
    log.error('plan_nodes.division_staff_failed', { err: err.message, code: req.params.code });
    envelopeError(res, 500, err.message);
  }
});

module.exports = { router, isActivityFocal, isEligibleFocal };
