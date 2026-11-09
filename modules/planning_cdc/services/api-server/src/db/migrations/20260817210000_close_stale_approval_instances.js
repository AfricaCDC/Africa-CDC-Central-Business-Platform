/**
 * Close orphan approval instances + fix the stale contributor-chain label.
 *
 * Before D-20260817-02, several approve/reject endpoints bypassed the
 * workflow engine with direct SQL, leaving approval_instances forever
 * IN_REVIEW while their entity was already terminal. Now that decisions go
 * engine-first, close the historical strays so reviewer inboxes are clean.
 *
 * Also renames "… Contributor Division (1-step Chain)" → "(3-step Chain)"
 * — the DB template has always had 3 steps; the name lied.
 *
 * Data cleanup — down() is a no-op by design.
 * Spec: docs/superpowers/specs/2026-08-17-workflow-templates-master-design.md
 */

/* eslint-disable no-console -- migration progress notes, mirrors sibling migrations */

const TERMINAL = {
  ACTIVITY_REPORT: { table: 'activity_reports', done: ['APPROVED', 'REJECTED', 'NOT_APPLICABLE', 'CANCELLED'] },
  INDICATOR_ACTUAL: { table: 'indicator_actuals', done: ['VALIDATED', 'REJECTED'] },
  DIVISION_ACTIVITY_REPORT: { table: 'division_activity_reports', done: ['APPROVED', 'REJECTED'] },
  INDICATOR_DIVISION_REPORT: { table: 'indicator_division_reports', done: ['APPROVED', 'REJECTED'] },
  PLAN_NODE: { table: 'plan_nodes', done: ['APPROVED', 'REJECTED', 'CANCELLED'] },
};

exports.up = async function (knex) {
  // 1. Truthful label for the 3-step contributor chain.
  await knex('workflow_templates')
    .where('name', 'like', '%(1-step Chain)%')
    .update({ name: knex.raw("REPLACE(name, '(1-step Chain)', '(3-step Chain)')") });

  // 2. Close IN_REVIEW instances whose entity is already terminal (or gone).
  const open = await knex('approval_instances')
    .where('status', 'IN_REVIEW')
    .select('id', 'entity_type', 'entity_id');
  let closed = 0;
  for (const inst of open) {
    const cfg = TERMINAL[inst.entity_type];
    if (!cfg) continue;
    const row = await knex(cfg.table).where('id', inst.entity_id).first('status');
    if (!row || cfg.done.includes(row.status)) {
      await knex('approval_steps')
        .where('approval_instance_id', inst.id)
        .whereIn('decision', ['PENDING', 'BLOCKED_NO_APPROVER'])
        .update({ decision: 'CANCELLED', completed_date: knex.fn.now() });
      await knex('approval_instances').where('id', inst.id).update({ status: 'CANCELLED' });
      closed += 1;
    }
  }
  console.log(`[close_stale_approval_instances] closed ${closed} orphan instance(s) of ${open.length} open`);
};

exports.down = async function () {
  // Data cleanup — irreversible by design.
};
