/* eslint-disable max-lines, complexity, max-params, no-restricted-syntax, no-unused-vars --
 * Legacy workflowEngine (415L, pre-guardrails). Debt catalog:
 *   - max-lines (415 > 400, just over) — shrink when engine is split
 *     alongside the contributor approval chain feature.
 *   - 3 complexity hits (resolveApprover / startWorkflow arrow /
 *     decideWorkflowStep arrow) — intentional multi-branch state machines.
 *   - max-params on decideWorkflowStep (5) — planned to take an options
 *     object in the same split.
 *   - 2 P-31 hits (`'DIVISION'` / `'GLOBAL'` literals) — these are step
 *     SCOPE enum values on approval_step_templates.scope, NOT ENTITY_TYPES
 *     references (different enum space; allowlisted with reason).
 *   - no-unused-vars on `cancelledById` — signature preserved for the
 *     planned audit wiring in D-20260415-16/17.
 * This commit fixes F-002 (production bug in resolveApprover) ONLY — do
 * NOT grow the file or add new violations. Cheap wins (P-04 status literal
 * migration, 13 hits) are deliberately deferred to the engine split so
 * this bug fix lands as a minimal surgical diff.
 */

/**
 * @module workflowEngine
 *
 * Runtime engine for dynamic approval workflows. When a user submits an
 * entity, the engine:
 *   1. Looks up the active template for that entity_type
 *   2. Resolves the concrete approver for each step (role + scope → user)
 *   3. Creates an approval_instance with pre-populated approval_steps
 *   4. Updates the entity status to IN_REVIEW / SUBMITTED
 *
 * When an approver decides (approve/reject):
 *   - APPROVED on last step → entity becomes APPROVED / VALIDATED
 *   - REJECTED on any step  → entity returns to DRAFT / REJECTED
 */

const db = require('../config/db');
const { getActiveTemplateForEntity } = require('./workflowTemplateService');
const { audit } = require('../middleware/auditLog');
const { APPROVAL_STEP_DECISIONS, ORG_LEVEL_TYPES } = require('@rbm/lib/enums');
const { ROLES } = require('@rbm/lib/roles');
const { resolveHolderUpChain } = require('./divisionAliasService');
const { DIVISION_ASSIGNMENT_ROLES } = require('@rbm/lib/user-divisions');
const { isPoolRole, resolveMeOfficer } = require('./approverPool');
const workflowNotify = require('./workflowNotify');

// ── Entity status mapping ─────────────────────────────────────
// Each entity type maps to: table, status column, what status to
// set on submission, final approval, and rejection.
const ENTITY_MAP = {
  INDICATOR_ACTUAL: {
    table: 'indicator_actuals', col: 'status',
    onSubmit: 'SUBMITTED', onApprove: 'VALIDATED', onReject: 'REJECTED',
  },
  DIVISION_ACTIVITY_REPORT: {
    table: 'division_activity_reports', col: 'status',
    onSubmit: 'SUBMITTED', onApprove: 'APPROVED', onReject: 'REJECTED',
  },
  ACTIVITY_REPORT: {
    table: 'activity_reports', col: 'status',
    onSubmit: 'SUBMITTED', onApprove: 'APPROVED', onReject: 'REJECTED',
  },
  // PLAN_NODE (specific activities) re-wired through the engine — supersedes
  // D-20260530-02 per D-20260817-02 ("TOUJOURS BRANCHER"): every approval
  // flow is template-driven. The decision spreads below already carry the
  // plan_nodes reviewed_by/rejection_reason stamps.
  PLAN_NODE: {
    table: 'plan_nodes', col: 'status',
    onSubmit: 'IN_REVIEW', onApprove: 'APPROVED', onReject: 'REJECTED',
  },
  INDICATOR_DIVISION_REPORT: {
    table: 'indicator_division_reports', col: 'status',
    onSubmit: 'IN_REVIEW', onApprove: 'APPROVED', onReject: 'REJECTED',
  },
};

// ── Approver resolver ─────────────────────────────────────────

/**
 * Resolve divisionCode to its canonical counterpart when it is an alias.
 * If the requested division has alias_of set, the assigned focal /
 * responsible / m_and_e lives on the canonical row — chase it once.
 * (The chain is flat by construction; aliases never point at other
 * aliases, see 20260407150000_add_division_alias_of.js.)
 */
async function resolveCanonicalDivision(divisionCode) {
  if (!divisionCode) return null;
  const row = await db('division_codes')
    .where('code', divisionCode)
    .select('code', 'alias_of')
    .first();
  if (!row) return null;
  return row.alias_of || row.code;
}

