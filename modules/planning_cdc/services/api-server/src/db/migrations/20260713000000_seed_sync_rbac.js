/**
 * Seed the `sync` RBAC module + `execute` action (D-20260713-01).
 *
 * The sync-service trigger route (POST /sync/trigger-cbp) has always been
 * gated on `sync:execute:all`, but the module/action were never seeded —
 * so even SYSTEM_ADMIN got 403 and the admin UI could never expose the
 * "Import CBP users" button. Grants: SYSTEM_ADMIN + RBM_ADMIN, scope all.
 *
 * Idempotent (insert-if-missing), mirrors 20260707100000 (settings module).
 */

'use strict';

exports.up = async function up(knex) {
  const SYNC_MODULE = {
    code: 'sync',
    name: 'CBP Staff Sync',
    category: 'admin',
    sort_order: 38,
  };

  let mod = await knex('rbac_modules').where('code', SYNC_MODULE.code).first();
  if (!mod) {
    const [id] = await knex('rbac_modules').insert(SYNC_MODULE);
    mod = { id, ...SYNC_MODULE };
  }

  let action = await knex('rbac_actions').where('code', 'execute').first();
  if (!action) {
    const [id] = await knex('rbac_actions').insert({
      code: 'execute',
      name: 'Execute a sync run',
      sort_order: 7,
    });
    action = { id };
  }

  const roleRows = await knex('roles').whereIn('code', ['SYSTEM_ADMIN', 'RBM_ADMIN']).select('id');
  for (const role of roleRows) {
    const exists = await knex('rbac_permissions')
      .where({ role_id: role.id, module_id: mod.id, action_id: action.id })
      .first();
    if (!exists) {
      await knex('rbac_permissions').insert({
        role_id: role.id, module_id: mod.id, action_id: action.id, scope: 'all',
      });
    }
  }
};

exports.down = async function down(knex) {
  const mod = await knex('rbac_modules').where('code', 'sync').first();
  if (mod) {
    await knex('rbac_permissions').where('module_id', mod.id).del();
    await knex('rbac_modules').where('id', mod.id).del();
  }
  // `execute` action row: only drop if nothing else references it.
  const action = await knex('rbac_actions').where('code', 'execute').first();
  if (action) {
    const inUse = await knex('rbac_permissions').where('action_id', action.id).first();
    if (!inUse) await knex('rbac_actions').where('id', action.id).del();
  }
};
