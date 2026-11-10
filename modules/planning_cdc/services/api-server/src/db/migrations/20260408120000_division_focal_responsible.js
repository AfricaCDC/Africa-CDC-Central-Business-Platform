/**
 * Division-centric focal / responsible model (decided 2026-04-08).
 *
 * Replaces the user-centric `user_divisions` junction with two direct
 * pointers on `division_codes`:
 *
 *   - focal_user_id        → the focal person who can submit specific
 *                            activities for this division
 *   - responsible_user_id  → the head of division (or whoever signs off);
 *                            this is the user who approves / rejects
 *                            submissions in this division's review queue
 *
 * Both nullable: a division can exist without anyone assigned (Lenny will
 * fill them in from the org page).
 *
 * Backfill: every existing `user_divisions` row is promoted to its
 * matching column on `division_codes`. If multiple users were focal for
 * the same division (which shouldn't happen now that we're 1:1, but the
 * legacy junction allowed it), the lowest user_id wins — Lenny can
 * re-assign by hand from the org page.
 *
 * The `user_divisions` table is left in place to avoid breaking unrelated
 * code that may still read it. A follow-up migration can drop it once
 * we've confirmed no consumer remains.
 *
 * Idempotent.
 */

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('division_codes'))) return;
  if (!(await knex.schema.hasTable('users'))) return;

  const cols = await knex('information_schema.columns')
    .select('column_name')
    .where({ table_schema: knex.client.database(), table_name: 'division_codes' });
  const have = new Set(cols.map((c) => c.column_name || c.COLUMN_NAME));

  await knex.schema.alterTable('division_codes', (t) => {
    if (!have.has('focal_user_id')) {
      t.integer('focal_user_id').unsigned().nullable()
        .references('id').inTable('users').onDelete('SET NULL')
        .after('directorate');
    }
    if (!have.has('responsible_user_id')) {
      t.integer('responsible_user_id').unsigned().nullable()
        .references('id').inTable('users').onDelete('SET NULL')
        .after('focal_user_id');
    }
  });

  // Two indexes for the reverse lookups ("which divisions is this user
  // focal/responsible for?"). Wrapped in try/catch in case re-runs hit an
  // existing index.
  try {
    await knex.schema.alterTable('division_codes', (t) => {
      t.index('focal_user_id', 'idx_div_focal_user');
    });
  } catch (e) { /* re-run */ }
  try {
    await knex.schema.alterTable('division_codes', (t) => {
      t.index('responsible_user_id', 'idx_div_responsible_user');
    });
  } catch (e) { /* re-run */ }

  // ── Backfill from user_divisions (if it still exists) ─────
  if (await knex.schema.hasTable('user_divisions')) {
    const focalRows = await knex('user_divisions')
      .where('role', 'FOCAL_PERSON')
      .orderBy('user_id', 'asc')
      .select('user_id', 'division_code');
    // Group by division_code, keep lowest user_id
    const focalByDiv = new Map();
    for (const r of focalRows) {
      if (!focalByDiv.has(r.division_code)) focalByDiv.set(r.division_code, r.user_id);
    }
    for (const [divCode, userId] of focalByDiv.entries()) {
      await knex('division_codes')
        .where('code', divCode)
        .whereNull('focal_user_id')
        .update({ focal_user_id: userId });
    }

    const respRows = await knex('user_divisions')
      .where('role', 'HEAD_OF_DIVISION')
      .orderBy('user_id', 'asc')
      .select('user_id', 'division_code');
    const respByDiv = new Map();
    for (const r of respRows) {
      if (!respByDiv.has(r.division_code)) respByDiv.set(r.division_code, r.user_id);
    }
    for (const [divCode, userId] of respByDiv.entries()) {
      await knex('division_codes')
        .where('code', divCode)
        .whereNull('responsible_user_id')
        .update({ responsible_user_id: userId });
    }
  }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('division_codes'))) return;

  try {
    await knex.schema.alterTable('division_codes', (t) => {
      t.dropIndex('responsible_user_id', 'idx_div_responsible_user');
    });
  } catch (e) { /* best effort */ }
  try {
    await knex.schema.alterTable('division_codes', (t) => {
      t.dropIndex('focal_user_id', 'idx_div_focal_user');
    });
  } catch (e) { /* best effort */ }

  await knex.schema.alterTable('division_codes', (t) => {
    t.dropColumn('responsible_user_id');
    t.dropColumn('focal_user_id');
  });
};