/**
 * Resolve the concrete user_id for a step based on role + scope + division.
 *
 * DIVISION scope (D-20261009-03, shared with notifications):
 *   HEAD_OF_DIVISION → nearest division_codes.responsible_user_id at or
 *                      above the division (a unit → its division head, a
 *                      division without head → its directorate's director)
 *   DIRECTOR         → responsible_user_id of the directorate ancestor
 *   ME_OFFICER       → nearest m_and_e_user_id up the chain, in every scope;
 *                      nobody → null = pool of M&E officers (D-20261015-07)
 *   FOCAL_PERSON     → first FOCAL_PERSON row of user_divisions (on canonical)
 *   Other            → first user with that role in user_roles
 *
 * Alias-aware: if divisionCode is an alias, the lookup targets its
 * canonical division, because assignments only ever live on canonical
 * rows (aliases inherit via @rbm/lib/user-divisions at read time).
 *
 * GLOBAL scope:
 *   First active user with that role (ordered by id).
 *
 * @param {string} roleCode
 * @param {string} scope - 'DIVISION' | 'GLOBAL'
 * @param {string|null} divisionCode
 * @returns {Promise<number|null>}
 */
async function resolveApprover(roleCode, scope, divisionCode, entityId) {
  // CONTRIB_DIVISION: resolve approver for the contributor's division (= divisionCode)
  // MAIN_DIVISION: resolve approver for the MAIN division (from the entity's plan_node)
  let targetDiv = divisionCode;
  if (scope === 'MAIN_DIVISION' && entityId) {
    const report = await db('indicator_division_reports').where('id', entityId).select('plan_node_id').first();
    if (report) {
      const node = await db('plan_nodes').where('id', report.plan_node_id).select('responsible_division_code').first();
      targetDiv = node?.responsible_division_code || divisionCode;
    }
  }

  if ((scope === 'DIVISION' || scope === 'CONTRIB_DIVISION' || scope === 'MAIN_DIVISION') && targetDiv) {
    if (roleCode === ROLES.HEAD_OF_DIVISION) {
      return resolveHolderUpChain(db, targetDiv, 'responsible_user_id');
    }
    if (roleCode === ROLES.DIRECTOR) {
      return resolveHolderUpChain(db, targetDiv, 'responsible_user_id', { minLevel: ORG_LEVEL_TYPES.DIRECTORATE });
    }
    if (roleCode === ROLES.FOCAL_PERSON) {
      const canonical = await resolveCanonicalDivision(targetDiv);
      if (!canonical) return null;
      const focal = await db('user_divisions')
        .where({ division_code: canonical, role: DIVISION_ASSIGNMENT_ROLES.FOCAL_PERSON })
        .orderBy('id').select('user_id').first();
      return focal ? Number(focal.user_id) : null;
    }
  }

  // M&E sign-off: the unit's M&E officer, whatever the step scope, else the
  // pool (null): any M&E officer decides (D-20261015-07).
  if (isPoolRole(roleCode)) return resolveMeOfficer(db, targetDiv);

  // GLOBAL or fallback: first active user with this role.
  // NOTE: `user_roles` has `role_id` (FK → roles.id), not a string `role` column.
  // Must join through `roles` to resolve the code. (F-002)
  const userRole = await db('user_roles')
    .join('roles', 'roles.id', 'user_roles.role_id')
    .join('users', 'user_roles.user_id', 'users.id')
    .where('roles.code', roleCode)
    .where('users.status', 'ACTIVE')
    .select('users.id')
    .orderBy('users.id')
    .first();
  return userRole?.id || null;
}

// ── Start workflow ────────────────────────────────────────────

/**
 * Start a workflow for an entity submission.
 *
 * @param {object} params
 * @param {string} params.entityType - key from ENTITY_MAP
 * @param {number} params.entityId
 * @param {number} params.submittedById
 * @param {string|null} params.divisionCode
 * @param {import('express').Request} [params.req] - for audit logging
 * @returns {Promise<{instance: object, steps: object[]}>}
 * @throws {Error} TEMPLATE_NOT_FOUND, APPROVER_NOT_RESOLVED, ENTITY_NOT_FOUND
 */
