/**
 * @module contributorWorkflowEngine
 *
 * Contributor-chain workflow runtime for the D-20260415-05 feature.
 *
 * Extends (never duplicates) the default `workflowEngine.js`. Only triggered
 * when a submission comes from a CONTRIB division/directorate and the entity
 * therefore needs the 3-step cross-division chain:
 *
 *   Step 1  Contributor HOD/Director   (scope=CONTRIB_DIVISION)
 *   Step 2  MAIN owning HOD/Director   (scope=MAIN_DIVISION)
 *   Step 3  M&E Officer / Admin        (scope=GLOBAL)
 *
 * Divergences from the default engine:
 *   1. Loads the CONTRIBUTOR_CHAIN template variant (not DEFAULT).
 *   2. When an approver cannot be resolved, the engine does NOT throw.
 *      Instead the step is persisted with decision=BLOCKED_NO_APPROVER
 *      and approver_id=null; the instance stays IN_REVIEW. M&E officers
 *      are notified so an admin-bypass can resolve the block.
 *   3. On resubmission of a previously-rejected instance, `round`
 *      increments (spec §7.5) so the inbox can distinguish attempts.
 *   4. Admin-bypass mutates the current blocked/pending step with
 *      decision=APPROVED + admin_bypass=true and advances the instance
 *      (and optionally all remaining steps on bypassAll=true).
 *
 * Allowlisted in `.claude/hooks/forbidden-patterns.allow` because this
 * file IS the state-transition source of truth and imports STATUSES via
 * CommonJS require (the hook regex expects ESM `from`).
 */

const db = require('../config/db');
const { audit } = require('../middleware/auditLog');
const { STATUSES, APPROVAL_STEP_DECISIONS } = require('@rbm/lib/enums');
const { createLogger } = require('@rbm/lib/logger');
const { getActiveTemplateForEntity } = require('./workflowTemplateService');
// SINGLE SOURCE OF TRUTH: this file is the CONTRIBUTOR_CHAIN variant of the same
// approval engine as workflowEngine.js. The entity→status mapping is owned by
// workflowEngine.ENTITY_MAP and imported here so the two can never drift
// (cleaning Phase 1.2). The decision path (decideWorkflowStep) also lives in
// workflowEngine and is shared — there is ONE decision engine.
const { ENTITY_MAP } = require('./workflowEngine');
const { resolveHolderUpChain } = require('./divisionAliasService');
const { isPoolRole, resolveMeOfficer } = require('./approverPool');

const logger = createLogger('contrib-workflow-engine');

// Step-decision values come from the shared single source of truth
// (APPROVAL_STEP_DECISIONS, cleaning Phase 2.2). `.BLOCKED` is kept as a local
// alias for BLOCKED_NO_APPROVER so the many call-sites below stay terse.
// eslint-disable-next-line cdc-rbm/no-inline-status-map -- local terse alias; every value derives from APPROVAL_STEP_DECISIONS (the canonical map).
const STEP_DECISION = Object.freeze({
  PENDING:   APPROVAL_STEP_DECISIONS.PENDING,
  APPROVED:  APPROVAL_STEP_DECISIONS.APPROVED,
  REJECTED:  APPROVAL_STEP_DECISIONS.REJECTED,
  BLOCKED:   APPROVAL_STEP_DECISIONS.BLOCKED_NO_APPROVER,
  CANCELLED: APPROVAL_STEP_DECISIONS.CANCELLED,
});

// eslint-disable-next-line cdc-rbm/no-inline-status-map -- symbolic aliases for approval_instances.status values sourced from STATUSES (D-20260415-16).
const INSTANCE_STATUS = Object.freeze({
  IN_REVIEW: STATUSES.IN_REVIEW,
  APPROVED: STATUSES.APPROVED,
  REJECTED: STATUSES.REJECTED,
});

/**
 * Resolve the concrete user for a contributor-chain step.
 *
 *   CONTRIB_DIVISION  -> nearest `responsible_user_id` at or above
 *                         contribOrgCode (level_type=division -> HOD,
 *                         directorate -> Director; a division without a
 *                         head escalates to its directorate's director).
 *   MAIN_DIVISION     -> same rule from mainOrgCode.
 *   GLOBAL            -> first ACTIVE user holding roleCode.
 *
 * Returns `null` when no approver can be resolved — caller inserts a
 * blocked step and notifies M&E.
 *
 * @param {string} roleCode
 * @param {string} scope
 * @param {{ contribOrgCode?: string, mainOrgCode?: string }} ctx
 * @returns {Promise<number|null>}
 */
