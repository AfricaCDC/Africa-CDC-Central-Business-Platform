/**
 * Dynamic RBAC — Database Schema
 *
 * Creates three new tables for the permission matrix:
 *   rbac_modules      — system modules/pages (dashboard, workplan, pirs, …)
 *   rbac_actions       — possible actions (read, create, update, delete, approve, …)
 *   rbac_permissions   — the matrix: (role × module × action) → scope
 *
 * The existing `roles` and `user_roles` tables remain unchanged.
 * rbac_permissions.role_id references the existing roles.id.
 *
 * Scope values: 'own' | 'division' | 'all'
 *   own      = user's own records only
 *   division = records in user's division
 *   all      = unrestricted
 *
 * Deny-by-default: if no row exists for (role, module, action), permission is denied.
 */

exports.up = async function (knex) {
  // 1. rbac_modules
  if (!(await knex.schema.hasTable('rbac_modules'))) {
    await knex.schema.createTable('rbac_modules', (t) => {
      t.increments('id').unsigned().primary();
      t.string('code', 50).notNullable().unique();
      t.string('name', 100).notNullable();
      t.string('category', 50).nullable().comment('Nav grouping: planning, pirs, reporting, reference, admin, governance');
      t.text('description').nullable();
      t.integer('sort_order').unsigned().notNullable().defaultTo(0);
      t.boolean('is_active').notNullable().defaultTo(true);
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  // 2. rbac_actions
  if (!(await knex.schema.hasTable('rbac_actions'))) {
    await knex.schema.createTable('rbac_actions', (t) => {
      t.increments('id').unsigned().primary();
      t.string('code', 50).notNullable().unique();
      t.string('name', 100).notNullable();
      t.text('description').nullable();
      t.integer('sort_order').unsigned().notNullable().defaultTo(0);
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  // 3. rbac_permissions — the matrix
  if (!(await knex.schema.hasTable('rbac_permissions'))) {
    await knex.schema.createTable('rbac_permissions', (t) => {
      t.increments('id').unsigned().primary();
      t.integer('role_id').unsigned().notNullable()
        .references('id').inTable('roles').onDelete('CASCADE');
      t.integer('module_id').unsigned().notNullable()
        .references('id').inTable('rbac_modules').onDelete('CASCADE');
      t.integer('action_id').unsigned().notNullable()
        .references('id').inTable('rbac_actions').onDelete('CASCADE');
      t.enum('scope', ['own', 'division', 'all']).notNullable().defaultTo('own');
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());

      t.unique(['role_id', 'module_id', 'action_id']);
      t.index('role_id', 'idx_rbac_perm_role');
      t.index('module_id', 'idx_rbac_perm_module');
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('rbac_permissions');
  await knex.schema.dropTableIfExists('rbac_actions');
  await knex.schema.dropTableIfExists('rbac_modules');
};
