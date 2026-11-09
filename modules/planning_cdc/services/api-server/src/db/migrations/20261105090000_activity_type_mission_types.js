/**
 * Specific activity types = the Activity Reporting Template's activity and
 * mission types (D-20261105-01): the focal person picks one of the seven at
 * creation, and the activity report shows it, read-only.
 *
 * plan_nodes.activity_type becomes VARCHAR(40) (like activity_reports.mission_type;
 * the allowed values live in @rbm/lib/enums, so the list can change without a
 * schema change) and the old planning types are converted:
 *   MEETING, CONFERENCE, WORKSHOP -> EVENT
 *   TECHNICAL_ASSISTANCE          -> OTHER
 *   TRAINING, PROCUREMENT         -> unchanged
 * Activity reports keep their stored mission type.
 *
 * down: back to the old ENUM; EVENT -> MEETING, OTHER -> TECHNICAL_ASSISTANCE,
 * types without an old counterpart -> NULL (lossy: the original split of
 * MEETING / CONFERENCE / WORKSHOP is not recoverable; restore the backup taken
 * before the release if it matters).
 */

const { MISSION_TYPES } = require('@rbm/lib/enums');

const OLD_TYPES = ['PROCUREMENT', 'TRAINING', 'MEETING', 'CONFERENCE', 'WORKSHOP', 'TECHNICAL_ASSISTANCE'];
const TO_NEW = {
  MEETING: MISSION_TYPES.EVENT,
  CONFERENCE: MISSION_TYPES.EVENT,
  WORKSHOP: MISSION_TYPES.EVENT,
  TECHNICAL_ASSISTANCE: MISSION_TYPES.OTHER,
};

exports.up = async function (knex) {
  if (!(await knex.schema.hasColumn('plan_nodes', 'activity_type'))) return;
  await knex.raw('ALTER TABLE plan_nodes MODIFY COLUMN activity_type VARCHAR(40) NULL');
  for (const [from, to] of Object.entries(TO_NEW)) {
    await knex('plan_nodes').where('activity_type', from).update({ activity_type: to });
  }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasColumn('plan_nodes', 'activity_type'))) return;
  await knex('plan_nodes').where('activity_type', MISSION_TYPES.EVENT).update({ activity_type: 'MEETING' });
  await knex('plan_nodes').where('activity_type', MISSION_TYPES.OTHER).update({ activity_type: 'TECHNICAL_ASSISTANCE' });
  await knex('plan_nodes').whereNotNull('activity_type').whereNotIn('activity_type', OLD_TYPES).update({ activity_type: null });
  const list = OLD_TYPES.map((t) => `'${t}'`).join(',');
  await knex.raw(`ALTER TABLE plan_nodes MODIFY COLUMN activity_type ENUM(${list}) NULL`);
};
