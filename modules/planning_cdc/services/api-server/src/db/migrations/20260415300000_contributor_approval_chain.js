/**
 * Contributor Report Approval Chain (D-20260415-05).
 *
 * Adds the dedicated 3-step workflow that triggers when a CONTRIB
 * division/directorate submits a report on an activity or T3/T4 indicator.
 *
 * Extends — never duplicates — the workflow engine surface introduced by
 * 20260412000000_workflow_templates.js. Concretely:
 *
 *   approval_instances    + is_contrib_flow, contrib_org_code, main_org_code
 *                         + status enum: BLOCKED_NO_APPROVER, IN_REVIEW, CANCELLED
 *   approval_steps        + round, admin_bypass
 *                         + decision enum: BLOCKED_NO_APPROVER, CANCELLED
 *                         + scope enum: CONTRIB_DIVISION, MAIN_DIVISION
 *   workflow_templates    + template_variant
 *   workflow_template_steps + scope enum: CONTRIB_DIVISION, MAIN_DIVISION
 *
 * Seeds:
 *   - 3 CONTRIBUTOR_CHAIN templates (ACTIVITY_REPORT, INDICATOR_ACTUAL,
 *     DIVISION_ACTIVITY_REPORT) with 3 steps each.
 *   - `reports` rbac_modules row.
 *   - 8 new rbac_actions: approve_step1..3, approve_admin_bypass,
 *     reject_step1..3, read_history.
 *   - Default permission grants per spec §6.
 *
 * Idempotent: every column / row guarded by hasColumn / existence check.
 */

