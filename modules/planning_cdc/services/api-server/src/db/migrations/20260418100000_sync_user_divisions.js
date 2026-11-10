/**
 * Migration: sync user_divisions as the single source of truth for
 * division assignments.
 *
 * 1. Add ME_OFFICER to the role enum
 * 2. Sync from division_codes (focal → FOCAL_PERSON, responsible →
 *    HEAD_OF_DIVISION / DIRECTOR, m_and_e → ME_OFFICER)
 * 3. Add MEMBER rows from users.division_code for staff
 */

exports.up = async function (knex) {
  // 1. Add ME_OFFICER to the role enum
  await knex.raw(`
    ALTER TABLE user_divisions
    MODIFY COLUMN role ENUM('FOCAL_PERSON','HEAD_OF_DIVISION','DIRECTOR','MEMBER','ME_OFFICER')
    NOT NULL
  `);

  // 2. Sync from division_codes assignments
  const divisions = await knex('division_codes')
    .whereNotNull('focal_user_id')
    .orWhereNotNull('responsible_user_id')
    .orWhereNotNull('m_and_e_user_id')
    .select('code', 'level_type', 'focal_user_id', 'responsible_user_id', 'm_and_e_user_id');

  const toInsert = [];

  for (const d of divisions) {
    if (d.focal_user_id) {
      toInsert.push({
        user_id: d.focal_user_id,
        division_code: d.code,
        role: 'FOCAL_PERSON',
      });
    }
    if (d.responsible_user_id) {
      const role = d.level_type === 'directorate' ? 'DIRECTOR' : 'HEAD_OF_DIVISION';
      toInsert.push({
        user_id: d.responsible_user_id,
        division_code: d.code,
        role,
      });
    }
    if (d.m_and_e_user_id) {
      toInsert.push({
        user_id: d.m_and_e_user_id,
        division_code: d.code,
        role: 'ME_OFFICER',
      });
    }
  }

  // 3. Add MEMBER rows from users.division_code
  //    (legacy column — absent on fresh installs)
  if (await knex.schema.hasColumn('users', 'division_code')) {
    const users = await knex('users')
      .whereNotNull('division_code')
      .where('division_code', '!=', '')
      .select('id', 'division_code');

    for (const u of users) {
      toInsert.push({
        user_id: u.id,
        division_code: u.division_code,
        role: 'MEMBER',
      });
    }
  }

  // Deduplicate: skip if (user_id, division_code, role) already exists
  const existing = await knex('user_divisions').select('user_id', 'division_code', 'role');
  const existingSet = new Set(existing.map(r => `${r.user_id}:${r.division_code}:${r.role}`));

  const fresh = toInsert.filter(r => !existingSet.has(`${r.user_id}:${r.division_code}:${r.role}`));

  if (fresh.length > 0) {
    for (let i = 0; i < fresh.length; i += 100) {
      await knex('user_divisions').insert(fresh.slice(i, i + 100));
    }
  }

  // Remove redundant MEMBER rows where user already has a higher role
  // on the same division (FOCAL_PERSON, HEAD_OF_DIVISION, DIRECTOR, ME_OFFICER)
  await knex.raw(`
    DELETE m FROM user_divisions m
    INNER JOIN user_divisions h
      ON m.user_id = h.user_id
      AND m.division_code = h.division_code
      AND h.role != 'MEMBER'
    WHERE m.role = 'MEMBER'
  `);
};

exports.down = async function (knex) {
  // Remove ME_OFFICER rows, then revert enum
  await knex('user_divisions').where('role', 'ME_OFFICER').del();
  await knex('user_divisions').where('role', 'MEMBER').del();
  await knex.raw(`
    ALTER TABLE user_divisions
    MODIFY COLUMN role ENUM('FOCAL_PERSON','HEAD_OF_DIVISION','DIRECTOR','MEMBER')
    NOT NULL
  `);
};