async function resolveContribApprover(roleCode, scope, ctx) {
  const code = scope === 'CONTRIB_DIVISION' ? ctx.contribOrgCode
    : scope === 'MAIN_DIVISION'             ? ctx.mainOrgCode
    : null;

  // M&E sign-off: the main unit's M&E officer, else the pool (D-20261015-07).
  if (isPoolRole(roleCode)) return resolveMeOfficer(db, ctx.mainOrgCode || ctx.contribOrgCode);

  if (code) {
    return resolveHolderUpChain(db, code, 'responsible_user_id');
  }

  if (scope === 'GLOBAL') {
    const u = await db('user_roles')
      .join('roles', 'roles.id', 'user_roles.role_id')
      .join('users', 'user_roles.user_id', 'users.id')
      .where('roles.code', roleCode)
      .where('users.status', 'ACTIVE')
      .select('users.id')
      .orderBy('users.id')
      .first();
    return u?.id || null;
  }

  return null;
}

/**
 * Start a contributor-chain workflow for an entity submission.
 *
 * @param {object} params
 * @param {('ACTIVITY_REPORT'|'INDICATOR_ACTUAL'|'DIVISION_ACTIVITY_REPORT')} params.entityType
 * @param {number} params.entityId
 * @param {number} params.submittedById
 * @param {string} params.contribOrgCode — contributor division/directorate code
 * @param {string} params.mainOrgCode    — owning (MAIN) division code
 * @param {import('express').Request} [params.req] — for audit logging
 * @returns {Promise<{instance: object, steps: object[], blockedSteps: object[]}>}
 * @throws {Error} TEMPLATE_NOT_FOUND, ENTITY_NOT_FOUND, UNKNOWN_ENTITY_TYPE
 *
 * @example
 * await startContributorWorkflow({
 *   entityType: 'ACTIVITY_REPORT', entityId: 42,
 *   submittedById: 7, contribOrgCode: 'DIV-FETP', mainOrgCode: 'DIV-WEH', req,
 * });
 */
async function startContributorWorkflow({
  entityType, entityId, submittedById, contribOrgCode, mainOrgCode, req,
}) {
  const template = await getActiveTemplateForEntity(entityType, 'CONTRIBUTOR_CHAIN');
  if (!template || !template.steps.length) {
    const err = new Error(`No CONTRIBUTOR_CHAIN template for ${entityType}`);
    err.code = 'TEMPLATE_NOT_FOUND';
    throw err;
  }
  const cfg = ENTITY_MAP[entityType];
  if (!cfg) {
    const err = new Error(`Unknown entity type: ${entityType}`);
    err.code = 'UNKNOWN_ENTITY_TYPE';
    throw err;
  }
  const entity = await db(cfg.table).where('id', entityId).first();
  if (!entity) {
    const err = new Error(`Entity ${entityType} #${entityId} not found`);
    err.code = 'ENTITY_NOT_FOUND';
    throw err;
  }

  const priorRejected = await db('approval_instances')
    .where({ entity_type: entityType, entity_id: entityId, is_contrib_flow: true, status: INSTANCE_STATUS.REJECTED })
    .orderBy('id', 'desc')
    .first();
  const nextRound = priorRejected ? ((priorRejected.round || 1) + 1) : 1;

  const ctx = { contribOrgCode, mainOrgCode };

  return db.transaction(async (trx) => {
    // Supersede any lingering pending/blocked steps from prior instances of
    // the same (entity_type, entity_id). This handles resubmits after a
    // reject, and also cleans up stale instances that were created by an
    // earlier code path (e.g. before a --watch reload). Without this, the
    // next approver sees "no pending step" because the freshly-created
    // instance shadows — but does not replace — the old ones.
    const priorInstanceIds = await trx('approval_instances')
      .where({ entity_type: entityType, entity_id: entityId })
      .whereNot('status', INSTANCE_STATUS.APPROVED)
      .pluck('id');
    if (priorInstanceIds.length) {
      await trx('approval_steps')
        .whereIn('approval_instance_id', priorInstanceIds)
        .whereIn('decision', [STEP_DECISION.PENDING, STEP_DECISION.BLOCKED])
        .update({ decision: STEP_DECISION.CANCELLED, completed_date: trx.fn.now() });
      await trx('approval_instances')
        .whereIn('id', priorInstanceIds)
        .whereNot('status', INSTANCE_STATUS.REJECTED)
        .update({ status: INSTANCE_STATUS.REJECTED, updated_at: trx.fn.now() });
    }

    const [instanceId] = await trx('approval_instances').insert(
      _buildInstanceRow({ entityType, entityId, submittedById, template, contribOrgCode, mainOrgCode, nextRound, trx })
    );

    const { insertedSteps, blockedSteps } = await _buildStepRows({ template, ctx, instanceId, nextRound });
    if (insertedSteps.length) await trx('approval_steps').insert(insertedSteps);

    await trx(cfg.table).where('id', entityId).update(
      _buildEntityOnSubmitUpdate({ cfg, entityType, submittedById, trx })
    );

    await _auditStarted({
      req, entityType, entityId, template, contribOrgCode, mainOrgCode, nextRound, blockedSteps, submittedById,
    });

    const instance = await trx('approval_instances').where('id', instanceId).first();
    const steps = await trx('approval_steps').where('approval_instance_id', instanceId).orderBy('step_order');

    if (blockedSteps.length) {
      // Notifications for the blocked case are delivered through the outbox
      // by feature-notification-wizard (#24, event key activity_report.contrib_blocked_no_approver).
      logger.warn({ instanceId, blockedSteps: blockedSteps.length, entityType, entityId },
        'contributor workflow started with blocked step(s)');
    }

    return { instance, steps, blockedSteps };
  });
}