async function startWorkflow({ entityType, entityId, submittedById, divisionCode, req }) {
  const template = await getActiveTemplateForEntity(entityType);
  if (!template || !template.steps.length) {
    const err = new Error(`No active workflow template found for entity type: ${entityType}`);
    err.code = 'TEMPLATE_NOT_FOUND';
    throw err;
  }

  const entityCfg = ENTITY_MAP[entityType];
  if (!entityCfg) {
    const err = new Error(`Unknown entity type: ${entityType}`);
    err.code = 'UNKNOWN_ENTITY_TYPE';
    throw err;
  }

  // Verify entity exists
  const entity = await db(entityCfg.table).where('id', entityId).first();
  if (!entity) {
    const err = new Error(`Entity ${entityType} #${entityId} not found`);
    err.code = 'ENTITY_NOT_FOUND';
    throw err;
  }

  const started = await db.transaction(async (trx) => {
    // 0. Supersede any leftover pending steps from prior non-APPROVED
    //    instances of the same (entity_type, entity_id). This keeps the
    //    approver inbox accurate across resubmits and avoids two live
    //    instances shadowing each other.
    const priorInstanceIds = await trx('approval_instances')
      .where({ entity_type: entityType, entity_id: entityId })
      .whereNot('status', 'APPROVED')
      .pluck('id');
    if (priorInstanceIds.length) {
      await trx('approval_steps')
        .whereIn('approval_instance_id', priorInstanceIds)
        .where('decision', APPROVAL_STEP_DECISIONS.PENDING)
        .update({ decision: APPROVAL_STEP_DECISIONS.CANCELLED, completed_date: trx.fn.now() });
      await trx('approval_instances')
        .whereIn('id', priorInstanceIds)
        .whereNot('status', 'REJECTED')
        .update({ status: 'REJECTED' });
    }

    // 1. Create approval_instance
    const [instanceId] = await trx('approval_instances').insert({
      entity_type: entityType,
      entity_id: entityId,
      status: 'IN_REVIEW',
      initiated_by_id: submittedById,
      initiated_date: trx.fn.now(),
      workflow_template_id: template.id,
      division_code: divisionCode || null,
      submitted_by_id: submittedById,
    });

    // 2. Resolve approvers and create steps
    const stepRows = [];
    for (const tmplStep of template.steps) {
      const approverId = await resolveApprover(tmplStep.role_code, tmplStep.scope, divisionCode, entityId);
      if (!approverId && tmplStep.is_required && !isPoolRole(tmplStep.role_code)) {
        // Rollback will happen automatically
        const err = new Error(
          `Cannot resolve approver for step "${tmplStep.step_label}" ` +
          `(role: ${tmplStep.role_code}, scope: ${tmplStep.scope}` +
          `${divisionCode ? `, division: ${divisionCode}` : ''}). ` +
          `Please assign a ${tmplStep.role_code === 'HEAD_OF_DIVISION' ? 'Responsible Person' : tmplStep.role_code} ` +
          `${tmplStep.scope === 'DIVISION' ? 'for this division in Org Structure' : 'in Users & Roles'}.`
        );
        err.code = 'APPROVER_NOT_RESOLVED';
        throw err;
      }

      stepRows.push({
        approval_instance_id: instanceId,
        step_order: tmplStep.step_order,
        step_label: tmplStep.step_label,
        role_code: tmplStep.role_code,
        scope: tmplStep.scope,
        approver_id: approverId,
        decision: APPROVAL_STEP_DECISIONS.PENDING,
      });
    }

    if (stepRows.length) {
      await trx('approval_steps').insert(stepRows);
    }

    // 3. Update entity status to "submitted"
    const entityUpdate = { [entityCfg.col]: entityCfg.onSubmit, updated_at: trx.fn.now() };
    // For tables that have submitted_at / submitted_by
    if (entityType === 'INDICATOR_ACTUAL') {
      entityUpdate.submitted_by = submittedById;
      entityUpdate.submitted_at = trx.fn.now();
    } else if (entityType === 'DIVISION_ACTIVITY_REPORT' || entityType === 'ACTIVITY_REPORT') {
      entityUpdate.submitted_at = trx.fn.now();
    } else if (entityType === 'INDICATOR_DIVISION_REPORT') {
      entityUpdate.submitted_by = submittedById;
      entityUpdate.submitted_at = trx.fn.now();
    }
    await trx(entityCfg.table).where('id', entityId).update(entityUpdate);

    // 4. Audit
    if (req) {
      await audit(req, 'WORKFLOW_STARTED', entityType, entityId, {
        template_name: template.name,
        template_id: template.id,
        steps: stepRows.map((s) => ({ order: s.step_order, label: s.step_label, approver_id: s.approver_id })),
      }, submittedById);
    }

    const instance = await trx('approval_instances').where('id', instanceId).first();
    const steps = await trx('approval_steps').where('approval_instance_id', instanceId).orderBy('step_order');

    return { instance, steps };
  });
  // After commit: mail the approver (never throws).
  await workflowNotify.notifySubmitted({ entityType, entityId, submittedById, steps: started.steps });
  return started;
}

