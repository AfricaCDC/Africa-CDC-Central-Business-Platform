/**
 * One-shot migration that syncs legacy `indicator_reports` rows into the
 * contributor-chain model (`indicator_division_reports` + workflow engine).
 *
 * Every legacy row gets a mirror. If the role can be resolved (division is
 * either the OWNER of the indicator, listed as a CONTRIB on the indicator,
 * OR owns/contributes to a Specific Activity linked to that indicator),
 * the mirror also gets a workflow instance that reflects the legacy
 * status:
 *
 *   - DRAFT     -> mirror only, no instance
 *   - SUBMITTED -> instance IN_REVIEW, steps PENDING
 *   - VALIDATED -> instance APPROVED, all steps APPROVED (historical)
 *   - REJECTED  -> instance REJECTED, step 1 REJECTED, the rest CANCELLED
 *
 * Orphans (rows whose division has no OWNER/CONTRIB relationship to the
 * indicator) are skipped: they cannot be routed through a workflow and
 * stay in the legacy table for archival lookup.
 */

'use strict';

const OWNER = 'OWNER';
const CONTRIB = 'CONTRIB';

function parseContribs(raw) {
  if (!raw) return [];
  try {
    const a = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(a) ? a.map((c) => String(c).toUpperCase()) : [];
  } catch {
    return [];
  }
}

async function resolveRole(knex, node, divCode) {
  const own = String(node?.responsible_division_code || '').toUpperCase();
  const me = String(divCode || '').toUpperCase();
  if (!me) return null;
  if (own === me) return OWNER;
  const contribs = parseContribs(node?.contributing_divisions);
  if (contribs.includes(me)) return CONTRIB;
  const sas = await knex('plan_nodes')
    .where({ node_type: 'SPECIFIC_ACTIVITY', linked_indicator_id: node.id })
    .select('responsible_division_code', 'contributing_divisions');
  for (const sa of sas) {
    if (String(sa.responsible_division_code || '').toUpperCase() === me) return CONTRIB;
    if (parseContribs(sa.contributing_divisions).includes(me)) return CONTRIB;
  }
  return null;
}

/**
 * Prefer OWNER when the submitter is focal (FOCAL_PERSON) in the owner
 * division of the indicator. Without this, a user who happens to be
 * primary on a CONTRIB division but also focal on the OWNER would end
 * up routed through the 3-step contributor chain even though they had
 * the simpler OWNER path available. Returns the best (divisionCode,
 * role) pair or null if nothing maps.
 */
async function bestDivisionForUser(knex, node, legacyDivCode, userId) {
  const legacyRole = await resolveRole(knex, node, legacyDivCode);
  if (legacyRole === OWNER || !userId) return legacyRole ? { divCode: legacyDivCode, role: legacyRole } : null;

  const ownerCode = String(node?.responsible_division_code || '').toUpperCase();
  if (ownerCode) {
    const isFocalOnOwner = await knex('user_divisions')
      .where({ user_id: userId, division_code: ownerCode, role: 'FOCAL_PERSON' })
      .first();
    if (isFocalOnOwner) return { divCode: ownerCode, role: OWNER };
  }
  return legacyRole ? { divCode: legacyDivCode, role: legacyRole } : null;
}

async function startWorkflowForReport(knex, reportId, row, divCode) {
  const node = await knex('plan_nodes').where('id', row.plan_node_id).first();
  const role = await resolveRole(knex, node, divCode);
  if (!role) return null;
  const variant = role === CONTRIB ? 'CONTRIBUTOR_CHAIN' : 'DEFAULT';
  const tpl = await knex('workflow_templates')
    .where({ entity_type: 'INDICATOR_DIVISION_REPORT', template_variant: variant, is_active: true })
    .first();
  if (!tpl) return null;
  const tplSteps = await knex('workflow_template_steps').where('template_id', tpl.id).orderBy('step_order');
  const status = row.status;
  const submittedAt = row.submitted_at || row.updated_at || new Date();
  const instStatus = status === 'VALIDATED' ? 'APPROVED' : (status === 'REJECTED' ? 'REJECTED' : 'IN_REVIEW');
  const [instId] = await knex('approval_instances').insert({
    entity_type: 'INDICATOR_DIVISION_REPORT',
    entity_id: reportId,
    status: instStatus,
    initiated_by_id: row.user_id || 1,
    initiated_date: submittedAt,
    workflow_template_id: tpl.id,
    division_code: divCode,
    submitted_by_id: row.user_id || 1,
    is_contrib_flow: role === CONTRIB ? 1 : 0,
    contrib_org_code: role === CONTRIB ? divCode : null,
    main_org_code: String(node.responsible_division_code || '').toUpperCase() || null,
    round: 1,
  });
  const stepInserts = tplSteps.map((ts) => {
    let decision = 'PENDING';
    let completed = null;
    if (status === 'VALIDATED') { decision = 'APPROVED'; completed = row.reviewed_at || submittedAt; }
    else if (status === 'REJECTED') {
      decision = ts.step_order === 1 ? 'REJECTED' : 'CANCELLED';
      completed = row.reviewed_at || submittedAt;
    }
    return {
      approval_instance_id: instId,
      step_order: ts.step_order,
      step_label: ts.step_label,
      role_code: ts.role_code,
      scope: ts.scope,
      approver_id: null,
      decision,
      completed_date: completed,
      round: 1,
      admin_bypass: false,
      comments: status !== 'SUBMITTED' ? 'Imported from legacy' : null,
    };
  });
  if (stepInserts.length) await knex('approval_steps').insert(stepInserts);
  return instId;
}