exports.up = async function up(knex) {
  // ── 1. approval_instances: new columns ────────────────────────
  if (await knex.schema.hasTable('approval_instances')) {
    if (!(await knex.schema.hasColumn('approval_instances', 'is_contrib_flow'))) {
      await knex.schema.alterTable('approval_instances', (t) => {
        t.boolean('is_contrib_flow').notNullable().defaultTo(false);
      });
    }
    if (!(await knex.schema.hasColumn('approval_instances', 'contrib_org_code'))) {
      await knex.schema.alterTable('approval_instances', (t) => {
        t.string('contrib_org_code', 20).nullable();
      });
    }
    if (!(await knex.schema.hasColumn('approval_instances', 'main_org_code'))) {
      await knex.schema.alterTable('approval_instances', (t) => {
        t.string('main_org_code', 20).nullable();
      });
    }

    // Extend status enum (idempotent: the broader set is a superset).
    await knex.schema.raw(
      "ALTER TABLE approval_instances MODIFY COLUMN status " +
      "ENUM('PENDING','IN_REVIEW','APPROVED','REJECTED','BLOCKED_NO_APPROVER','CANCELLED') " +
      "NOT NULL DEFAULT 'PENDING'"
    );

    // Helpful inbox index — guarded by name uniqueness on add.
    const idxRows = await knex.raw(
      "SHOW INDEX FROM approval_instances WHERE Key_name = 'idx_appr_inst_contrib'"
    );
    if (!idxRows[0] || idxRows[0].length === 0) {
      await knex.schema.alterTable('approval_instances', (t) => {
        t.index(['entity_type', 'entity_id', 'is_contrib_flow'], 'idx_appr_inst_contrib');
      });
    }
  }

  // ── 2. approval_steps: new columns + extended enums ───────────
  if (await knex.schema.hasTable('approval_steps')) {
    if (!(await knex.schema.hasColumn('approval_steps', 'round'))) {
      await knex.schema.alterTable('approval_steps', (t) => {
        t.integer('round').notNullable().defaultTo(1);
      });
    }
    if (!(await knex.schema.hasColumn('approval_steps', 'admin_bypass'))) {
      await knex.schema.alterTable('approval_steps', (t) => {
        t.boolean('admin_bypass').notNullable().defaultTo(false);
      });
    }

    await knex.schema.raw(
      "ALTER TABLE approval_steps MODIFY COLUMN decision " +
      "ENUM('PENDING','APPROVED','REJECTED','CHANGES_REQUESTED','BLOCKED_NO_APPROVER','CANCELLED') " +
      "NOT NULL DEFAULT 'PENDING'"
    );

    if (await knex.schema.hasColumn('approval_steps', 'scope')) {
      await knex.schema.raw(
        "ALTER TABLE approval_steps MODIFY COLUMN scope " +
        "ENUM('DIVISION','GLOBAL','CONTRIB_DIVISION','MAIN_DIVISION') NULL"
      );
    }
  }

  // ── 3. workflow_templates: template_variant ───────────────────
  if (await knex.schema.hasTable('workflow_templates')) {
    if (!(await knex.schema.hasColumn('workflow_templates', 'template_variant'))) {
      await knex.schema.alterTable('workflow_templates', (t) => {
        t.string('template_variant', 40).notNullable().defaultTo('DEFAULT');
        t.index(['entity_type', 'template_variant', 'is_active'], 'idx_wf_tmpl_variant');
      });
    }
  }

  // ── 4. workflow_template_steps: extended scope enum ───────────
  if (await knex.schema.hasTable('workflow_template_steps')) {
    await knex.schema.raw(
      "ALTER TABLE workflow_template_steps MODIFY COLUMN scope " +
      "ENUM('DIVISION','GLOBAL','CONTRIB_DIVISION','MAIN_DIVISION') NOT NULL DEFAULT 'DIVISION'"
    );
  }

  // ── 5. Seed CONTRIBUTOR_CHAIN templates ───────────────────────
  const contribTemplates = [
    {
      name: 'Activity Report — Contributor Chain',
      entity_type: 'ACTIVITY_REPORT',
      template_variant: 'CONTRIBUTOR_CHAIN',
      description:
        'Triggered when a CONTRIB division/directorate submits an activity report. ' +
        'Step 1: contributor unit HOD/Director. Step 2: MAIN unit HOD/Director. ' +
        'Step 3: M&E officer or admin sign-off.',
      steps: [
        { step_order: 1, step_label: 'Contributor HOD/Director Review', role_code: 'HEAD_OF_DIVISION', scope: 'CONTRIB_DIVISION' },
        { step_order: 2, step_label: 'MAIN HOD/Director Review',        role_code: 'HEAD_OF_DIVISION', scope: 'MAIN_DIVISION' },
        { step_order: 3, step_label: 'M&E / Admin Sign-off',            role_code: 'ME_OFFICER',       scope: 'GLOBAL' },
      ],
    },
    {
      name: 'Indicator Report — Contributor Chain',
      entity_type: 'INDICATOR_ACTUAL',
      template_variant: 'CONTRIBUTOR_CHAIN',
      description:
        'Triggered when a CONTRIB division reports on a T3/T4 indicator. ' +
        'Same 3-step chain as activity reports.',
      steps: [
        { step_order: 1, step_label: 'Contributor HOD/Director Review', role_code: 'HEAD_OF_DIVISION', scope: 'CONTRIB_DIVISION' },
        { step_order: 2, step_label: 'MAIN HOD/Director Review',        role_code: 'HEAD_OF_DIVISION', scope: 'MAIN_DIVISION' },
        { step_order: 3, step_label: 'M&E / Admin Sign-off',            role_code: 'ME_OFFICER',       scope: 'GLOBAL' },
      ],
    },
    {
      name: 'Division Activity Report — Contributor Chain',
      entity_type: 'DIVISION_ACTIVITY_REPORT',
      template_variant: 'CONTRIBUTOR_CHAIN',
      description:
        'Triggered when a CONTRIB division submits a quarterly division activity ' +
        'report on a parent activity owned by another MAIN division.',
      steps: [
        { step_order: 1, step_label: 'Contributor HOD/Director Review', role_code: 'HEAD_OF_DIVISION', scope: 'CONTRIB_DIVISION' },
        { step_order: 2, step_label: 'MAIN HOD/Director Review',        role_code: 'HEAD_OF_DIVISION', scope: 'MAIN_DIVISION' },
        { step_order: 3, step_label: 'M&E / Admin Sign-off',            role_code: 'ME_OFFICER',       scope: 'GLOBAL' },
      ],
    },
  ];

  for (const tmpl of contribTemplates) {
    const exists = await knex('workflow_templates')
      .where({ entity_type: tmpl.entity_type, template_variant: 'CONTRIBUTOR_CHAIN' })
      .first();
    if (exists) continue;

    const { steps, ...templateData } = tmpl;
    const [templateId] = await knex('workflow_templates').insert(templateData);
    await knex('workflow_template_steps').insert(
      steps.map((s) => ({ ...s, template_id: templateId, is_required: true }))
    );
  }

  // Backfill template_variant on the pre-existing default templates.
  await knex('workflow_templates')
    .whereNull('template_variant')
    .orWhere('template_variant', '')
    .update({ template_variant: 'DEFAULT' });

  // ── 6. RBAC: seed `reports` module + 8 actions + grants ───────
  const REPORTS_MODULE = {
    code: 'reports',
    name: 'Approval Reports',
    category: 'reporting',
    sort_order: 34,
  };

  const NEW_ACTIONS = [
    { code: 'approve_step1',         name: 'Approve Step 1 (Contributor HOD/Director)', sort_order: 11 },
    { code: 'approve_step2',         name: 'Approve Step 2 (MAIN HOD/Director)',        sort_order: 12 },
    { code: 'approve_step3',         name: 'Approve Step 3 (M&E / Admin sign-off)',     sort_order: 13 },
    { code: 'approve_admin_bypass',  name: 'Bypass approval chain (admin / M&E)',       sort_order: 14 },
    { code: 'reject_step1',          name: 'Reject at Step 1',                          sort_order: 15 },
    { code: 'reject_step2',          name: 'Reject at Step 2',                          sort_order: 16 },
    { code: 'reject_step3',          name: 'Reject at Step 3',                          sort_order: 17 },
    { code: 'read_history',          name: 'Read approval history',                     sort_order: 18 },
  ];

  // Insert / fetch module id.
  let mod = await knex('rbac_modules').where('code', REPORTS_MODULE.code).first();
  if (!mod) {
    const [id] = await knex('rbac_modules').insert(REPORTS_MODULE);
    mod = { id, ...REPORTS_MODULE };
  }

  // Insert / fetch actions.
  const actionMap = {};
  for (const act of NEW_ACTIONS) {
    let row = await knex('rbac_actions').where('code', act.code).first();
    if (!row) {
      const [id] = await knex('rbac_actions').insert(act);
      row = { id, ...act };
    }
    actionMap[act.code] = row.id;
  }

  // Default grants per spec §6 + addendum (M&E gets admin-bypass for blocked steps).
  const ROLE_GRANTS = {
    SYSTEM_ADMIN: {
      approve_step1: 'all', approve_step2: 'all', approve_step3: 'all',
      approve_admin_bypass: 'all',
      reject_step1: 'all', reject_step2: 'all', reject_step3: 'all',
      read_history: 'all',
    },
    RBM_ADMIN: {
      approve_step1: 'all', approve_step2: 'all', approve_step3: 'all',
      approve_admin_bypass: 'all',
      reject_step1: 'all', reject_step2: 'all', reject_step3: 'all',
      read_history: 'all',
    },
    ME_OFFICER: {
      approve_step3: 'all',
      approve_admin_bypass: 'all',
      reject_step3: 'all',
      read_history: 'all',
    },
    HEAD_OF_DIVISION: {
      approve_step1: 'division', approve_step2: 'division',
      reject_step1: 'division', reject_step2: 'division',
      read_history: 'division',
    },
    DIRECTOR: {
      approve_step1: 'directorate', approve_step2: 'directorate',
      reject_step1: 'directorate', reject_step2: 'directorate',
      read_history: 'directorate',
    },
    FOCAL_PERSON: {
      read_history: 'own',
    },
    STAFF: {
      read_history: 'division',
    },
  };

  const roleRows = await knex('roles').select('id', 'code');
  const roleMap = {};
  roleRows.forEach((r) => { roleMap[r.code] = r.id; });

  for (const [roleCode, perms] of Object.entries(ROLE_GRANTS)) {
    const roleId = roleMap[roleCode];
    if (!roleId) continue; // role not seeded in this env — skip silently
    for (const [actCode, scope] of Object.entries(perms)) {
      const actionId = actionMap[actCode];
      if (!actionId) continue;
      const exists = await knex('rbac_permissions')
        .where({ role_id: roleId, module_id: mod.id, action_id: actionId })
        .first();
      if (!exists) {
        await knex('rbac_permissions').insert({
          role_id: roleId, module_id: mod.id, action_id: actionId, scope,
        });
      }
    }
  }
};

