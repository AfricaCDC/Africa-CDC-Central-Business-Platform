/**
 * Fix workflow templates for INDICATOR_DIVISION_REPORT.
 *
 * Two distinct workflows are needed:
 *
 *   - DEFAULT  (1 step) : when the OWNER division of the indicator
 *     (plan_nodes.responsible_division_code) submits its own quarterly
 *     report. Single step: M&E / Admin sign-off.
 *
 *   - CONTRIBUTOR_CHAIN (3 steps) : when a CONTRIBUTOR division submits
 *     (listed in plan_nodes.contributing_divisions OR owning a Specific
 *     Activity linked to that indicator). Steps: Contributor HOD → Owner
 *     HOD → M&E sign-off.
 *
 * Before this migration, only one template existed (id=6) carrying the
 * 3-step chain but mistakenly tagged template_variant='DEFAULT'. We fix
 * its variant to 'CONTRIBUTOR_CHAIN', tighten its wording, and create
 * the missing DEFAULT template.
 *
 * We also rename the role discriminator on indicator_division_reports
 * from 'MAIN' to 'OWNER' for clarity (DB column nomenclature is
 * historically misleading per project memory).
 */

'use strict';

const VARIANT_DEFAULT = 'DEFAULT';
const VARIANT_CONTRIB = 'CONTRIBUTOR_CHAIN';
const ENTITY = 'INDICATOR_DIVISION_REPORT';

exports.up = async function up(knex) {
  // 1. Fix the existing 3-step template (id may differ across envs — find by entity_type)
  const existing = await knex('workflow_templates')
    .where({ entity_type: ENTITY })
    .orderBy('id')
    .first();

  if (existing) {
    await knex('workflow_templates').where('id', existing.id).update({
      template_variant: VARIANT_CONTRIB,
      name: 'Indicator Quarterly Report — Contributor Division (3-step Chain)',
      description:
        'Triggered when a CONTRIBUTOR division submits its quarterly indicator report. ' +
        'A division is a contributor when it appears in the indicator\'s contributing_divisions ' +
        'list OR owns a Specific Activity linked to that indicator. ' +
        'Three steps: Contributor HOD/Director → Owner HOD/Director → M&E sign-off.',
      is_active: true,
      updated_at: knex.fn.now(),
    });

    // Refresh step labels for clarity
    await knex('workflow_template_steps')
      .where({ template_id: existing.id, step_order: 1 })
      .update({ step_label: 'Step 1 — Contributor Division HOD/Director Review', role_code: 'HEAD_OF_DIVISION', scope: 'CONTRIB_DIVISION', is_required: true });
    await knex('workflow_template_steps')
      .where({ template_id: existing.id, step_order: 2 })
      .update({ step_label: 'Step 2 — Owner Division HOD/Director Review', role_code: 'HEAD_OF_DIVISION', scope: 'MAIN_DIVISION', is_required: true });
    await knex('workflow_template_steps')
      .where({ template_id: existing.id, step_order: 3 })
      .update({ step_label: 'Step 3 — M&E / Admin Sign-off', role_code: 'ME_OFFICER', scope: 'GLOBAL', is_required: true });
  }

  // 2. Create the DEFAULT (owner) template if missing
  const defaultExists = await knex('workflow_templates')
    .where({ entity_type: ENTITY, template_variant: VARIANT_DEFAULT })
    .first();

  if (!defaultExists) {
    const [defaultId] = await knex('workflow_templates').insert({
      name: 'Indicator Quarterly Report — Owner Division (Direct M&E Sign-off)',
      entity_type: ENTITY,
      template_variant: VARIANT_DEFAULT,
      description:
        'Triggered when the OWNER division of the indicator (responsible_division_code) ' +
        'submits its own quarterly report. The submitting HOD has already authored the report, ' +
        'so a single step is required: M&E / Admin sign-off.',
      is_active: true,
    });

    await knex('workflow_template_steps').insert({
      template_id: defaultId,
      step_order: 1,
      step_label: 'M&E / Admin Sign-off',
      role_code: 'ME_OFFICER',
      scope: 'GLOBAL',
      is_required: true,
    });
  }

  // 3. Rename role 'MAIN' → 'OWNER' (ENUM widen → update → ENUM tighten)
  await knex.raw("ALTER TABLE indicator_division_reports MODIFY COLUMN role ENUM('MAIN','OWNER','CONTRIB') NOT NULL");
  await knex('indicator_division_reports').where({ role: 'MAIN' }).update({ role: 'OWNER' });
  await knex.raw("ALTER TABLE indicator_division_reports MODIFY COLUMN role ENUM('OWNER','CONTRIB') NOT NULL");
};

exports.down = async function down(knex) {
  // Revert the role rename
  await knex.raw("ALTER TABLE indicator_division_reports MODIFY COLUMN role ENUM('MAIN','OWNER','CONTRIB') NOT NULL");
  await knex('indicator_division_reports').where({ role: 'OWNER' }).update({ role: 'MAIN' });
  await knex.raw("ALTER TABLE indicator_division_reports MODIFY COLUMN role ENUM('MAIN','CONTRIB') NOT NULL");

  // Remove the DEFAULT template
  const def = await knex('workflow_templates')
    .where({ entity_type: ENTITY, template_variant: VARIANT_DEFAULT })
    .first();
  if (def) {
    await knex('workflow_template_steps').where({ template_id: def.id }).delete();
    await knex('workflow_templates').where({ id: def.id }).delete();
  }

  // Restore the original (mis-tagged) variant + naming on the contributor template
  const contrib = await knex('workflow_templates')
    .where({ entity_type: ENTITY, template_variant: VARIANT_CONTRIB })
    .first();
  if (contrib) {
    await knex('workflow_templates').where('id', contrib.id).update({
      template_variant: VARIANT_DEFAULT,
      name: 'Indicator Report — Contributor Chain',
      description: 'Triggered when a CONTRIB division reports on a T3/T4 indicator. Same 3-step chain as activity reports.',
    });
  }
};