// ── Decide step ───────────────────────────────────────────────

/**
 * Record a decision on an approval step.
 *
 * @param {number} stepId
 * @param {string} decision - 'APPROVED' | 'REJECTED'
 * @param {string} [comments]
 * @param {number} decidedById
 * @param {import('express').Request} [req]
 * @returns {Promise<{step: object, instance: object, isComplete: boolean}>}
 */
async function decideWorkflowStep(stepId, decision, comments, decidedById, req) {
  const step = await db('approval_steps').where('id', stepId).first();
  if (!step) {
    const err = new Error('Approval step not found');
    err.code = 'STEP_NOT_FOUND';
    throw err;
  }
  if (step.decision !== APPROVAL_STEP_DECISIONS.PENDING) {
    const err = new Error('This step has already been decided');
    err.code = 'ALREADY_DECIDED';
    throw err;
  }

  const instance = await db('approval_instances').where('id', step.approval_instance_id).first();
  if (!instance) {
    const err = new Error('Approval instance not found');
    err.code = 'INSTANCE_NOT_FOUND';
    throw err;
  }

  // Authorisation is enforced at the route layer (governanceRoutes and
  // indicatorDivisionReportRoutes both gate on direct-assignment OR
  // rbac scope='all'). No secondary check here — that was previously
  // bouncing legitimate admin overrides with a spurious 500.

  const entityCfg = ENTITY_MAP[instance.entity_type];
  if (!entityCfg) {
    const err = new Error(`Unknown entity type: ${instance.entity_type}`);
    err.code = 'UNKNOWN_ENTITY_TYPE';
    throw err;
  }

  const decided = await db.transaction(async (trx) => {
    // Update the step
    await trx('approval_steps').where('id', stepId).update({
      decision,
      comments: comments || null,
      completed_date: trx.fn.now(),
      decided_by_id: decidedById || null, // differs from approver_id for a delegate or an escalation target
    });

    // Record every step decision in indicator_report_history
    if (instance.entity_type === 'INDICATOR_DIVISION_REPORT') {
      await trx('indicator_report_history').insert({
        report_id: instance.entity_id,
        action: decision,
        from_status: 'IN_REVIEW',
        to_status: decision === 'REJECTED' ? 'REJECTED' : 'IN_REVIEW',
        performed_by: decidedById,
        comment: `${step.step_label}${comments ? ': ' + comments : ''}`,
      });
    }

    let isComplete = false;

    if (decision === 'REJECTED') {
      // Reject: mark instance as REJECTED, revert entity status
      await trx('approval_instances').where('id', instance.id).update({
        status: 'REJECTED',
      });
      await trx(entityCfg.table).where('id', instance.entity_id).update({
        [entityCfg.col]: entityCfg.onReject,
        updated_at: trx.fn.now(),
        ...(entityCfg.table === 'indicator_actuals' ? { validated_by: null, validated_at: null } : {}),
        ...(entityCfg.table === 'division_activity_reports' ? { reviewed_by: decidedById, reviewed_at: trx.fn.now(), rejection_reason: comments || null } : {}),
        ...(entityCfg.table === 'activity_reports' ? { rejection_reason: comments || null } : {}),
        ...(entityCfg.table === 'plan_nodes' ? { reviewed_by_user_id: decidedById, reviewed_at: trx.fn.now(), rejection_reason: comments || null } : {}),
        ...(entityCfg.table === 'indicator_division_reports' ? { rejection_reason: comments || null } : {}),
      });

      isComplete = true;
    } else {
      // Approved: check if more steps remain. A BLOCKED_NO_APPROVER step is NOT
      // resolved — it must be counted as outstanding, otherwise approving the
      // last PENDING step would falsely complete an instance that still has a
      // blocked step awaiting admin bypass (cleaning bug WF-1).
      const pendingSteps = await trx('approval_steps')
        .where('approval_instance_id', instance.id)
        .whereIn('decision', [APPROVAL_STEP_DECISIONS.PENDING, APPROVAL_STEP_DECISIONS.BLOCKED_NO_APPROVER])
        .whereNot('id', stepId)
        .orderBy('step_order');

      if (pendingSteps.length === 0) {
        // Last step — mark instance APPROVED, update entity to final status
        await trx('approval_instances').where('id', instance.id).update({
          status: 'APPROVED',
        });
        await trx(entityCfg.table).where('id', instance.entity_id).update({
          [entityCfg.col]: entityCfg.onApprove,
          updated_at: trx.fn.now(),
          ...(entityCfg.table === 'indicator_actuals' ? { validated_by: decidedById, validated_at: trx.fn.now() } : {}),
          ...(entityCfg.table === 'division_activity_reports' ? { reviewed_by: decidedById, reviewed_at: trx.fn.now(), rejection_reason: null } : {}),
          ...(entityCfg.table === 'activity_reports' ? { approved_by: decidedById, approved_at: trx.fn.now(), rejection_reason: null } : {}),
          ...(entityCfg.table === 'plan_nodes' ? { reviewed_by_user_id: decidedById, reviewed_at: trx.fn.now(), rejection_reason: null } : {}),
          ...(entityCfg.table === 'indicator_division_reports' ? { approved_by: decidedById, approved_at: trx.fn.now(), rejection_reason: null } : {}),
        });

        // Final approve: update the history to_status to APPROVED
        if (instance.entity_type === 'INDICATOR_DIVISION_REPORT') {
          await trx('indicator_report_history')
            .where({ report_id: instance.entity_id, performed_by: decidedById })
            .orderBy('id', 'desc')
            .limit(1)
            .update({ to_status: entityCfg.onApprove });
        }

        isComplete = true;
      }
      // else: more steps remain, instance stays IN_REVIEW, next approver picks it up
    }

    // Audit
    if (req) {
      await audit(req, `WORKFLOW_STEP_${decision}`, instance.entity_type, instance.entity_id, {
        step_id: stepId,
        step_label: step.step_label,
        step_order: step.step_order,
        comments,
        is_complete: isComplete,
      });
    }

    const updatedStep = await trx('approval_steps').where('id', stepId).first();
    const updatedInstance = await trx('approval_instances').where('id', instance.id).first();

    return { step: updatedStep, instance: updatedInstance, isComplete };
  });
  // After commit: tell the submitter the final decision (never throws).
  if (decided.isComplete) {
    await workflowNotify.notifyDecided({ instance: decided.instance, decision, decidedById, comments });
  }
  return decided;
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Get the current pending step for an instance.
 *
 * @param {number} instanceId
 * @returns {Promise<object|null>}
 */
async function getCurrentPendingStep(instanceId) {
  return db('approval_steps')
    .where({ approval_instance_id: instanceId, decision: APPROVAL_STEP_DECISIONS.PENDING })
    .orderBy('step_order')
    .first() || null;
}

/**
 * Get the workflow instance + steps for an entity.
 *
 * @param {string} entityType
 * @param {number} entityId
 * @returns {Promise<{instance: object, steps: object[]}|null>}
 */
async function getWorkflowForEntity(entityType, entityId) {
  const instance = await db('approval_instances')
    .where({ entity_type: entityType, entity_id: entityId })
    .orderBy('id', 'desc')
    .first();
  if (!instance) return null;
  const steps = await db('approval_steps')
    .leftJoin('users', 'approval_steps.approver_id', 'users.id')
    .where('approval_instance_id', instance.id)
    .select('approval_steps.*', 'users.full_name as approver_name', 'users.email as approver_email')
    .orderBy('step_order');
  return { instance, steps };
}

/**
 * Cancel an in-flight workflow.
 *
 * @param {number} instanceId
 * @param {number} cancelledById
 * @returns {Promise<object>}
 */
async function cancelWorkflow(instanceId, cancelledById) {
  const instance = await db('approval_instances').where('id', instanceId).first();
  if (!instance) {
    const err = new Error('Workflow not found');
    err.code = 'INSTANCE_NOT_FOUND';
    throw err;
  }
  if (instance.status !== 'IN_REVIEW') {
    const err = new Error('Only IN_REVIEW workflows can be cancelled');
    err.code = 'INVALID_STATE';
    throw err;
  }

  await db.transaction(async (trx) => {
    await trx('approval_instances').where('id', instanceId).update({ status: 'CANCELLED' });
    await trx('approval_steps')
      .where('approval_instance_id', instanceId)
      .whereIn('decision', [APPROVAL_STEP_DECISIONS.PENDING, APPROVAL_STEP_DECISIONS.BLOCKED_NO_APPROVER])
      .update({ decision: APPROVAL_STEP_DECISIONS.CANCELLED });

    const entityCfg = ENTITY_MAP[instance.entity_type];
    if (entityCfg) {
      await trx(entityCfg.table).where('id', instance.entity_id).update({
        [entityCfg.col]: 'DRAFT',
        updated_at: trx.fn.now(),
      });
    }
  });

  return db('approval_instances').where('id', instanceId).first();
}

module.exports = {
  ENTITY_MAP,
  startWorkflow,
  decideWorkflowStep,
  getCurrentPendingStep,
  getWorkflowForEntity,
  cancelWorkflow,
  resolveApprover,
};
