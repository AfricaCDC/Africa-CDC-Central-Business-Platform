/**
 * Extend rbac_permissions.scope ENUM with 'directorate'.
 *
 * Scope hierarchy: own < division < directorate < all
 * 'directorate' covers the user's home directorate plus every child
 * division reachable via parent_code. Resolved by divisionAliasService.
 */

exports.up = async function up(knex) {
  await knex.schema.raw(
    "ALTER TABLE rbac_permissions MODIFY COLUMN scope ENUM('own','division','directorate','all') NOT NULL DEFAULT 'own'"
  );
};

exports.down = async function down(knex) {
  // Rollback: downgrade any 'directorate' rows to 'division' first, then
  // shrink the ENUM back to its 3-value form.
  await knex('rbac_permissions').where('scope', 'directorate').update({ scope: 'division' });
  await knex.schema.raw(
    "ALTER TABLE rbac_permissions MODIFY COLUMN scope ENUM('own','division','all') NOT NULL DEFAULT 'own'"
  );
};
