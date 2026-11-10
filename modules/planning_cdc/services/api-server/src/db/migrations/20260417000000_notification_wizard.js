/**
 * Notification Wizard (D-20260417-01).
 *
 * Introduces the event-bus + subscriptions data model that replaces the
 * hardcoded `notifyService.notify(...)` call sites. Coordinated with the
 * D-05 outbox migration (20260415400000_notification_outbox.js): this file
 * adds `event_key` + `subscription_id` + `channel` to `notification_outbox`
 * so the dispatcher can trace each row back to the subscription that
 * produced it.
 *
 * Tables added:
 *   notification_events         (catalog)
 *   notification_subscriptions  (admin-authored rules)
 *   notification_templates      (metadata + subject; body stays in JS)
 *
 * Schema + column choices are documented in
 *   docs/specs/notification-wizard.md §5
 * and the design rationale in D-20260417-01.
 *
 * Idempotent: every createTable is hasTable-guarded and every alterTable is
 * hasColumn-guarded so repeated runs in staging/shared-dev environments are
 * safe.
 */

exports.up = async function up(knex) {
  // ── 1. notification_events (catalog) ──────────────────────────
  if (!(await knex.schema.hasTable('notification_events'))) {
    await knex.schema.createTable('notification_events', (t) => {
      t.string('event_key', 120).primary();
      t.string('entity_type', 60).notNullable();
      t.string('action', 60).notNullable();
      t.string('label', 160).notNullable();
      t.text('description').nullable();
      t.boolean('default_enabled').notNullable().defaultTo(false);
      t.boolean('is_active').notNullable().defaultTo(true);
      t.bigInteger('created_by_user_id').unsigned().nullable();
      t.bigInteger('updated_by_user_id').unsigned().nullable();
      t.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
      t.dateTime('updated_at').notNullable()
        .defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));

      t.unique(['entity_type', 'action'], 'uq_notif_events_type_action');
      t.index(['is_active'], 'idx_notif_events_active');
    });
  }

  // ── 2. notification_templates ─────────────────────────────────
  // Body HTML stays in JS modules under services/notification-service/
  // src/templates/. This table holds metadata + subject only so admins can
  // toggle a template active/inactive without a code push.
  if (!(await knex.schema.hasTable('notification_templates'))) {
    await knex.schema.createTable('notification_templates', (t) => {
      t.string('template_key', 120).primary();
      t.enum('channel', ['email', 'in_app', 'both'], {
        useNative: false,
        enumName: null,
      }).notNullable().defaultTo('email');
      t.string('subject', 240).notNullable();
      t.string('body_key', 120).notNullable();
      t.text('description').nullable();
      t.boolean('is_active').notNullable().defaultTo(true);
      t.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
      t.dateTime('updated_at').notNullable()
        .defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));

      t.index(['is_active'], 'idx_notif_templates_active');
    });
  }

  // ── 3. notification_subscriptions (admin-authored rules) ──────
  if (!(await knex.schema.hasTable('notification_subscriptions'))) {
    await knex.schema.createTable('notification_subscriptions', (t) => {
      t.bigIncrements('id').primary();
      t.string('event_key', 120).notNullable();
      t.string('recipient_role', 40).nullable();
      // recipient_scope encodes WHICH users of `recipient_role` receive the
      // notification. Resolvers defined in spec §7 — keep as string (not
      // enum) so admins can add new resolvers without a migration.
      t.string('recipient_scope', 60).notNullable();
      t.enum('channel', ['email', 'in_app', 'both'], {
        useNative: false,
        enumName: null,
      }).notNullable().defaultTo('email');
      t.string('template_key', 120).notNullable();
      t.tinyint('priority').notNullable().defaultTo(100);
      t.boolean('is_active').notNullable().defaultTo(true);
      // Throttle stubbed — Phase 2. Default 0 = dispatch immediately.
      t.integer('throttle_window_sec').unsigned().notNullable().defaultTo(0);
      t.json('metadata').nullable();
      t.bigInteger('created_by_user_id').unsigned().nullable();
      t.bigInteger('updated_by_user_id').unsigned().nullable();
      t.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
      t.dateTime('updated_at').notNullable()
        .defaultTo(knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));

      t.foreign('event_key')
        .references('event_key').inTable('notification_events')
        .onDelete('CASCADE');
      t.foreign('template_key')
        .references('template_key').inTable('notification_templates')
        .onDelete('RESTRICT');

      t.index(['event_key', 'is_active'], 'idx_notif_subs_event_active');
      t.index(['recipient_role'], 'idx_notif_subs_role');
      t.index(['template_key'], 'idx_notif_subs_template');
    });
  }

  // ── 4. Extend notification_outbox with wizard columns ─────────
  // The D-05 migration created the outbox. This feature adds three columns
  // that let the dispatcher trace outbox rows back to the subscription that
  // produced them, and carry the channel explicitly for multi-channel fan-out.
  if (await knex.schema.hasTable('notification_outbox')) {
    if (!(await knex.schema.hasColumn('notification_outbox', 'subscription_id'))) {
      await knex.schema.alterTable('notification_outbox', (t) => {
        t.bigInteger('subscription_id').unsigned().nullable();
      });
    }
    if (!(await knex.schema.hasColumn('notification_outbox', 'channel'))) {
      await knex.schema.alterTable('notification_outbox', (t) => {
        t.enum('channel', ['email', 'in_app'], {
          useNative: false,
          enumName: null,
        }).notNullable().defaultTo('email');
      });
    }
    if (!(await knex.schema.hasColumn('notification_outbox', 'recipient_user_id'))) {
      await knex.schema.alterTable('notification_outbox', (t) => {
        t.bigInteger('recipient_user_id').unsigned().nullable();
      });
    }

    const idxRows = await knex.raw(
      "SHOW INDEX FROM notification_outbox WHERE Key_name = 'idx_outbox_subscription'"
    );
    if (!idxRows[0] || idxRows[0].length === 0) {
      await knex.schema.alterTable('notification_outbox', (t) => {
        t.index(['subscription_id'], 'idx_outbox_subscription');
      });
    }
  }

  // ── 5. RBAC: notifications module + 6 actions + default grants ─
  const NOTIFICATIONS_MODULE = {
    code: 'notifications',
    name: 'Notification Wizard',
    category: 'admin',
    sort_order: 36,
  };

  const NEW_ACTIONS = [
    { code: 'read',       name: 'Read notification events / subscriptions', sort_order: 1 },
    { code: 'create',     name: 'Create a subscription',                   sort_order: 2 },
    { code: 'update',     name: 'Update a subscription',                   sort_order: 3 },
    { code: 'delete',     name: 'Delete a subscription',                   sort_order: 4 },
    { code: 'send_test',  name: 'Send a test notification',                sort_order: 5 },
    { code: 'toggle',     name: 'Activate / deactivate a subscription',    sort_order: 6 },
  ];

  let mod = await knex('rbac_modules').where('code', NOTIFICATIONS_MODULE.code).first();
  if (!mod) {
    const [id] = await knex('rbac_modules').insert(NOTIFICATIONS_MODULE);
    mod = { id, ...NOTIFICATIONS_MODULE };
  }

  const actionMap = {};
  for (const act of NEW_ACTIONS) {
    let row = await knex('rbac_actions').where('code', act.code).first();
    if (!row) {
      const [id] = await knex('rbac_actions').insert(act);
      row = { id, ...act };
    }
    actionMap[act.code] = row.id;
  }

  // Default grants per D-20260417-01 Q4:
  //   SYSTEM_ADMIN / RBM_ADMIN — full (all 6 actions)
  //   ME_OFFICER               — read-only
  //   others                   — nothing unless explicitly granted
  const ROLE_GRANTS = {
    SYSTEM_ADMIN: {
      read: 'all', create: 'all', update: 'all',
      delete: 'all', send_test: 'all', toggle: 'all',
    },
    RBM_ADMIN: {
      read: 'all', create: 'all', update: 'all',
      delete: 'all', send_test: 'all', toggle: 'all',
    },
    ME_OFFICER: {
      read: 'all',
    },
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
  const mod = await knex('rbac_modules').where('code', 'notifications').first();
  if (mod) {
    await knex('rbac_permissions').where('module_id', mod.id).del();
    await knex('rbac_modules').where('id', mod.id).del();
  }

  // Only delete the 6 actions introduced here; shared action codes (read /
  // create / update / delete) are used by other modules, so we scope by
  // checking if any permission still references them.
  const customActionCodes = ['send_test', 'toggle'];
  for (const code of customActionCodes) {
    const row = await knex('rbac_actions').where('code', code).first();
    if (!row) continue;
    const inUse = await knex('rbac_permissions').where('action_id', row.id).first();
    if (!inUse) {
      await knex('rbac_actions').where('id', row.id).del();
    }
  }

  // ── Reverse notification_outbox columns ───────────────────────
  if (await knex.schema.hasTable('notification_outbox')) {
    const idxRows = await knex.raw(
      "SHOW INDEX FROM notification_outbox WHERE Key_name = 'idx_outbox_subscription'"
    );
    if (idxRows[0] && idxRows[0].length) {
      await knex.schema.alterTable('notification_outbox', (t) => {
        t.dropIndex(['subscription_id'], 'idx_outbox_subscription');
      });
    }
    for (const col of ['recipient_user_id', 'channel', 'subscription_id']) {
      if (await knex.schema.hasColumn('notification_outbox', col)) {
        await knex.schema.alterTable('notification_outbox', (t) => t.dropColumn(col));
      }
    }
  }

  // ── Drop tables (order: subs → templates + events) ────────────
  if (await knex.schema.hasTable('notification_subscriptions')) {
    await knex.schema.dropTable('notification_subscriptions');
  }
  if (await knex.schema.hasTable('notification_templates')) {
    await knex.schema.dropTable('notification_templates');
  }
  if (await knex.schema.hasTable('notification_events')) {
    await knex.schema.dropTable('notification_events');
  }
};
