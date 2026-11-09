/**
 * Add focal_user_id to plan_nodes — the per-activity focal person
 * (a STAFF user of the activity's responsible division). Nullable, no
 * backfill: enforced only at submission going forward.
 * Spec: docs/superpowers/specs/2026-07-21-activity-focal-person-design.md
 */
exports.up = async function (knex) {
  const has = await knex.schema.hasColumn('plan_nodes', 'focal_user_id');
  if (!has) {
    await knex.schema.alterTable('plan_nodes', (t) => {
      t.integer('focal_user_id').unsigned().nullable()
        .references('id').inTable('users').onDelete('SET NULL');
      t.index(['focal_user_id'], 'idx_plan_nodes_focal_user');
    });
  }
};

exports.down = async function (knex) {
  const has = await knex.schema.hasColumn('plan_nodes', 'focal_user_id');
  if (has) {
    await knex.schema.alterTable('plan_nodes', (t) => {
      t.dropForeign(['focal_user_id']);
      t.dropIndex(['focal_user_id'], 'idx_plan_nodes_focal_user');
      t.dropColumn('focal_user_id');
    });
  }
};
