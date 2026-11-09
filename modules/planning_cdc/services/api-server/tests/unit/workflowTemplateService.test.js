/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── workflowTemplateService unit tests ──

const svc = require('../../src/services/workflowTemplateService');
const db = require('../../src/config/db');

function resetChain() {
  const c = db.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.del.mockReset().mockResolvedValue(1);
  c.delete.mockReset().mockResolvedValue(1);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  c.where.mockReset().mockReturnValue(c);
  c.whereIn.mockReset().mockReturnValue(c);
  c.select.mockReset().mockReturnValue(c);
  c.orderBy.mockReset().mockReturnValue(c);
}

beforeEach(() => {
  resetChain();
  // db.transaction wraps in a fake trx — setup.js mocks it as cb(db)
});

// ── listTemplates ─────────────────────────────────────────────────────────────
describe('workflowTemplateService.listTemplates', () => {
  it('should return an empty array when no templates exist', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const result = await svc.listTemplates();
    expect(result).toEqual([]);
  });

  it('should attach steps to each template', async () => {
    const templates = [{ id: 1, name: 'Default Flow' }, { id: 2, name: 'Contributor Chain' }];
    const steps = [
      { id: 10, template_id: 1, step_order: 1, step_label: 'HOD Review' },
      { id: 11, template_id: 2, step_order: 1, step_label: 'Focal Review' },
      { id: 12, template_id: 2, step_order: 2, step_label: 'Director Approval' },
    ];

    db.__chain.then
      .mockImplementationOnce((r) => Promise.resolve(templates).then(r))
      .mockImplementationOnce((r) => Promise.resolve(steps).then(r));

    const result = await svc.listTemplates();
    expect(result).toHaveLength(2);
    expect(result[0].steps).toHaveLength(1);
    expect(result[1].steps).toHaveLength(2);
  });

  it('should apply entity_type filter when provided', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await svc.listTemplates({ entity_type: 'activity_report' });
    expect(db.__chain.where).toHaveBeenCalledWith('entity_type', 'activity_report');
  });

  it('should apply is_active filter when provided', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await svc.listTemplates({ is_active: true });
    expect(db.__chain.where).toHaveBeenCalledWith('is_active', true);
  });
});

// ── getTemplateById ───────────────────────────────────────────────────────────
describe('workflowTemplateService.getTemplateById', () => {
  it('should return null when template does not exist', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    const result = await svc.getTemplateById(999);
    expect(result).toBeNull();
  });

  it('should return the template with its steps', async () => {
    const template = { id: 1, name: 'Default Flow' };
    const steps = [{ id: 10, template_id: 1, step_order: 1 }];

    db.__chain.first.mockResolvedValueOnce(template);
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve(steps).then(r));

    const result = await svc.getTemplateById(1);
    expect(result).toMatchObject({ id: 1, name: 'Default Flow' });
    expect(result.steps).toHaveLength(1);
  });

  it('should attach empty steps array when no steps exist', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 3, name: 'Empty Template' });
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    const result = await svc.getTemplateById(3);
    expect(result.steps).toEqual([]);
  });
});

// ── createTemplate ────────────────────────────────────────────────────────────
describe('workflowTemplateService.createTemplate', () => {
  it('should insert the template and return the created record with steps', async () => {
    db.__chain.insert.mockResolvedValueOnce([5]);
    // getTemplateById called internally
    db.__chain.first.mockResolvedValueOnce({ id: 5, name: 'New Template', is_active: true });
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r)); // steps

    const result = await svc.createTemplate({ name: 'New Template', entity_type: 'activity_report' });
    expect(result).toMatchObject({ id: 5, name: 'New Template' });
  });

  it('should default is_active to true when not provided', async () => {
    db.__chain.insert.mockResolvedValueOnce([6]);
    db.__chain.first.mockResolvedValueOnce({ id: 6, name: 'T', is_active: true });
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    await svc.createTemplate({ name: 'T', entity_type: 'report' });
    const insertArgs = db.__chain.insert.mock.calls[0][0];
    expect(insertArgs.is_active).toBe(true);
  });

  it('should set is_active to false when explicitly provided', async () => {
    db.__chain.insert.mockResolvedValueOnce([7]);
    db.__chain.first.mockResolvedValueOnce({ id: 7, name: 'Inactive', is_active: false });
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    await svc.createTemplate({ name: 'Inactive', entity_type: 'report', is_active: false });
    const insertArgs = db.__chain.insert.mock.calls[0][0];
    expect(insertArgs.is_active).toBe(false);
  });

  it('should set description to null when not provided', async () => {
    db.__chain.insert.mockResolvedValueOnce([8]);
    db.__chain.first.mockResolvedValueOnce({ id: 8, name: 'No Desc' });
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    await svc.createTemplate({ name: 'No Desc', entity_type: 'report' });
    const insertArgs = db.__chain.insert.mock.calls[0][0];
    expect(insertArgs.description).toBeNull();
  });
});

// ── updateTemplate ────────────────────────────────────────────────────────────
describe('workflowTemplateService.updateTemplate', () => {
  it('should update and return the fresh template', async () => {
    db.__chain.update.mockResolvedValueOnce(1);
    db.__chain.first.mockResolvedValueOnce({ id: 1, name: 'Updated', is_active: true });
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    const result = await svc.updateTemplate(1, { name: 'Updated' });
    expect(result).toMatchObject({ id: 1, name: 'Updated' });
  });

  it('should include updated_at in the update call', async () => {
    db.__chain.update.mockResolvedValueOnce(1);
    db.__chain.first.mockResolvedValueOnce({ id: 1, name: 'T' });
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    await svc.updateTemplate(1, { name: 'T' });
    const updateArgs = db.__chain.update.mock.calls[0][0];
    expect(updateArgs).toHaveProperty('updated_at');
  });
});

