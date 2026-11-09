/**
 * @module workflowTemplateService
 *
 * CRUD for workflow_templates + workflow_template_steps.
 * Used by the admin UI at /admin/workflows.
 */

const db = require('../config/db');

/**
 * List all templates, optionally filtered. Each template includes its steps.
 *
 * @param {object} [filters]
 * @param {string} [filters.entity_type]
 * @param {boolean} [filters.is_active]
 * @returns {Promise<Array<object>>}
 */
async function listTemplates(filters = {}) {
  const q = db('workflow_templates').orderBy('name');
  if (filters.entity_type) q.where('entity_type', filters.entity_type);
  if (filters.is_active !== undefined) q.where('is_active', filters.is_active);
  const templates = await q;

  if (!templates.length) return [];
  const ids = templates.map((t) => t.id);
  const steps = await db('workflow_template_steps')
    .whereIn('template_id', ids)
    .orderBy(['template_id', 'step_order']);

  const stepsByTemplate = {};
  for (const s of steps) {
    if (!stepsByTemplate[s.template_id]) stepsByTemplate[s.template_id] = [];
    stepsByTemplate[s.template_id].push(s);
  }
  return templates.map((t) => ({ ...t, steps: stepsByTemplate[t.id] || [] }));
}

/**
 * Get a single template by ID with its steps.
 *
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function getTemplateById(id) {
  const template = await db('workflow_templates').where('id', id).first();
  if (!template) return null;
  template.steps = await db('workflow_template_steps')
    .where('template_id', id)
    .orderBy('step_order');
  return template;
}

/**
 * Create a new template (without steps — use replaceSteps after).
 *
 * @param {object} data
 * @returns {Promise<object>}
 */
/**
 * Deactivate every other active template sharing (entity_type, variant).
 * One active template per pair — the engine must never have to guess.
 */
async function deactivateSiblings(entityType, variant, exceptId = null) {
  const q = db('workflow_templates')
    .where({ entity_type: entityType, template_variant: variant, is_active: true });
  if (exceptId) q.whereNot('id', exceptId);
  await q.update({ is_active: false, updated_at: db.fn.now() });
}

async function createTemplate(data) {
  const variant = data.template_variant || 'DEFAULT';
  const isActive = data.is_active !== undefined ? data.is_active : true;
  if (isActive) await deactivateSiblings(data.entity_type, variant);
  const [id] = await db('workflow_templates').insert({
    name: data.name,
    entity_type: data.entity_type,
    template_variant: variant,
    description: data.description || null,
    is_active: isActive,
    created_by_id: data.created_by_id || null,
  });
  return getTemplateById(id);
}

/**
 * Update template metadata (not steps).
 *
 * @param {number} id
 * @param {object} data
 * @returns {Promise<object>}
 */
async function updateTemplate(id, data) {
  const update = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.entity_type !== undefined) update.entity_type = data.entity_type;
  if (data.description !== undefined) update.description = data.description;
  if (data.is_active !== undefined) update.is_active = data.is_active;
  update.updated_at = db.fn.now();
  // Activating this template deactivates the other active one of the same
  // (entity_type, template_variant) pair — one active template per pair.
  if (data.is_active === true) {
    const row = await db('workflow_templates').where('id', id)
      .first('entity_type', 'template_variant');
    if (row) {
      await deactivateSiblings(
        data.entity_type !== undefined ? data.entity_type : row.entity_type,
        row.template_variant,
        id,
      );
    }
  }
  await db('workflow_templates').where('id', id).update(update);
  return getTemplateById(id);
}

/**
 * Soft-delete a template (set is_active = false).
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
async function deleteTemplate(id) {
  await db('workflow_templates').where('id', id).update({ is_active: false, updated_at: db.fn.now() });
}

/**
 * Replace ALL steps for a template (delete existing + bulk insert).
 *
 * @param {number} templateId
 * @param {Array<{step_order: number, step_label: string, role_code: string, scope: string, is_required?: boolean}>} steps
 * @returns {Promise<Array<object>>}
 */
async function replaceSteps(templateId, steps) {
  await db.transaction(async (trx) => {
    await trx('workflow_template_steps').where('template_id', templateId).delete();
    if (steps.length) {
      await trx('workflow_template_steps').insert(
        steps.map((s, i) => ({
          template_id: templateId,
          step_order: s.step_order ?? i + 1,
          step_label: s.step_label,
          role_code: s.role_code,
          // eslint-disable-next-line no-restricted-syntax -- 'DIVISION' here is the step-scope column-enum default, not an ENTITY_TYPES reference (D-20260415-16).
          scope: s.scope || 'DIVISION',
          is_required: s.is_required !== undefined ? s.is_required : true,
        }))
      );
    }
    await trx('workflow_templates').where('id', templateId).update({ updated_at: trx.fn.now() });
  });
  return db('workflow_template_steps').where('template_id', templateId).orderBy('step_order');
}

/**
 * Find the active template for a given entity_type.
 *
 * @param {string} entityType
 * @param {string} [variant='DEFAULT'] - template_variant discriminator
 *   ('DEFAULT' for the standard flow, 'CONTRIBUTOR_CHAIN' for the 3-step
 *   cross-division chain seeded by 20260415300000_contributor_approval_chain.js).
 * @returns {Promise<object|null>}
 */
async function getActiveTemplateForEntity(entityType, variant = 'DEFAULT') {
  const template = await db('workflow_templates')
    .where({ entity_type: entityType, is_active: true, template_variant: variant })
    // Deterministic winner if data ever holds two active rows for the same
    // pair (newest wins) — the activation rule below prevents it going
    // forward, this is the safety net (D-20260817-02).
    .orderBy('id', 'desc')
    .first();
  if (!template) return null;
  template.steps = await db('workflow_template_steps')
    .where('template_id', template.id)
    .orderBy('step_order');
  return template;
}

module.exports = {
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  replaceSteps,
  getActiveTemplateForEntity,
};
