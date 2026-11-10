/**
 * Specific Activity approval workflow (decided 2026-04-08).
 *
 * Focal persons can create SPECIFIC_ACTIVITY rows, but every creation goes
 * through the head of division of the responsible division before becoming
 * visible in the live workplan / Gantt / reporting views.
 *
 * Lifecycle stored in the existing `status` column (rather than a parallel
 * `approval_status` column) so there is a single source of truth:
 *
 *     DRAFT  →  IN_REVIEW  →  APPROVED
 *                          ↘  REJECTED  →  (back to) DRAFT
 *
 * This migration:
 *   1. Widens `plan_nodes.status` enum to include `IN_REVIEW` + `REJECTED`.
 *   2. Adds the audit columns needed to know who created / submitted /
 *      reviewed a row and why something was rejected.
 *
 * Existing rows stay `APPROVED` (they pre-date the workflow — they were
 * seeded by the RBM import pipeline, not by focal persons).
 *
 * Idempotent: re-runs only add what's missing. `down` first rewrites any
 * `IN_REVIEW` / `REJECTED` rows back to `DRAFT` so the enum can be shrunk
 * without MySQL tripping on "Data truncated".
 */

exports.up = async function (knex) {
  if (!(await knex.schema.hasTable('plan_nodes'))) return;

  // ── 1. Widen the status enum ─────────────────────────────────
  // Knex doesn't expose a first-class "alter enum" helper for MySQL, so we
  // issue raw SQL. MODIFY COLUMN is safe to re-run — the new definition
  // simply replaces the old one.
  //
  // CANCELLED is part of the focal-person workflow: a focal can withdraw an
  // IN_REVIEW or APPROVED spec they own. Cancelled rows stay in the table
  // for history but are hidden from the public list (same filter as DRAFT /
  // IN_REVIEW / REJECTED).
  await knex.raw(`
    ALTER TABLE plan_nodes
      MODIFY COLUMN status
        ENUM('DRAFT','IN_REVIEW','APPROVED','REJECTED','CANCELLED','IN_EXECUTION','CLOSED','ARCHIVED')
        DEFAULT 'APPROVED'
  `);

  // ── 2. Add audit columns (guarded by hasColumn) ──────────────
  const cols = await knex('information_schema.columns')
    .select('column_name')
    .where({ table_schema: knex.client.database(), table_name: 'plan_nodes' });
  const have = new Set(cols.map(c => c.column_name || c.COLUMN_NAME));

  await knex.schema.alterTable('plan_nodes', (t) => {
    if (!have.has('created_by_user_id')) {
      t.integer('created_by_user_id').unsigned().nullable()
        .references('id').inTable('users').onDelete('SET NULL')
        .after('is_active');
    }
    if (!have.has('submitted_at')) {
      t.timestamp('submitted_at').nullable().after('created_by_user_id');
    }
    if (!have.has('reviewed_by_user_id')) {
      t.integer('reviewed_by_user_id').unsigned().nullable()
        .references('id').inTable('users').onDelete('SET NULL')
        .after('submitted_at');
    }
    if (!have.has('reviewed_at')) {
      t.timestamp('reviewed_at').nullable().after('reviewed_by_user_id');
    }
    if (!have.has('rejection_reason')) {
      t.text('rejection_reason').nullable().after('reviewed_at');
    }
  });

  // ── 3. Indexes to keep the HOD review queue + "my drafts" queries fast
  try {
    await knex.schema.alterTable('plan_nodes', (t) => {
      t.index('created_by_user_id', 'idx_plan_nodes_created_by');
    });
  } catch (e) { /* re-run: index already exists */ }

  try {
    await knex.schema.alterTable('plan_nodes', (t) => {
      t.index(['status', 'node_type'], 'idx_plan_nodes_status_type');
    });
  } catch (e) { /* re-run: index already exists */ }
};

exports.down = async function (knex) {
  if (!(await knex.schema.hasTable('plan_nodes'))) return;

  // Defuse the enum shrink: any row sitting in one of the doomed values
  // must be rewritten first, otherwise MySQL refuses the ALTER with
  // "Data truncated for column 'status'".
  await knex('plan_nodes')
    .whereIn('status', ['IN_REVIEW', 'REJECTED', 'CANCELLED'])
    .update({ status: 'DRAFT' });

  // Drop indexes first so the ALTER MODIFY doesn't have to re-validate them.
  try {
    await knex.schema.alterTable('plan_nodes', (t) => {
      t.dropIndex(['status', 'node_type'], 'idx_plan_nodes_status_type');
    });
  } catch (e) { /* best effort */ }

  try {
    await knex.schema.alterTable('plan_nodes', (t) => {
      t.dropIndex('created_by_user_id', 'idx_plan_nodes_created_by');
    });
  } catch (e) { /* best effort */ }

  // Drop the audit columns (in reverse order of creation).
  await knex.schema.alterTable('plan_nodes', (t) => {
    t.dropColumn('rejection_reason');
    t.dropColumn('reviewed_at');
    t.dropColumn('reviewed_by_user_id');
    t.dropColumn('submitted_at');
    t.dropColumn('created_by_user_id');
  });

  // Restore the original enum.
  await knex.raw(`
    ALTER TABLE plan_nodes
      MODIFY COLUMN status
        ENUM('DRAFT','APPROVED','IN_EXECUTION','CLOSED','ARCHIVED')
        DEFAULT 'APPROVED'
  `);
};