/** @private */
function _buildInstanceRow({ entityType, entityId, submittedById, template, contribOrgCode, mainOrgCode, nextRound, trx }) {
  return {
    entity_type: entityType,
    entity_id: entityId,
    status: INSTANCE_STATUS.IN_REVIEW,
    initiated_by_id: submittedById,
    initiated_date: trx.fn.now(),
    workflow_template_id: template.id,
    division_code: contribOrgCode || null,
    submitted_by_id: submittedById,
    is_contrib_flow: true,
    contrib_org_code: contribOrgCode || null,
    main_org_code: mainOrgCode || null,
    round: nextRound,
  };
}

/** @private */
async function _buildStepRows({ template, ctx, instanceId, nextRound }) {
  const insertedSteps = [];
  const blockedSteps = [];
  for (const tmpl of template.steps) {
    const approverId = await resolveContribApprover(tmpl.role_code, tmpl.scope, ctx);
    const isBlocked = approverId === null && tmpl.is_required && !isPoolRole(tmpl.role_code);
    const row = {
      approval_instance_id: instanceId,
      step_order: tmpl.step_order,
      step_label: tmpl.step_label,
      role_code: tmpl.role_code,
      scope: tmpl.scope,
      approver_id: approverId,
      decision: isBlocked ? STEP_DECISION.BLOCKED : STEP_DECISION.PENDING,
      round: nextRound,
      admin_bypass: false,
    };
    insertedSteps.push(row);
    if (isBlocked) blockedSteps.push(row);
  }
  return { insertedSteps, blockedSteps };
}

/** @private */
function _buildEntityOnSubmitUpdate({ cfg, entityType, submittedById, trx }) {
  const entityUpdate = { [cfg.col]: cfg.onSubmit, updated_at: trx.fn.now(), submitted_at: trx.fn.now() };
  if (entityType === 'INDICATOR_ACTUAL') entityUpdate.submitted_by = submittedById;
  return entityUpdate;
}

/** @private */
async function _auditStarted({
  req, entityType, entityId, template, contribOrgCode, mainOrgCode, nextRound, blockedSteps, submittedById,
}) {
  if (!req) return;
  await audit(req, 'WORKFLOW_STARTED', entityType, entityId, {
    template_id: template.id,
    template_variant: 'CONTRIBUTOR_CHAIN',
    contrib_org_code: contribOrgCode,
    main_org_code: mainOrgCode,
    round: nextRound,
    blocked_steps: blockedSteps.map((s) => s.step_order),
  }, submittedById);

  for (const bs of blockedSteps) {
    await audit(req, 'WORKFLOW_STEP_BLOCKED_NO_APPROVER', entityType, entityId, {
      step_order: bs.step_order,
      step_label: bs.step_label,
      role_code: bs.role_code,
      scope: bs.scope,
      contrib_org_code: contribOrgCode,
      main_org_code: mainOrgCode,
    }, submittedById);
  }
}

/**
 * Admin / M&E bypass: force-approve the current blocked-or-pending step
 * (or ALL remaining steps when bypassAll=true).
 *
 * @param {object} params
 * @param {number} params.instanceId
 * @param {number} params.adminUserId
 * @param {string} params.comments — mandatory justification
 * @param {boolean} [params.bypassAll=false]
 * @param {import('express').Request} [params.req]
 * @returns {Promise<{instance: object, steps: object[], isComplete: boolean}>}
 * @throws {Error} INSTANCE_NOT_FOUND, INVALID_STATE, NO_BYPASSABLE_STEP, UNKNOWN_ENTITY_TYPE
 *
 * @example
 * await adminBypassInstance({ instanceId: 7, adminUserId: 1, comments: 'HOD absent', bypassAll: true, req });
 */
