/**
 * Extend rbac_permissions.scope ENUM with 'deny'.
 *
 * Admin-by-default semantics (task #32, D-20260416-09):
 *   - Missing permission row for an admin role = ALLOWED (scope='all')
 *     via rbacService.checkPermission short-circuit.
 *   - Explicit 'deny' scope ALWAYS wins during multi-role merge and
 *     overrides the admin short-circuit.
 *
 * Scope hierarchy (unchanged for allowed scopes):
 *     own < division < directorate < all
 * 'deny' is not part of the permissiveness ladder — it is an absolute
 * negation handled as a special case by the merge resolver.
 */

exports.up = async function up(knex) {
  await knex.schema.raw(
    "ALTER TABLE rbac_permissions MODIFY COLUMN scope ENUM('own','division','directorate','all','deny') NOT NULL DEFAULT 'own'"
  );
};

exports.down = async function down(knex) {
  // Rollback: upgrade any 'deny' rows back to 'own' (most restrictive allowed
  // scope) before shrinking the ENUM.
  await knex('rbac_permissions').where('scope', 'deny').update({ scope: 'own' });
  await knex.schema.raw(
    "ALTER TABLE rbac_permissions MODIFY COLUMN scope ENUM('own','division','directorate','all') NOT NULL DEFAULT 'own'"
  );
};
