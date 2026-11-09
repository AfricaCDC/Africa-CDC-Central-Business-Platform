/**
 * @module approvalHistoryService
 *
 * Read-only query for the contributor approval chain history endpoint
 * (`GET /api/governance/workflows/:entityType/:entityId/history`).
 *
 * Split out from `contributorWorkflowEngine.js` so the engine stays under the
 * 400-line services cap. The engine is stateful and owns transactional logic;
 * this module is pure read-access.
 */

const db = require('../config/db');

/**
 * Load every approval_instance (and its steps) for an entity, newest round first.
 *
 * @param {string} entityType
 * @param {number} entityId
 * @returns {Promise<{instances: Array<object & {steps: Array<object>}>}>}
 * @example
 *   const history = await getApprovalHistoryForEntity('activity_report', 42);
 *   // → { instances: [{ id: 9, round: 2, steps: [...] }, { id: 5, round: 1, steps: [...] }] }
 */
async function getApprovalHistoryForEntity(entityType, entityId) {
  const instances = await db('approval_instances')
    .where({ entity_type: entityType, entity_id: entityId })
    .orderBy([{ column: 'round', order: 'desc' }, { column: 'id', order: 'desc' }]);
  if (!instances.length) return { instances: [] };

  const ids = instances.map((i) => i.id);
  const steps = await db('approval_steps')
    .whereIn('approval_instance_id', ids)
    .orderBy(['approval_instance_id', 'step_order']);

  const stepsByInstance = steps.reduce((acc, s) => {
    (acc[s.approval_instance_id] ||= []).push(s);
    return acc;
  }, {});

  return {
    instances: instances.map((i) => ({ ...i, steps: stepsByInstance[i.id] || [] })),
  };
}

module.exports = { getApprovalHistoryForEntity };
