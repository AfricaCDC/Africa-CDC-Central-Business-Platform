/**
 * Backlog VH-3 — role-based views via the RBAC matrix (single source of truth).
 *
 * Idempotent UPSERT of permission rows into the already-seeded matrix
 * (rbac_permissions). The seed (03_rbac_permissions.js) only inserts on a
 * fresh DB; this migration applies the same deltas to existing environments
 * without a destructive reseed.
 *
 * Deltas (decided with Lenny 2026-05-31):
 *   - STAFF: gains activity reporting (create/update/submit on activity_report,
 *     scope 'own') on top of its read-only views. "Staff = viewing + activity
 *     reporting" — nothing else.
 *   - FOCAL_PERSON: gains 'export' on the plan + reports it already reads, so a
 *     focal point can export the workplan and the activity/quarterly/division
 *     reports. Scope mirrors their existing read scope.
 *
 * ME_OFFICER already has pirs:create:all (verified) → "M&E can add indicators"
 * needs no matrix change here; the route guard added in the same PR enforces it.
 *
 * `down` removes exactly the rows this migration could have added.
 */

// (role, module, action, scope) tuples to ensure-present.
const GRANTS = [
  ['STAFF', 'activity_report', 'create', 'own'],
  ['STAFF', 'activity_report', 'update', 'own'],
  ['STAFF', 'activity_report', 'submit', 'own'],
  ['FOCAL_PERSON', 'workplan', 'export', 'division'],
  ['FOCAL_PERSON', 'activity_report', 'export', 'own'],
  ['FOCAL_PERSON', 'quarterly_report', 'export', 'own'],
  ['FOCAL_PERSON', 'division_report', 'export', 'division'],
];

async function resolveIds(knex) {
  const [roles, modules, actions] = await Promise.all([
    knex('roles').select('id', 'code'),
    knex('rbac_modules').select('id', 'code'),
    knex('rbac_actions').select('id', 'code'),
  ]);
  const byCode = (rows) => rows.reduce((m, r) => { m[r.code] = r.id; return m; }, {});
  return { roleMap: byCode(roles), modMap: byCode(modules), actMap: byCode(actions) };
}

exports.up = async function up(knex) {
  const { roleMap, modMap, actMap } = await resolveIds(knex);

  for (const [role, mod, action, scope] of GRANTS) {
    const roleId = roleMap[role];
    const moduleId = modMap[mod];
    const actionId = actMap[action];
    if (!roleId || !moduleId || !actionId) continue; // skip if a code is absent in this env

    const exists = await knex('rbac_permissions')
      .where({ role_id: roleId, module_id: moduleId, action_id: actionId })
      .first();
    if (exists) {
      // Ensure the scope is the intended one (heal a divergent pre-existing row).
      if (exists.scope !== scope) {
        await knex('rbac_permissions')
          .where({ role_id: roleId, module_id: moduleId, action_id: actionId })
          .update({ scope });
      }
    } else {
      await knex('rbac_permissions').insert({
        role_id: roleId, module_id: moduleId, action_id: actionId, scope,
      });
    }
  }
};

exports.down = async function down(knex) {
  const { roleMap, modMap, actMap } = await resolveIds(knex);

  for (const [role, mod, action] of GRANTS) {
    const roleId = roleMap[role];
    const moduleId = modMap[mod];
    const actionId = actMap[action];
    if (!roleId || !moduleId || !actionId) continue;

    await knex('rbac_permissions')
      .where({ role_id: roleId, module_id: moduleId, action_id: actionId })
      .del();
  }
};