async function migrateRow(knex, row) {
  const divCode = String(row.responsible_division_code || '').toUpperCase();
  if (!divCode) return { skipped: 'no division code' };

  const existing = await knex('indicator_division_reports').where({
    plan_node_id: row.plan_node_id,
    division_code: divCode,
    quarter: row.quarter,
    fiscal_year: row.fiscal_year,
  }).first();
  if (existing) {
    // Heal legacy/mirror desync: if the legacy row says the user already
    // submitted but the mirror is still DRAFT with no workflow attached,
    // kick off the workflow so the report is not stuck as a ghost.
    const hasInstance = await knex('approval_instances')
      .where({ entity_type: 'INDICATOR_DIVISION_REPORT', entity_id: existing.id })
      .first();
    const legacyIsActive = row.status === 'SUBMITTED' || row.status === 'VALIDATED' || row.status === 'REJECTED';
    if (hasInstance || !legacyIsActive || existing.status !== 'DRAFT') {
      return { skipped: 'mirror exists (no heal needed)' };
    }
    // Promote mirror status + attach workflow historically. Fall through
    // to the workflow-instance creation below by overwriting `row`'s
    // effective target id/node.
    const targetStatus = row.status === 'VALIDATED' ? 'APPROVED' : (row.status === 'REJECTED' ? 'REJECTED' : 'IN_REVIEW');
    await knex('indicator_division_reports').where('id', existing.id).update({
      status: targetStatus,
      actual_value: existing.actual_value ?? row.actual_value,
      submitted_by: existing.submitted_by ?? row.user_id,
      submitted_at: existing.submitted_at || row.submitted_at || row.updated_at,
      updated_at: knex.fn.now(),
    });
    await knex('indicator_report_history').insert({
      report_id: existing.id,
      action: row.status === 'REJECTED' ? 'REJECTED' : 'SUBMITTED',
      from_status: 'DRAFT',
      to_status: targetStatus,
      performed_by: row.user_id || 1,
      performed_at: row.submitted_at || row.updated_at || new Date(),
      comment: 'Imported from legacy — healed orphan mirror',
    });
    return startWorkflowForReport(knex, existing.id, row, divCode)
      .then((instId) => ({ healed: existing.id, instance: instId }));
  }

  const node = await knex('plan_nodes').where('id', row.plan_node_id).first();
  if (!node) return { skipped: 'plan_node missing' };

  const picked = await bestDivisionForUser(knex, node, divCode, row.user_id);
  if (!picked) return { skipped: 'orphan (no OWNER/CONTRIB relationship)' };
  const role = picked.role;
  const effectiveDivCode = picked.divCode;

  // If we re-attributed, honour the chosen division for the mirror row.
  if (effectiveDivCode !== divCode) {
    const alreadyMirrored = await knex('indicator_division_reports').where({
      plan_node_id: row.plan_node_id,
      division_code: effectiveDivCode,
      quarter: row.quarter,
      fiscal_year: row.fiscal_year,
    }).first();
    if (alreadyMirrored) return { skipped: `re-attributed but mirror already exists for ${effectiveDivCode}` };
  }

  const status = row.status || 'DRAFT';
  const finalStatus = status === 'VALIDATED' ? 'APPROVED' : status;
  const submittedAt = row.submitted_at || (status !== 'DRAFT' ? row.updated_at : null);
  const submittedBy = status !== 'DRAFT' ? row.user_id : null;

  const [newId] = await knex('indicator_division_reports').insert({
    plan_node_id: row.plan_node_id,
    division_code: effectiveDivCode,
    quarter: row.quarter,
    fiscal_year: row.fiscal_year,
    role,
    status: finalStatus,
    actual_value: row.actual_value,
    narrative: row.narrative,
    challenges: row.challenges,
    recommendations: row.recommendations,
    evidence_url: row.evidence_url,
    disaggregations: row.disaggregations,
    reporting_date: row.reporting_date ? String(row.reporting_date).slice(0, 10) : null,
    rejection_reason: row.rejection_reason,
    submitted_by: submittedBy,
    submitted_at: submittedAt,
    approved_by: finalStatus === 'APPROVED' ? (row.reviewed_by || submittedBy) : null,
    approved_at: finalStatus === 'APPROVED' ? (row.reviewed_at || submittedAt) : null,
    created_by: row.user_id || 1,
    created_at: row.created_at || knex.fn.now(),
    updated_at: row.updated_at || knex.fn.now(),
  });

  const historyRows = [{
    report_id: newId, action: 'CREATED', from_status: null, to_status: 'DRAFT',
    performed_by: row.user_id || 1, performed_at: row.created_at || new Date(),
  }];
  if (status !== 'DRAFT') {
    historyRows.push({
      report_id: newId, action: 'SUBMITTED', from_status: 'DRAFT', to_status: 'IN_REVIEW',
      performed_by: row.user_id || 1, performed_at: submittedAt || new Date(),
    });
  }
  if (finalStatus === 'APPROVED') {
    historyRows.push({
      report_id: newId, action: 'APPROVED', from_status: 'IN_REVIEW', to_status: 'APPROVED',
      performed_by: row.reviewed_by || row.user_id || 1,
      performed_at: row.reviewed_at || submittedAt || new Date(),
      comment: 'Imported from legacy — historical approval',
    });
  } else if (status === 'REJECTED') {
    historyRows.push({
      report_id: newId, action: 'REJECTED', from_status: 'IN_REVIEW', to_status: 'REJECTED',
      performed_by: row.reviewed_by || row.user_id || 1,
      performed_at: row.reviewed_at || submittedAt || new Date(),
      comment: row.rejection_reason || 'Imported from legacy — historical rejection',
    });
  }
  await knex('indicator_report_history').insert(historyRows);

  if (status === 'DRAFT') return { migrated: newId, role, instance: null };

  const instId = await startWorkflowForReport(knex, newId, row, effectiveDivCode);
  return { migrated: newId, role, instance: instId, reattributed: effectiveDivCode !== divCode };
}