exports.down = async function down(knex) {
  // ── Reverse RBAC seed ─────────────────────────────────────────
  const mod = await knex('rbac_modules').where('code', 'reports').first();
  if (mod) {
    await knex('rbac_permissions').where('module_id', mod.id).del();
    await knex('rbac_modules').where('id', mod.id).del();
  }
  await knex('rbac_actions').whereIn('code', [
    'approve_step1', 'approve_step2', 'approve_step3', 'approve_admin_bypass',
    'reject_step1', 'reject_step2', 'reject_step3', 'read_history',
  ]).del();

  // ── Reverse seeded contrib templates ──────────────────────────
  const tmplIds = await knex('workflow_templates')
    .where('template_variant', 'CONTRIBUTOR_CHAIN')
    .select('id');
  if (tmplIds.length) {
    const ids = tmplIds.map((r) => r.id);
    await knex('workflow_template_steps').whereIn('template_id', ids).del();
    await knex('workflow_templates').whereIn('id', ids).del();
  }

  // ── Reverse template_variant column ───────────────────────────
  if (await knex.schema.hasTable('workflow_templates')) {
    if (await knex.schema.hasColumn('workflow_templates', 'template_variant')) {
      await knex.schema.alterTable('workflow_templates', (t) => {
        t.dropIndex(['entity_type', 'template_variant', 'is_active'], 'idx_wf_tmpl_variant');
        t.dropColumn('template_variant');
      });
    }
  }

  // ── Reverse workflow_template_steps.scope enum (drop new values) ──
  if (await knex.schema.hasTable('workflow_template_steps')) {
    await knex('workflow_template_steps')
      .whereIn('scope', ['CONTRIB_DIVISION', 'MAIN_DIVISION'])
      .update({ scope: 'DIVISION' });
    await knex.schema.raw(
      "ALTER TABLE workflow_template_steps MODIFY COLUMN scope " +
      "ENUM('DIVISION','GLOBAL') NOT NULL DEFAULT 'DIVISION'"
    );
  }

  // ── Reverse approval_steps changes ────────────────────────────
  if (await knex.schema.hasTable('approval_steps')) {
    await knex('approval_steps')
      .whereIn('decision', ['BLOCKED_NO_APPROVER', 'CANCELLED'])
      .update({ decision: 'PENDING' });
    await knex.schema.raw(
      "ALTER TABLE approval_steps MODIFY COLUMN decision " +
      "ENUM('PENDING','APPROVED','REJECTED','CHANGES_REQUESTED') NOT NULL DEFAULT 'PENDING'"
    );
    if (await knex.schema.hasColumn('approval_steps', 'scope')) {
      await knex('approval_steps')
        .whereIn('scope', ['CONTRIB_DIVISION', 'MAIN_DIVISION'])
        .update({ scope: 'DIVISION' });
      await knex.schema.raw(
        "ALTER TABLE approval_steps MODIFY COLUMN scope " +
        "ENUM('DIVISION','GLOBAL') NULL"
      );
    }
    for (const col of ['admin_bypass', 'round']) {
      if (await knex.schema.hasColumn('approval_steps', col)) {
        await knex.schema.alterTable('approval_steps', (t) => t.dropColumn(col));
      }
    }
  }

  // ── Reverse approval_instances changes ────────────────────────
  if (await knex.schema.hasTable('approval_instances')) {
    const idxRows = await knex.raw(
      "SHOW INDEX FROM approval_instances WHERE Key_name = 'idx_appr_inst_contrib'"
    );
    if (idxRows[0] && idxRows[0].length) {
      await knex.schema.alterTable('approval_instances', (t) => {
        t.dropIndex(['entity_type', 'entity_id', 'is_contrib_flow'], 'idx_appr_inst_contrib');
      });
    }
    await knex('approval_instances')
      .whereIn('status', ['BLOCKED_NO_APPROVER', 'IN_REVIEW', 'CANCELLED'])
      .update({ status: 'PENDING' });
    await knex.schema.raw(
      "ALTER TABLE approval_instances MODIFY COLUMN status " +
      "ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING'"
    );
    for (const col of ['main_org_code', 'contrib_org_code', 'is_contrib_flow']) {
      if (await knex.schema.hasColumn('approval_instances', col)) {
        await knex.schema.alterTable('approval_instances', (t) => t.dropColumn(col));
      }
    }
  }
};
