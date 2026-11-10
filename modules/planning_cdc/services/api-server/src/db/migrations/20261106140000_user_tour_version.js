/**
 * Onboarding tour (D-20261105-16): users.tour_version_seen holds the last
 * version of the in-app tour the user finished or skipped (null = never
 * toured: the full tour starts at the next sign-in). Idempotent.
 */
'use strict';

exports.up = async function up(knex) {
  if (await knex.schema.hasColumn('users', 'tour_version_seen')) return;
  await knex.schema.alterTable('users', (t) => {
    t.string('tour_version_seen', 16).nullable();
  });
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasColumn('users', 'tour_version_seen'))) return;
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('tour_version_seen');
  });
};
