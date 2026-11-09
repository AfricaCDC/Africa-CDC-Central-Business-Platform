/**
 * App Settings (D-20260707-01).
 *
 * Generic admin-managed key/value store for platform behaviour that must be
 * tunable WITHOUT a redeploy (the "if an admin changes it, no code change"
 * rule). First consumers: the reporting reminder schedulers — both the
 * draft-reporter reminder (D-20260420-39, previously env-gated) and the new
 * quarter-deadline approver reminder read their enable flag / schedule from
 * this table on every cron tick.
 *
 * Also seeds the `settings` RBAC module (already declared in
 * packages/lib/rbac.js RBAC_MODULES.SETTINGS but never seeded) with
 * read/update actions granted to SYSTEM_ADMIN and RBM_ADMIN.
 *
 * Idempotent: hasTable-guarded creates, insert-if-missing seeds — safe to
 * re-run on staging/shared-dev.
 */

const SETTINGS_SEED = [
  {
    key: 'reminders.draft.enabled',
    value: '0',
    description: 'Daily email reminder to reporters with unsubmitted DRAFT reports (1 = on).',
  },
  {
    key: 'reminders.draft.hour_utc',
    value: '6',
    description: 'UTC hour of day (0-23) after which the draft reminder fires.',
  },
  {
    key: 'reminders.deadline.enabled',
    value: '0',
    description: 'Email reminder to approvers with reports awaiting their decision as the reporting window nears its close (1 = on).',
  },
  {
    key: 'reminders.deadline.days_before',
    value: '7,3,1',
    description: 'Comma-separated days before the OPEN period end_date on which the deadline reminder fires.',
  },
  {
    key: 'reminders.deadline.hour_utc',
    value: '6',
    description: 'UTC hour of day (0-23) after which the deadline reminder fires.',
  },
];

exports.up = async function up(knex) {
  // ── 1. app_settings table ─────────────────────────────────────
  if (!(await knex.schema.hasTable('app_settings'))) {
    await knex.schema.createTable('app_settings', (t) => {
      t.string('key', 120).primary();
      t.text('value').notNullable();
      t.string('description', 500).nullable();
      t.bigInteger('updated_by').unsigned().nullable();
      t.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
      t.dateTime('updated_at').notNullable()
        .defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));
    });
  }

  // ── 2. Seed reminder settings (insert-if-missing) ─────────────
  for (const row of SETTINGS_SEED) {
    const exists = await knex('app_settings').where('key', row.key).first();
    if (!exists) await knex('app_settings').insert(row);
  }

  // ── 3. RBAC: settings module + read/update grants ─────────────
  const SETTINGS_MODULE = {
    code: 'settings',
    name: 'Platform Settings',
    category: 'admin',
    sort_order: 37,
  };

  let mod = await knex('rbac_modules').where('code', SETTINGS_MODULE.code).first();
  if (!mod) {
    const [id] = await knex('rbac_modules').insert(SETTINGS_MODULE);
    mod = { id, ...SETTINGS_MODULE };
  }

  // read / update are shared action codes — reuse existing rows.
  const actionMap = {};
  for (const code of ['read', 'update']) {
    const row = await knex('rbac_actions').where('code', code).first();
    if (row) actionMap[code] = row.id;
  }

  const ROLE_GRANTS = {
    SYSTEM_ADMIN: { read: 'all', update: 'all' },
    RBM_ADMIN:    { read: 'all', update: 'all' },
  };

  const roleRows = await knex('roles').select('id', 'code');
  const roleMap = {};
  roleRows.forEach((r) => { roleMap[r.code] = r.id; });

  for (const [roleCode, perms] of Object.entries(ROLE_GRANTS)) {
    const roleId = roleMap[roleCode];
    if (!roleId) continue;
    for (const [actCode, scope] of Object.entries(perms)) {
      const actionId = actionMap[actCode];
      if (!actionId) continue;
      const exists = await knex('rbac_permissions')
        .where({ role_id: roleId, module_id: mod.id, action_id: actionId })
        .first();
      if (!exists) {
        await knex('rbac_permissions').insert({
          role_id: roleId, module_id: mod.id, action_id: actionId, scope,
        });
      }
    }
  }
};

exports.down = async function down(knex) {
  // ── Reverse RBAC seed ─────────────────────────────────────────
  const mod = await knex('rbac_modules').where('code', 'settings').first();
  if (mod) {
    await knex('rbac_permissions').where('module_id', mod.id).del();
    await knex('rbac_modules').where('id', mod.id).del();
  }
  // read/update action rows are shared with other modules — never dropped.

  // ── Drop table ────────────────────────────────────────────────
  if (await knex.schema.hasTable('app_settings')) {
    await knex.schema.dropTable('app_settings');
  }
};
