/**
 * Drop division_codes.focal_user_id, the « main focal » pointer (D-20261106-09).
 *
 * Focal persons are a team: the FOCAL_PERSON rows of user_divisions. The
 * pointer duplicated one of them and went stale (empty while the unit had
 * focal persons, or pointing at a disabled user), so notifications « to the
 * focal of the unit » reached nobody. Every reader now uses user_divisions.
 *
 * Before the drop, an ACTIVE user held only by the pointer gets a FOCAL_PERSON
 * row on that unit (canonical rows only, like every assignment), so no active
 * focal person is lost. Production on 2026-11-06: 40 pointers, one without a
 * row (HEP), on a disabled user, so nothing to carry over.
 *
 * `down` restores the column, its foreign key and index, and sets it to the
 * earliest FOCAL_PERSON row of each unit.
 */

const { DIVISION_ASSIGNMENT_ROLES: ROLE } = require('@rbm/lib/user-divisions');

const ACTIVE_USER = 'ACTIVE';

exports.up = async (knex) => {
  if (!(await knex.schema.hasColumn('division_codes', 'focal_user_id'))) return;

  const pointerOnly = await knex('division_codes as dc')
    .join('users as u', 'u.id', 'dc.focal_user_id')
    .whereNull('dc.alias_of')
    .where('u.status', ACTIVE_USER)
    .whereNotExists(function focalRow() {
      this.from('user_divisions as ud')
        .whereRaw('ud.division_code = dc.code AND ud.user_id = dc.focal_user_id')
        .where('ud.role', ROLE.FOCAL_PERSON);
    })
    .select('dc.code', 'dc.focal_user_id');
  for (const { code, focal_user_id: userId } of pointerOnly) {
    // A focal row replaces the user's MEMBER row there, as divisionAssignmentService does.
    await knex('user_divisions').where({ user_id: userId, division_code: code, role: ROLE.MEMBER }).del();
    await knex('user_divisions').insert({ user_id: userId, division_code: code, role: ROLE.FOCAL_PERSON, is_primary: false });
  }

  await knex.schema.alterTable('division_codes', (t) => {
    t.dropForeign('focal_user_id');
    t.dropIndex('focal_user_id', 'idx_div_focal_user');
  });
  await knex.schema.alterTable('division_codes', (t) => {
    t.dropColumn('focal_user_id');
  });
};

exports.down = async (knex) => {
  if (await knex.schema.hasColumn('division_codes', 'focal_user_id')) return;
  await knex.schema.alterTable('division_codes', (t) => {
    t.integer('focal_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL')
      .after('directorate');
    t.index('focal_user_id', 'idx_div_focal_user');
  });
  await knex.raw(
    `UPDATE division_codes dc SET dc.focal_user_id = (
       SELECT ud.user_id FROM user_divisions ud
       WHERE ud.division_code = COALESCE(dc.alias_of, dc.code) AND ud.role = ?
       ORDER BY ud.id LIMIT 1)`,
    [ROLE.FOCAL_PERSON],
  );
};