async function adminBypassInstance({ instanceId, adminUserId, comments, bypassAll = false, req }) {
  const instance = await db('approval_instances').where('id', instanceId).first();
  if (!instance) {
    const err = new Error('Approval instance not found');
    err.code = 'INSTANCE_NOT_FOUND';
    throw err;
  }
  if (instance.status !== INSTANCE_STATUS.IN_REVIEW) {
    const err = new Error(`Instance status is ${instance.status}; only IN_REVIEW can be bypassed`);
    err.code = 'INVALID_STATE';
    throw err;
  }
  const cfg = ENTITY_MAP[instance.entity_type];
  if (!cfg) {
    const err = new Error(`Unknown entity type: ${instance.entity_type}`);
    err.code = 'UNKNOWN_ENTITY_TYPE';
    throw err;
  }

  return db.transaction(async (trx) => {
    const candidateSteps = await trx('approval_steps')
      .where('approval_instance_id', instanceId)
      .whereIn('decision', [STEP_DECISION.PENDING, STEP_DECISION.BLOCKED])
      .orderBy('step_order');

    if (!candidateSteps.length) {
      const err = new Error('No pending or blocked step to bypass');
      err.code = 'NO_BYPASSABLE_STEP';
      throw err;
    }

    const toBypass = bypassAll ? candidateSteps : [candidateSteps[0]];
    for (const s of toBypass) {
      await _bypassStep({ trx, step: s, adminUserId, comments, bypassAll, req, instance });
    }

    const isComplete = await _hasNoRemainingSteps(trx, instanceId);
    if (isComplete) await _finalizeInstance({ trx, cfg, instance, adminUserId });

    const updatedInstance = await trx('approval_instances').where('id', instanceId).first();
    const steps = await trx('approval_steps').where('approval_instance_id', instanceId).orderBy('step_order');
    return { instance: updatedInstance, steps, isComplete };
  });
}

/** @private */
async function _bypassStep({ trx, step, adminUserId, comments, bypassAll, req, instance }) {
  await trx('approval_steps').where('id', step.id).update({
    decision: STEP_DECISION.APPROVED,
    admin_bypass: true,
    approver_id: step.approver_id || adminUserId,
    comments,
    completed_date: trx.fn.now(),
  });

  if (!req) return;
  const wasBlocked = step.decision === STEP_DECISION.BLOCKED;
  const auditAction = wasBlocked ? 'WORKFLOW_STEP_UNBLOCKED_BY_MNE' : 'WORKFLOW_ADMIN_BYPASS';
  await audit(req, auditAction, instance.entity_type, instance.entity_id, {
    step_id: step.id,
    step_order: step.step_order,
    step_label: step.step_label,
    comments,
    bypass_all: bypassAll,
  }, adminUserId);
}

/** @private */
async function _hasNoRemainingSteps(trx, instanceId) {
  const remaining = await trx('approval_steps')
    .where('approval_instance_id', instanceId)
    .whereIn('decision', [STEP_DECISION.PENDING, STEP_DECISION.BLOCKED])
    .count({ c: '*' }).first();
  return Number(remaining.c) === 0;
}

/** @private */
async function _finalizeInstance({ trx, cfg, instance, adminUserId }) {
  await trx('approval_instances').where('id', instance.id).update({ status: INSTANCE_STATUS.APPROVED });
  await trx(cfg.table).where('id', instance.entity_id).update(_buildEntityOnApproveUpdate({ cfg, adminUserId, trx }));
}

/** @private */
function _buildEntityOnApproveUpdate({ cfg, adminUserId, trx }) {
  const base = { [cfg.col]: cfg.onApprove, updated_at: trx.fn.now() };
  if (cfg.table === 'indicator_actuals') return { ...base, validated_by: adminUserId, validated_at: trx.fn.now() };
  if (cfg.table === 'division_activity_reports') return { ...base, reviewed_by: adminUserId, reviewed_at: trx.fn.now(), rejection_reason: null };
  if (cfg.table === 'activity_reports') return { ...base, approved_by: adminUserId, approved_at: trx.fn.now(), rejection_reason: null };
  return base;
}

module.exports = {
  startContributorWorkflow,
  adminBypassInstance,
  resolveContribApprover,
};
