/**
 * Multi-division user assignment — widen role enum, add is_primary flag,
 * backfill 333 STAFF users from `users.division_code`.
 *
 * `user_divisions` becomes the single source of truth for user ↔ division
 * assignment. `users.division_code` will be deprecated in Phase B.
 */
exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('user_divisions'))) return;

  // 1. Widen role enum to include DIRECTOR and MEMBER
  await knex.raw(`
    ALTER TABLE user_divisions
    MODIFY role ENUM('FOCAL_PERSON','HEAD_OF_DIVISION','DIRECTOR','MEMBER') NOT NULL
  `);

  // 2. Add is_primary flag
  const hasPrimary = await knex.schema.hasColumn('user_divisions', 'is_primary');
  if (!hasPrimary) {
    await knex.schema.alterTable('user_divisions', (t) => {
      t.boolean('is_primary').notNullable().defaultTo(false);
    });
  }

  // 3. Backfill STAFF users who have users.division_code but zero
  //    user_divisions rows. They get a MEMBER row with is_primary=true.
  //    (legacy column — absent on fresh installs, so skip the backfill)
  if (!(await knex.schema.hasColumn('users', 'division_code'))) return;
  await knex.raw(`
    INSERT INTO user_divisions (user_id, division_code, role, is_primary, assigned_by)
    SELECT u.id, u.division_code, 'MEMBER', TRUE, 1
    FROM users u
    INNER JOIN division_codes dc ON dc.code = u.division_code
    WHERE u.division_code IS NOT NULL
      AND u.division_code != ''
      AND u.id NOT IN (SELECT DISTINCT user_id FROM user_divisions)
  `);

  // 4. Set is_primary=true for existing users with exactly one division
  //    (MySQL forbids sub-selecting the target table in UPDATE, so we join.)
  await knex.raw(`
    UPDATE user_divisions ud
    INNER JOIN (
      SELECT user_id FROM user_divisions GROUP BY user_id HAVING COUNT(*) = 1
    ) singles ON singles.user_id = ud.user_id
    SET ud.is_primary = TRUE
  `);
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('user_divisions'))) return;

  const hasPrimary = await knex.schema.hasColumn('user_divisions', 'is_primary');
  if (hasPrimary) {
    await knex.schema.alterTable('user_divisions', (t) => {
      t.dropColumn('is_primary');
    });
  }

  // Shrink enum back — delete DIRECTOR/MEMBER rows first to avoid constraint errors
  await knex('user_divisions').whereIn('role', ['DIRECTOR', 'MEMBER']).delete();
  await knex.raw(`
    ALTER TABLE user_divisions
    MODIFY role ENUM('FOCAL_PERSON','HEAD_OF_DIVISION') NOT NULL
  `);
};