// ── deleteTemplate ────────────────────────────────────────────────────────────
describe('workflowTemplateService.deleteTemplate', () => {
  it('should soft-delete the template by setting is_active to false', async () => {
    db.__chain.update.mockResolvedValueOnce(1);
    await svc.deleteTemplate(1);
    expect(db.__chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false })
    );
  });
});

// ── replaceSteps ──────────────────────────────────────────────────────────────
describe('workflowTemplateService.replaceSteps', () => {
  it('should delete existing steps and insert new ones within a transaction', async () => {
    const steps = [
      { step_order: 1, step_label: 'HOD Review', role_code: 'HEAD_OF_DIVISION', scope: 'DIVISION' },
    ];
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve(steps).then(r));

    const result = await svc.replaceSteps(1, steps);
    // delete and insert both called via trx (which is db in the mock)
    expect(db.__chain.delete).toHaveBeenCalledTimes(1);
    expect(db.__chain.insert).toHaveBeenCalledTimes(1);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should skip insert when steps array is empty', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await svc.replaceSteps(1, []);
    expect(db.__chain.delete).toHaveBeenCalledTimes(1);
    expect(db.__chain.insert).not.toHaveBeenCalled();
  });

  it('should default scope to DIVISION when not provided in a step', async () => {
    const steps = [
      { step_order: 1, step_label: 'Review', role_code: 'FOCAL_PERSON' },
    ];
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await svc.replaceSteps(1, steps);
    const insertArgs = db.__chain.insert.mock.calls[0][0];
    expect(insertArgs[0].scope).toBe('DIVISION');
  });

  it('should default is_required to true when not provided', async () => {
    const steps = [{ step_order: 1, step_label: 'Review', role_code: 'FOCAL_PERSON', scope: 'ALL' }];
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await svc.replaceSteps(1, steps);
    const insertArgs = db.__chain.insert.mock.calls[0][0];
    expect(insertArgs[0].is_required).toBe(true);
  });
});

// ── getActiveTemplateForEntity ────────────────────────────────────────────────
describe('workflowTemplateService.getActiveTemplateForEntity', () => {
  it('should return null when no active template is found', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    const result = await svc.getActiveTemplateForEntity('activity_report');
    expect(result).toBeNull();
  });

  it('should return the template with its steps when found', async () => {
    const template = { id: 1, name: 'Default', entity_type: 'activity_report', is_active: true };
    const steps = [{ id: 10, template_id: 1, step_order: 1 }];

    db.__chain.first.mockResolvedValueOnce(template);
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve(steps).then(r));

    const result = await svc.getActiveTemplateForEntity('activity_report');
    expect(result).toMatchObject({ id: 1 });
    expect(result.steps).toHaveLength(1);
  });

  it('should default variant to DEFAULT', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    await svc.getActiveTemplateForEntity('activity_report');
    expect(db.__chain.where).toHaveBeenCalledWith(
      expect.objectContaining({ template_variant: 'DEFAULT' })
    );
  });

  it('should use the provided variant parameter', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    await svc.getActiveTemplateForEntity('activity_report', 'CONTRIBUTOR_CHAIN');
    expect(db.__chain.where).toHaveBeenCalledWith(
      expect.objectContaining({ template_variant: 'CONTRIBUTOR_CHAIN' })
    );
  });
});
// ── One active template per (entity_type, variant) — D-20260817-02 ────────────
describe('one active template per entity/variant pair', () => {
  it('createTemplate deactivates active siblings of the same pair before inserting', async () => {
    // sibling deactivation update fires, then insert, then getTemplateById reads
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, name: 'New', entity_type: 'ACTIVITY_REPORT' }); // getTemplateById
    await svc.createTemplate({ name: 'New', entity_type: 'ACTIVITY_REPORT' });
    // the deactivation update ran with is_active:false
    const deactivation = db.__chain.update.mock.calls.find(
      (c) => c[0] && c[0].is_active === false,
    );
    expect(deactivation).toBeTruthy();
    // and the insert carries the DEFAULT variant
    const insertArg = db.__chain.insert.mock.calls[0][0];
    expect(insertArg.template_variant).toBe('DEFAULT');
    expect(insertArg.is_active).toBe(true);
  });

  it('createTemplate with is_active:false does not touch siblings', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 2, name: 'Draft' });
    await svc.createTemplate({ name: 'Draft', entity_type: 'ACTIVITY_REPORT', is_active: false });
    const deactivation = db.__chain.update.mock.calls.find(
      (c) => c[0] && c[0].is_active === false,
    );
    expect(deactivation).toBeFalsy();
  });

  it('updateTemplate activating a row deactivates its pair siblings (not itself)', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ entity_type: 'ACTIVITY_REPORT', template_variant: 'DEFAULT' }) // row lookup
      .mockResolvedValueOnce({ id: 5, name: 'B', is_active: 1 }); // getTemplateById
    await svc.updateTemplate(5, { is_active: true });
    const deactivation = db.__chain.update.mock.calls.find(
      (c) => c[0] && c[0].is_active === false,
    );
    expect(deactivation).toBeTruthy();
    // whereNot('id', 5) applied so the row itself survives
    const whereNotCall = db.__chain.whereNot.mock.calls.find((c) => c[0] === 'id' && c[1] === 5);
    expect(whereNotCall).toBeTruthy();
  });

  it('getActiveTemplateForEntity orders newest-first as a determinism net', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 9, name: 'X' });
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r)); // steps
    await svc.getActiveTemplateForEntity('ACTIVITY_REPORT');
    const orderCall = db.__chain.orderBy.mock.calls.find((c) => c[0] === 'id' && c[1] === 'desc');
    expect(orderCall).toBeTruthy();
  });
});
