/**
 * Backfill system RBAC role (`user_roles`) for every user who holds a
 * FOCAL_PERSON / HEAD_OF_DIVISION / DIRECTOR slot in `user_divisions` but
 * lacks the matching entry in `user_roles`. The two tables were drifting:
 * admin UI assigns a division-role, UI banner confirms focal status, but
 * the `/submit` endpoint checks `user_roles` (RBAC) and refuses. This
 * migration closes the gap for existing data. Going forward the
 * userDivisionRoutes.js POST/PUT handlers also auto-link (D-20260420-36).
 *
 * Safe to re-run: uses INSERT IGNORE on (user_id, role_id). Only adds —
 * never removes a role.
 */
'use strict';

const MAPPED_DIVISION_ROLES = Object.freeze([
  'FOCAL_PERSON',
  'HEAD_OF_DIVISION',
  'DIRECTOR',
]);

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('user_divisions'))) return;
  if (!(await knex.schema.hasTable('user_roles'))) return;
  if (!(await knex.schema.hasTable('roles'))) return;

  // Pair up each (user, user_divisions.role) with roles.id by matching code.
  const rows = await knex('user_divisions as ud')
    .join('roles as r', 'r.code', 'ud.role')
    .whereIn('ud.role', MAPPED_DIVISION_ROLES)
    .distinct('ud.user_id', 'r.id as role_id');

  if (!rows.length) return;

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => ({
      user_id: r.user_id,
      role_id: r.role_id,
    }));
    await knex.raw(
      `INSERT IGNORE INTO user_roles (user_id, role_id) VALUES ${chunk.map(() => '(?, ?)').join(', ')}`,
      chunk.flatMap((c) => [c.user_id, c.role_id]),
    );
  }
};

exports.down = async function down() {
  // No-op: we don't know which user_roles entries were created by this
  // migration vs. genuine admin assignments. Safer to leave them.
};