async function ensureHistoryTableExists(knex) {
  const has = await knex.schema.hasTable('indicator_report_history');
  if (has) return true;
  // Staging drift safety net — the table should have been created by
  // 20260418200000 but some environments have it missing. Recreate it
  // idempotently so this healing migration can backfill without crashing.
  await knex.schema.createTable('indicator_report_history', (t) => {
    t.increments('id').primary();
    t.integer('report_id').unsigned().notNullable()
      .references('id').inTable('indicator_division_reports').onDelete('CASCADE');
    t.enum('action', ['CREATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RESUBMITTED']).notNullable();
    t.string('from_status', 20).nullable();
    t.string('to_status', 20).notNullable();
    t.integer('performed_by').unsigned().nullable().references('id').inTable('users');
    t.timestamp('performed_at').notNullable().defaultTo(knex.fn.now());
    t.text('comment').nullable();
    t.index(['report_id'], 'idx_irh_report');
  });
  return true;
}

exports.up = async function up(knex) {
  // Belt and suspenders — ensure both tables the healer writes into exist
  // even on environments that skipped 20260418200000 for any reason.
  const hasReports = await knex.schema.hasTable('indicator_division_reports');
  if (!hasReports) {
    return; // Nothing we can safely do if the primary table is missing.
  }
  await ensureHistoryTableExists(knex);

  // Legacy table only exists on databases that predate the contributor-chain
  // model — fresh installs have nothing to migrate.
  if (!(await knex.schema.hasTable('indicator_reports'))) return;

  const legacy = await knex('indicator_reports').orderBy('id');
  if (!legacy.length) return;

  const stats = { total: legacy.length, migrated: 0, healed: 0, skipped: 0, orphans: 0 };
  for (const row of legacy) {
    // eslint-disable-next-line no-await-in-loop -- sequential on purpose, dataset is small
    const result = await migrateRow(knex, row);
    if (result.migrated) stats.migrated += 1;
    else if (result.healed) stats.healed += 1;
    else if (String(result.skipped).includes('orphan')) stats.orphans += 1;
    else stats.skipped += 1;
  }
  // eslint-disable-next-line no-console
  console.log('[migrate-legacy-indicator-reports]', stats);
};

exports.down = async function down() {
  // Intentionally no-op. Rolling back this migration would delete
  // user-visible data (mirrored rows + history + approval instances).
  // If you ever need to revert, run a targeted SQL script after
  // reviewing downstream impact.
};
