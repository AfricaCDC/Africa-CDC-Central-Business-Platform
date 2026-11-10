/**
 * Dynamic Workflow Templates (decided 2026-04-12).
 *
 * Adds admin-managed, multi-step approval workflows that replace the
 * hardcoded submit/approve/reject flows on reports and activities.
 *
 * New tables:
 *   - workflow_templates      → named template per entity type
 *   - workflow_template_steps → ordered steps, each with a required role + scope
 *
 * Extensions to existing tables:
 *   - approval_instances → FK to template + division context + submitter
 *   - approval_steps     → approver_id + role_code + scope + step_label
 *
 * The admin creates templates via /admin/workflows. When a user submits
 * an entity (indicator report, activity report, specific activity, etc.),
 * the workflow engine looks up the active template for that entity_type,
 * resolves the concrete approver for each step (based on role + scope),
 * and creates the approval_instance + approval_steps chain.
 *
 * Idempotent: every column/table guarded by hasTable/hasColumn.
 */

exports.up = async function (knex) {
  // ── 1. workflow_templates ───────────────────────────────────
  if (!(await knex.schema.hasTable('workflow_templates'))) {
    await knex.schema.createTable('workflow_templates', (t) => {
      t.increments('id').unsigned().primary();
      t.string('name', 200).notNullable().unique();
      t.string('entity_type', 50).notNullable().index();
      t.text('description').nullable();
      t.boolean('is_active').notNullable().defaultTo(true);
      t.integer('created_by_id').unsigned().nullable()
        .references('id').inTable('users').onDelete('SET NULL');
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  // ── 2. workflow_template_steps ──────────────────────────────
  if (!(await knex.schema.hasTable('workflow_template_steps'))) {
    await knex.schema.createTable('workflow_template_steps', (t) => {
      t.increments('id').unsigned().primary();
      t.integer('template_id').unsigned().notNullable()
        .references('id').inTable('workflow_templates').onDelete('CASCADE');
      t.integer('step_order').notNullable();
      t.string('step_label', 200).notNullable();
      t.string('role_code', 50).notNullable();
      t.enum('scope', ['DIVISION', 'GLOBAL']).notNullable().defaultTo('DIVISION');
      t.boolean('is_required').notNullable().defaultTo(true);
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
      t.unique(['template_id', 'step_order']);
      t.index('template_id');
    });
  }

  // ── 3. Extend approval_instances ────────────────────────────
  if (await knex.schema.hasTable('approval_instances')) {
    if (!(await knex.schema.hasColumn('approval_instances', 'workflow_template_id'))) {
      await knex.schema.alterTable('approval_instances', (t) => {
        t.integer('workflow_template_id').unsigned().nullable()
          .references('id').inTable('workflow_templates').onDelete('SET NULL');
      });
    }
    if (!(await knex.schema.hasColumn('approval_instances', 'division_code'))) {
      await knex.schema.alterTable('approval_instances', (t) => {
        t.string('division_code', 20).nullable();
      });
    }
    if (!(await knex.schema.hasColumn('approval_instances', 'submitted_by_id'))) {
      await knex.schema.alterTable('approval_instances', (t) => {
        t.integer('submitted_by_id').unsigned().nullable()
          .references('id').inTable('users').onDelete('SET NULL');
      });
    }
  }

  // ── 4. Extend approval_steps ────────────────────────────────
  if (await knex.schema.hasTable('approval_steps')) {
    if (!(await knex.schema.hasColumn('approval_steps', 'approver_id'))) {
      await knex.schema.alterTable('approval_steps', (t) => {
        t.integer('approver_id').unsigned().nullable()
          .references('id').inTable('users').onDelete('SET NULL');
      });
    }
    if (!(await knex.schema.hasColumn('approval_steps', 'role_code'))) {
      await knex.schema.alterTable('approval_steps', (t) => {
        t.string('role_code', 50).nullable();
      });
    }
    if (!(await knex.schema.hasColumn('approval_steps', 'scope'))) {
      await knex.schema.alterTable('approval_steps', (t) => {
        t.enum('scope', ['DIVISION', 'GLOBAL']).nullable();
      });
    }
    if (!(await knex.schema.hasColumn('approval_steps', 'step_label'))) {
      await knex.schema.alterTable('approval_steps', (t) => {
        t.string('step_label', 200).nullable();
      });
    }
  }

  // ── 5. Seed default templates ───────────────────────────────
  const existing = await knex('workflow_templates').count('id as cnt').first();
  if (parseInt(existing.cnt) === 0) {
    const templates = [
      {
        name: 'Indicator Report Approval',
        entity_type: 'INDICATOR_ACTUAL',
        description: 'Indicator actuals go through HOD then M&E validation.',
        steps: [
          { step_order: 1, step_label: 'Head of Division Review', role_code: 'HEAD_OF_DIVISION', scope: 'DIVISION' },
          { step_order: 2, step_label: 'M&E Validation', role_code: 'ME_OFFICER', scope: 'GLOBAL' },
        ],
      },
      {
        name: 'Division Activity Report Approval',
        entity_type: 'DIVISION_ACTIVITY_REPORT',
        description: 'Quarterly division reports approved by HOD then Admin.',
        steps: [
          { step_order: 1, step_label: 'Head of Division Approval', role_code: 'HEAD_OF_DIVISION', scope: 'DIVISION' },
          { step_order: 2, step_label: 'Admin Final Approval', role_code: 'RBM_ADMIN', scope: 'GLOBAL' },
        ],
      },
      {
        name: 'Activity Report Approval',
        entity_type: 'ACTIVITY_REPORT',
        description: 'Per-activity reports reviewed by the Head of Division.',
        steps: [
          { step_order: 1, step_label: 'Head of Division Review', role_code: 'HEAD_OF_DIVISION', scope: 'DIVISION' },
        ],
      },
      {
        name: 'Specific Activity Approval',
        entity_type: 'PLAN_NODE',
        description: 'Focal-created specific activities approved by the HOD.',
        steps: [
          { step_order: 1, step_label: 'Head of Division Approval', role_code: 'HEAD_OF_DIVISION', scope: 'DIVISION' },
        ],
      },
    ];

    for (const tmpl of templates) {
      const { steps, ...templateData } = tmpl;
      const [templateId] = await knex('workflow_templates').insert(templateData);
      if (steps.length) {
        await knex('workflow_template_steps').insert(
          steps.map((s) => ({ ...s, template_id: templateId }))
        );
      }
    }
  }
};

exports.down = async function (knex) {
  // Drop extensions from approval_steps (reverse order)
  if (await knex.schema.hasTable('approval_steps')) {
    for (const col of ['step_label', 'scope', 'role_code', 'approver_id']) {
      if (await knex.schema.hasColumn('approval_steps', col)) {
        await knex.schema.alterTable('approval_steps', (t) => t.dropColumn(col));
      }
    }
  }

  // Drop extensions from approval_instances
  if (await knex.schema.hasTable('approval_instances')) {
    for (const col of ['submitted_by_id', 'division_code', 'workflow_template_id']) {
      if (await knex.schema.hasColumn('approval_instances', col)) {
        await knex.schema.alterTable('approval_instances', (t) => t.dropColumn(col));
      }
    }
  }

  // Drop template tables
  await knex.schema.dropTableIfExists('workflow_template_steps');
  await knex.schema.dropTableIfExists('workflow_templates');
};
