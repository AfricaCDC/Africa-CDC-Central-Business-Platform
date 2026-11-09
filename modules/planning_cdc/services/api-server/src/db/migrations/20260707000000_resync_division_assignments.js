/**
 * Resync division_codes assignments → user_divisions + user_roles.
 *
 * The submit/approve guards authorise via user_divisions AND the RBAC role
 * (e.g. POST /indicator-division-reports/:id/submit needs a FOCAL_PERSON /
 * HEAD_OF_DIVISION / DIRECTOR row on the report's division). The admin
 * org-chart endpoint keeps the three assignment columns in sync
 * (hierarchy.js ensureUserRole/ensureDivisionAssignment), but rows written
 * through older paths (April Excel imports, pre-sync admin code) drifted:
 * on staging, the WARCC and Wkf focal persons had focal_user_id set with no
 * user_divisions row and no FOCAL_PERSON role — their "Submit Report"
 * button returned 403.
 *
 * Mirrors the one-shot 20260418100000 sync but is fully idempotent, so any
 * future drift self-heals at the next deploy.
 */

const ROLE_BY_FIELD = [
  ['focal_user_id', () => 'FOCAL_PERSON'],
  ['responsible_user_id', (row) => (row.level_type === 'directorate' ? 'DIRECTOR' : 'HEAD_OF_DIVISION')],
  ['m_and_e_user_id', () => 'ME_OFFICER'],
];

exports.up = async function (knex) {
  const hasCols = await knex.schema.hasColumn('division_codes', 'focal_user_id');
  if (!hasCols || !(await knex.schema.hasTable('user_divisions'))) return;

  const roles = await knex('roles').select('id', 'code');
  const roleIdByCode = Object.fromEntries(roles.map((r) => [r.code, r.id]));

  const divisions = await knex('division_codes')
    .whereNotNull('focal_user_id')
    .orWhereNotNull('responsible_user_id')
    .orWhereNotNull('m_and_e_user_id')
    .select('code', 'level_type', 'focal_user_id', 'responsible_user_id', 'm_and_e_user_id');

  let fixedAssignments = 0;
  let fixedRoles = 0;

  for (const div of divisions) {
    for (const [field, roleFor] of ROLE_BY_FIELD) {
      const userId = div[field];
      if (!userId) continue;
      const role = roleFor(div);

      // Skip users deleted since the assignment was written.
      // eslint-disable-next-line no-await-in-loop -- sequential, small dataset
      const userExists = await knex('users').where('id', userId).first('id');
      if (!userExists) continue;

      // user_divisions row (the guard's division check)
      // eslint-disable-next-line no-await-in-loop
      const ud = await knex('user_divisions')
        .where({ user_id: userId, division_code: div.code, role })
        .first();
      if (!ud) {
        // eslint-disable-next-line no-await-in-loop
        await knex('user_divisions').insert({ user_id: userId, division_code: div.code, role });
        fixedAssignments += 1;
        // Drop the now-redundant MEMBER row, mirroring ensureDivisionAssignment.
        // eslint-disable-next-line no-await-in-loop
        await knex('user_divisions')
          .where({ user_id: userId, division_code: div.code, role: 'MEMBER' })
          .del();
      }

      // Global RBAC role (the guard's permission check)
      const roleId = roleIdByCode[role];
      if (!roleId) continue;
      // eslint-disable-next-line no-await-in-loop
      const ur = await knex('user_roles').where({ user_id: userId, role_id: roleId }).first();
      if (!ur) {
        // eslint-disable-next-line no-await-in-loop
        await knex('user_roles').insert({ user_id: userId, role_id: roleId });
        fixedRoles += 1;
      }
    }
  }

  // eslint-disable-next-line no-console -- migration progress, mirrors sibling migrations
  console.log(`[resync_division_assignments] user_divisions added: ${fixedAssignments}, roles granted: ${fixedRoles}`);
};

exports.down = async function () {
  // Data-repair migration: rows added are indistinguishable from organic
  // assignments, and removing roles is destructive. No-op on rollback.
};
