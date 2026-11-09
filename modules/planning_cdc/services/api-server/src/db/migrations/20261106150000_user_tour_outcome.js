/**
 * Onboarding tour outcome (D-20261106-03): users.tour_outcome says how the
 * user left the tour of users.tour_version_seen, FINISHED or SKIPPED
 * (TOUR_OUTCOMES in @rbm/lib/enums). Null for tours taken before this column.
 * Idempotent.
 */
'use strict';

exports.up = async function up(knex) {
  if (await knex.schema.hasColumn('users', 'tour_outcome')) return;
  await knex.schema.alterTable('users', (t) => {
    t.string('tour_outcome', 16).nullable();
  });
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasColumn('users', 'tour_outcome'))) return;
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('tour_outcome');
  });
};
