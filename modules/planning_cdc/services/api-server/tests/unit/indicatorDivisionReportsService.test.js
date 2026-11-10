/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── indicatorDivisionReportsService unit tests ──
//
// Tests: getOrInit, saveDraft, submit, approve, reject, getAllForIndicator, getHistory, forceSetStatus

jest.mock('../../src/services/workflowEngine', () => ({
  startWorkflow: jest.fn().mockResolvedValue({}),
  decideWorkflowStep: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/services/contributorWorkflowEngine', () => ({
  startContributorWorkflow: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/services/reporting/divisionContribution', () => ({
  getReportRole: jest.fn().mockResolvedValue('OWNER'),
}));

jest.mock('../../src/services/reporting/reportEmailDetails', () => ({
  indicatorReportEmail: jest.fn().mockResolvedValue({ fields: [], attachments: [] }),
  indicatorReportUrl: jest.fn().mockReturnValue('https://app/quarterly-report/5'),
  submitterName: jest.fn().mockResolvedValue('Moses K'),
  outcomeRecipients: jest.requireActual('../../src/services/reporting/reportEmailDetails').outcomeRecipients,
}));
jest.mock('../../src/services/eventBusService', () => ({
  emitEvent: jest.fn().mockResolvedValue(undefined),
}));

// Same-directorate snap (D-20260710-01) — default false so legacy paths are
// untouched; the snap tests arm it explicitly.
jest.mock('../../src/services/divisionAliasService', () => ({
  sameDirectorate: jest.fn().mockResolvedValue(false),
  getDirectorateOf: jest.fn().mockResolvedValue(null),
  resolveAliases: jest.fn().mockResolvedValue([]),
  sameDivision: jest.fn().mockResolvedValue(false),
  invalidateAliasCache: jest.fn(),
}));

const svc = require('../../src/services/reporting/indicatorDivisionReportsService');
const workflowEngine = require('../../src/services/workflowEngine');
const { startContributorWorkflow } = require('../../src/services/contributorWorkflowEngine');
const { getReportRole } = require('../../src/services/reporting/divisionContribution');
const { sameDirectorate, sameDivision } = require('../../src/services/divisionAliasService');
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
  c.whereNull.mockReset().mockReturnValue(c);
  c.select.mockReset().mockReturnValue(c);
  c.orderBy.mockReset().mockReturnValue(c);
  c.leftJoin.mockReset().mockReturnValue(c);
  c.join.mockReset().mockReturnValue(c);
  // Add any missing methods to the chain dynamically
  if (!c.whereNotIn) c.whereNotIn = jest.fn().mockReturnValue(c);
  else c.whereNotIn.mockReset().mockReturnValue(c);
  if (!c.orderByRaw) c.orderByRaw = jest.fn().mockReturnValue(c);
  else c.orderByRaw.mockReset().mockReturnValue(c);
  if (!c.whereNot) c.whereNot = jest.fn().mockReturnValue(c);
  else c.whereNot.mockReset().mockReturnValue(c);
}

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
  workflowEngine.startWorkflow.mockResolvedValue({});
  workflowEngine.decideWorkflowStep.mockResolvedValue({});
  startContributorWorkflow.mockResolvedValue({});
  getReportRole.mockResolvedValue('OWNER');
  sameDirectorate.mockResolvedValue(false);
});

// ── getOrInit ─────────────────────────────────────────────────────────────────
describe('indicatorDivisionReportsService.getOrInit', () => {
  it('should return existing report when found', async () => {
    const existing = { id: 5, plan_node_id: 1, division_code: 'DCM', status: 'DRAFT' };
    db.__chain.first.mockResolvedValueOnce(existing);
    const result = await svc.getOrInit({ planNodeId: 1, divisionCode: 'DCM', quarter: 'Q1', fiscalYear: 2026, userId: 7 });
    expect(result).toMatchObject({ id: 5 });
    expect(db.__chain.insert).not.toHaveBeenCalled();
  });

  it('should create report when not found', async () => {
    getReportRole.mockResolvedValueOnce('OWNER');
    db.__chain.first
      .mockResolvedValueOnce(undefined)  // not found
      .mockResolvedValueOnce({ responsible_division_code: 'DCM' }) // plan_nodes (same code → no snap)
      .mockResolvedValueOnce({ id: 10, status: 'DRAFT' }); // re-fetch
    db.__chain.insert.mockResolvedValueOnce([10]);

    const result = await svc.getOrInit({ planNodeId: 1, divisionCode: 'DCM', quarter: 'Q1', fiscalYear: 2026, userId: 7 });
    expect(db.__chain.insert).toHaveBeenCalled();
    expect(result).toMatchObject({ id: 10 });
  });

  it('should snap a same-directorate contributor onto the MAIN division (D-20260710-01)', async () => {
    getReportRole.mockResolvedValueOnce('OWNER');
    sameDirectorate.mockResolvedValueOnce(true); // e.g. CLDS and PGI both under CLSN
    db.__chain.first
      .mockResolvedValueOnce(undefined)  // no row under the contributor's code
      .mockResolvedValueOnce({ responsible_division_code: 'PGI' }) // plan_nodes main
      .mockResolvedValueOnce(undefined)  // no row under the main either
      .mockResolvedValueOnce({ id: 11, division_code: 'PGI', role: 'OWNER', status: 'DRAFT' }); // re-fetch
    db.__chain.insert.mockResolvedValueOnce([11]);

    const result = await svc.getOrInit({ planNodeId: 1, divisionCode: 'CLDS', quarter: 'Q2', fiscalYear: 2026, userId: 7 });
    expect(sameDirectorate).toHaveBeenCalledWith('CLDS', 'PGI');
    // The INSERT must carry the MAIN division, not the contributor.
    const inserted = db.__chain.insert.mock.calls[0][0];
    expect(inserted.division_code).toBe('PGI');
    expect(result).toMatchObject({ id: 11, division_code: 'PGI' });
  });

  it('should reuse the MAIN division existing row for a same-directorate contributor', async () => {
    sameDirectorate.mockResolvedValueOnce(true);
    db.__chain.first
      .mockResolvedValueOnce(undefined)  // no row under contributor code
      .mockResolvedValueOnce({ responsible_division_code: 'PGI' }) // plan_nodes main
      .mockResolvedValueOnce({ id: 12, division_code: 'PGI', role: 'OWNER', status: 'DRAFT' }); // main row exists
    const result = await svc.getOrInit({ planNodeId: 1, divisionCode: 'CLDS', quarter: 'Q2', fiscalYear: 2026, userId: 7 });
    expect(result).toMatchObject({ id: 12, division_code: 'PGI' });
    expect(db.__chain.insert).not.toHaveBeenCalled();
  });

  it('should throw 403 when division has no role on the indicator', async () => {
    getReportRole.mockResolvedValueOnce(null);
    db.__chain.first.mockResolvedValueOnce(undefined);

    await expect(
      svc.getOrInit({ planNodeId: 1, divisionCode: 'GHOST', quarter: 'Q1', fiscalYear: 2026, userId: 7 })
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── saveDraft ─────────────────────────────────────────────────────────────────
describe('indicatorDivisionReportsService.saveDraft', () => {
  it('should throw 400 when actual_value is negative', async () => {
    await expect(
      svc.saveDraft({ planNodeId: 1, divisionCode: 'DCM', quarter: 'Q1', fiscalYear: 2026, userId: 7, data: { actual_value: -5 } })
    ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
  });

  // D-20261108-02: a report in review or approved is not turned back into a draft.
  it.each(['SUBMITTED', 'IN_REVIEW', 'APPROVED'])('should refuse to edit a %s report (409)', async (status) => {
    db.__chain.first.mockResolvedValueOnce({ id: 5, status, actual_value: 3 });
    await expect(
      svc.saveDraft({ planNodeId: 1, divisionCode: 'DCM', quarter: 'Q1', fiscalYear: 2026, userId: 7, data: { actual_value: 80 } })
    ).rejects.toMatchObject({ status: 409, code: 'REPORT_LOCKED' });
    expect(db.__chain.update).not.toHaveBeenCalled();
  });

  it('should still edit a rejected report', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 5, status: 'REJECTED', actual_value: 3 })
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 5, actual_value: 80 });
    await expect(
      svc.saveDraft({ planNodeId: 1, divisionCode: 'DCM', quarter: 'Q1', fiscalYear: 2026, userId: 7, data: { actual_value: 80 } })
    ).resolves.toMatchObject({ id: 5 });
  });

  it('should save draft and return updated report', async () => {
    const existing = { id: 5, status: 'DRAFT', actual_value: 0 };
    db.__chain.first
      .mockResolvedValueOnce(existing) // getOrInit existing
      .mockResolvedValueOnce({ id: 1 }) // ensureCreatedHistory: CREATED entry already there
      .mockResolvedValueOnce({ id: 5, actual_value: 80 }); // re-fetch

    const result = await svc.saveDraft({
      planNodeId: 1, divisionCode: 'DCM', quarter: 'Q1', fiscalYear: 2026, userId: 7,
      data: { actual_value: 80, narrative: 'Progress made' },
    });
    expect(db.__chain.update).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 5 });
  });

  // Regression: the form autosaves an emptied value as '' and the DECIMAL
  // column rejected it — 500 on every autosave since 2026-09-30.
  it('should store an empty actual_value as null instead of an empty string', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 5, status: 'DRAFT', actual_value: 12 })
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 5, actual_value: null });

    await svc.saveDraft({
      planNodeId: 1, divisionCode: 'DCM', quarter: 'Q4', fiscalYear: 2026, userId: 7,
      data: { actual_value: '', narrative: '' },
    });
    expect(db.__chain.update.mock.calls[0][0].actual_value).toBeNull();
  });

  it('should accept zero actual_value (valid)', async () => {
    const existing = { id: 5, status: 'DRAFT', actual_value: 0 };
    db.__chain.first
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ id: 1 }) // ensureCreatedHistory no-op
      .mockResolvedValueOnce({ id: 5, actual_value: 0 });

    await expect(
      svc.saveDraft({ planNodeId: 1, divisionCode: 'DCM', quarter: 'Q1', fiscalYear: 2026, userId: 7, data: { actual_value: 0 } })
    ).resolves.toBeDefined();
  });

  it('should backfill the CREATED timeline entry on first save of a silently-inited report (D-20260714-01)', async () => {
    const existing = { id: 5, status: 'DRAFT', actual_value: 0 };
    db.__chain.first
      .mockResolvedValueOnce(existing)   // getOrInit existing
      .mockResolvedValueOnce(undefined)  // ensureCreatedHistory: no CREATED yet
      .mockResolvedValueOnce({ id: 5 }); // re-fetch
    await svc.saveDraft({ planNodeId: 1, divisionCode: 'DCM', quarter: 'Q1', fiscalYear: 2026, userId: 7, data: { actual_value: 3 } });
    const created = db.__chain.insert.mock.calls.find((c) => c[0] && c[0].action === 'CREATED');
    expect(created).toBeTruthy();
    expect(created[0].performed_by).toBe(7);
  });
});

// ── silent init (D-20260714-01) ───────────────────────────────────────────────
describe('indicatorDivisionReportsService.getOrInit silentInit', () => {
  it('should NOT write the CREATED history entry when silentInit is true (form view)', async () => {
    getReportRole.mockResolvedValueOnce('OWNER');
    db.__chain.first
      .mockResolvedValueOnce(undefined)  // not found
      .mockResolvedValueOnce({ responsible_division_code: 'DCM' }) // plan_nodes (no snap)
      .mockResolvedValueOnce({ id: 10, status: 'DRAFT' }); // re-fetch
    db.__chain.insert.mockResolvedValueOnce([10]);

    await svc.getOrInit({ planNodeId: 1, divisionCode: 'DCM', quarter: 'Q1', fiscalYear: 2026, userId: 7, silentInit: true });
    expect(db.__chain.insert).toHaveBeenCalledTimes(1); // report row only — no history row
    const created = db.__chain.insert.mock.calls.find((c) => c[0] && c[0].action === 'CREATED');
    expect(created).toBeUndefined();
  });
});

// ── submit ────────────────────────────────────────────────────────────────────
describe('indicatorDivisionReportsService.submit', () => {
  it('should throw 404 when report not found', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    await expect(svc.submit(999, 7)).rejects.toMatchObject({ status: 404 });
  });

  it('should throw 400 when report is not in DRAFT or REJECTED status', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 1, status: 'SUBMITTED', actual_value: 10, role: 'OWNER' });
    await expect(svc.submit(1, 7)).rejects.toMatchObject({ status: 400 });
  });

  it('should throw 400 when actual_value is negative on submit', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 1, status: 'DRAFT', actual_value: -5, role: 'OWNER' });
    await expect(svc.submit(1, 7)).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
  });

  it('should submit OWNER report via workflowEngine', async () => {
    db.__chain.first
      // 1. Load report
      .mockResolvedValueOnce({ id: 1, status: 'DRAFT', actual_value: 10, role: 'OWNER', division_code: 'DCM', plan_node_id: 5 })
      // 2. ensureCreatedHistory: CREATED entry already exists (no backfill)
      .mockResolvedValueOnce({ id: 90 })
      // 3. emitReportEvent: report fetch
      .mockResolvedValueOnce({ id: 1, division_code: 'DCM', plan_node_id: 5, submitted_by: 7 })
      // 4. emitReportEvent: plan_node fetch
      .mockResolvedValueOnce({ id: 5, title: 'Indicator' })
      // 5. final re-fetch
      .mockResolvedValueOnce({ id: 1, status: 'IN_REVIEW' });
    workflowEngine.startWorkflow.mockResolvedValueOnce({});

    const result = await svc.submit(1, 7);
    expect(workflowEngine.startWorkflow).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 1 });
  });

  it('should submit CONTRIB report via startContributorWorkflow', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, status: 'DRAFT', actual_value: 5, role: 'CONTRIB', division_code: 'DCM', plan_node_id: 5 })
      .mockResolvedValueOnce({ responsible_division_code: 'AMERT' }) // plan node for CONTRIB
      .mockResolvedValueOnce({ id: 90 }) // ensureCreatedHistory: entry exists
      .mockResolvedValueOnce({ id: 1, division_code: 'DCM', plan_node_id: 5, submitted_by: 7 }) // emitReportEvent
      .mockResolvedValueOnce({ id: 5, title: 'Indicator' }) // plan_node in emitReportEvent
      .mockResolvedValueOnce({ id: 1, status: 'IN_REVIEW' }); // re-fetch
    startContributorWorkflow.mockResolvedValueOnce({});

    const result = await svc.submit(1, 7);
    expect(startContributorWorkflow).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 1 });
  });

  it('should fall back to direct update when TEMPLATE_NOT_FOUND', async () => {
    const err = new Error('No template'); err.code = 'TEMPLATE_NOT_FOUND';
    workflowEngine.startWorkflow.mockRejectedValueOnce(err);
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, status: 'DRAFT', actual_value: 5, role: 'OWNER', division_code: 'DCM', plan_node_id: 5 })
      .mockResolvedValueOnce({ id: 90 }) // ensureCreatedHistory: entry exists
      .mockResolvedValueOnce({ id: 1, division_code: 'DCM', plan_node_id: 5, submitted_by: 7 }) // emitReportEvent report
      .mockResolvedValueOnce({ id: 5, title: 'Ind' })         // emitReportEvent plan_node
      .mockResolvedValueOnce({ id: 1, status: 'SUBMITTED' }); // final re-fetch

    const result = await svc.submit(1, 7);
    expect(db.__chain.update).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 1 });
  });

  it('should re-throw non-TEMPLATE_NOT_FOUND errors', async () => {
    const err = new Error('DB fail'); err.code = 'DB_FAIL';
    workflowEngine.startWorkflow.mockRejectedValueOnce(err);
    db.__chain.first.mockResolvedValueOnce({ id: 1, status: 'DRAFT', actual_value: 5, role: 'OWNER', division_code: 'DCM', plan_node_id: 5 });
    await expect(svc.submit(1, 7)).rejects.toThrow('DB fail');
  });
});

// ── approve ───────────────────────────────────────────────────────────────────
describe('indicatorDivisionReportsService.approve', () => {
  it('should throw 404 when report not found', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    await expect(svc.approve(999, 7)).rejects.toMatchObject({ status: 404 });
  });

  it('should throw 400 when report is not in SUBMITTED or IN_REVIEW', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 1, status: 'DRAFT' });
    await expect(svc.approve(1, 7)).rejects.toMatchObject({ status: 400 });
  });

  it('should throw 403 when no pending step found for user', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, status: 'IN_REVIEW' }); // report
    // findPendingStepForUser → no step (then returns empty)
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve(undefined).then(r));
    // The first() in findPendingStepForUser:
    db.__chain.first.mockResolvedValueOnce(null); // no step

    await expect(svc.approve(1, 7)).rejects.toMatchObject({ status: 403, code: 'NO_PENDING_STEP' });
  });

  it('should approve the step and return updated report', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, status: 'IN_REVIEW' }) // report
      .mockResolvedValueOnce({ step_id: 10, step_label: 'M&E', step_order: 1 }) // pending step
      .mockResolvedValueOnce({ id: 1, status: 'APPROVED' }); // re-fetch

    workflowEngine.decideWorkflowStep.mockResolvedValueOnce({});

    const result = await svc.approve(1, 7);
    expect(workflowEngine.decideWorkflowStep).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 1 });
  });
});

// ── reject ────────────────────────────────────────────────────────────────────
describe('indicatorDivisionReportsService.reject', () => {
  it('should throw 404 when report not found', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    await expect(svc.reject(999, 7, 'Missing data')).rejects.toMatchObject({ status: 404 });
  });

  it('should reject the step and return updated report', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 1, status: 'SUBMITTED' }) // report
      .mockResolvedValueOnce({ step_id: 10, step_label: 'M&E', step_order: 1 }) // step
      // emitReportEvent: report + plan_node fetch
      .mockResolvedValueOnce({ id: 1, division_code: 'DCM', plan_node_id: 5, submitted_by: 7 })
      .mockResolvedValueOnce({ id: 5, title: 'Ind' })
      .mockResolvedValueOnce({ id: 1, status: 'REJECTED' }); // re-fetch (last .first())

    workflowEngine.decideWorkflowStep.mockResolvedValueOnce({});

    const result = await svc.reject(1, 7, 'Missing data');
    expect(workflowEngine.decideWorkflowStep).toHaveBeenCalledWith(10, 'REJECTED', 'Missing data', 7);
    expect(result).toMatchObject({ id: 1 });
    // Outcome to the author and the business unit (D-20261015-01).
    const { emitEvent } = require('../../src/services/eventBusService');
    expect(emitEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'indicator_report.rejected',
      entity: expect.objectContaining({ owner_user_id: 7, main_division_code: 'DCM' }),
      metadata: expect.objectContaining({
        template_key: 'report-reviewed', decision: 'REJECTED', reason: 'Missing data', reviewedBy: 'Moses K', division: 'DCM',
      }),
    }));
  });
});

// ── markNotApplicable ────────────────────────────────────────────────────────
describe('indicatorDivisionReportsService.markNotApplicable', () => {
  it('should create a new report with status NOT_APPLICABLE when none exists', async () => {
    getReportRole.mockResolvedValueOnce('OWNER');
    sameDivision.mockResolvedValueOnce(true); // DCM is the main division
    db.__chain.first
      .mockResolvedValueOnce({ responsible_division_code: 'DCM' }) // main-division check
      .mockResolvedValueOnce(undefined) // getOrInit: not found
      .mockResolvedValueOnce({ responsible_division_code: 'DCM' }) // getOrInit: plan_nodes (no snap)
      .mockResolvedValueOnce({ id: 10, status: 'DRAFT' }) // getOrInit: re-fetch after insert
      .mockResolvedValueOnce({ id: 10, status: 'NOT_APPLICABLE', narrative: 'Not ours' }); // final re-fetch
    db.__chain.insert.mockResolvedValueOnce([10]);

    const result = await svc.markNotApplicable({
      planNodeId: 1, divisionCode: 'DCM', quarter: 'Q1', fiscalYear: '2026', userId: 7, reason: 'Not ours',
    });

    expect(db.__chain.update).toHaveBeenCalledTimes(1);
    const updateArgs = db.__chain.update.mock.calls[0][0];
    expect(updateArgs.status).toBe('NOT_APPLICABLE');
    expect(updateArgs.narrative).toBe('Not ours');
    expect(updateArgs.rejection_reason).toBe('Not ours');
    expect(result).toMatchObject({ id: 10, status: 'NOT_APPLICABLE' });
  });

  it('should update an existing DRAFT report to NOT_APPLICABLE without inserting a new row', async () => {
    const existing = { id: 5, status: 'DRAFT', plan_node_id: 1, division_code: 'DCM' };
    sameDivision.mockResolvedValueOnce(true);
    db.__chain.first
      .mockResolvedValueOnce({ responsible_division_code: 'DCM' }) // main-division check
      .mockResolvedValueOnce(existing) // getOrInit: found
      .mockResolvedValueOnce({ id: 5, status: 'NOT_APPLICABLE', narrative: 'Out of scope' }); // final re-fetch

    const result = await svc.markNotApplicable({
      planNodeId: 1, divisionCode: 'DCM', quarter: 'Q1', fiscalYear: '2026', userId: 7, reason: 'Out of scope',
    });

    // Exactly one insert: the addHistory() call for the NOT_APPLICABLE
    // transition. No *new* indicator_division_reports row is inserted since
    // getOrInit found an existing report — but the shared db.__chain mock
    // can't distinguish which table an insert targeted, so we assert the
    // count (1, from history) rather than "never called".
    expect(db.__chain.insert).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 5, status: 'NOT_APPLICABLE' });
  });

  it('should throw 403 when the division has no role on the indicator', async () => {
    getReportRole.mockResolvedValueOnce(null);
    db.__chain.first.mockResolvedValueOnce(undefined); // getOrInit: not found

    await expect(
      svc.markNotApplicable({ planNodeId: 1, divisionCode: 'GHOST', quarter: 'Q1', fiscalYear: '2026', userId: 7, reason: 'x' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── getAllForIndicator ─────────────────────────────────────────────────────────
describe('indicatorDivisionReportsService.getAllForIndicator', () => {
  it('should return all reports for a given indicator and quarter', async () => {
    const rows = [
      { id: 1, plan_node_id: 5, division_code: 'DCM', role: 'OWNER' },
      { id: 2, plan_node_id: 5, division_code: 'AMERT', role: 'CONTRIB' },
    ];
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const result = await svc.getAllForIndicator(5, 'Q1', 2026);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });
});

// ── getHistory ────────────────────────────────────────────────────────────────
describe('indicatorDivisionReportsService.getHistory', () => {
  it('should return timeline entries for a report', async () => {
    const rows = [
      { id: 1, action: 'SUBMITTED', from_status: 'DRAFT', to_status: 'IN_REVIEW', performed_at: new Date() },
    ];
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const result = await svc.getHistory(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].action).toBe('SUBMITTED');
  });
});

// ── forceSetStatus ────────────────────────────────────────────────────────────
describe('indicatorDivisionReportsService.forceSetStatus', () => {
  it('should throw 400 for invalid target status', async () => {
    await expect(svc.forceSetStatus(1, 'INVALID_STATUS', 1)).rejects.toMatchObject({ status: 400 });
  });

  it('should throw 404 when report not found', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    await expect(svc.forceSetStatus(999, 'DRAFT', 1)).rejects.toMatchObject({ status: 404 });
  });

  it('should return same report when status is already the target', async () => {
    const report = { id: 1, status: 'DRAFT', plan_node_id: 5 };
    db.__chain.first.mockResolvedValueOnce(report);
    const result = await svc.forceSetStatus(1, 'DRAFT', 1);
    expect(result).toMatchObject({ id: 1, status: 'DRAFT' });
    expect(db.__chain.update).not.toHaveBeenCalled();
  });

  it('should update status and close live approval instances', async () => {
    const report = { id: 1, status: 'IN_REVIEW', plan_node_id: 5, role: 'OWNER', division_code: 'DCM' };
    db.__chain.first.mockResolvedValueOnce(report);
    // No live instances (then returns empty)
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));

    await svc.forceSetStatus(1, 'APPROVED', 1, 'Admin override');
    expect(db.__chain.update).toHaveBeenCalledTimes(1);
    const updateArgs = db.__chain.update.mock.calls[0][0];
    expect(updateArgs.status).toBe('APPROVED');
  });
});

describe('indicatorDivisionReportsService.markNotApplicable — main division only (D-20261013-10)', () => {
  it('should refuse a contributor division with 403 and write nothing', async () => {
    sameDivision.mockResolvedValueOnce(false);
    sameDirectorate.mockResolvedValueOnce(false);
    db.__chain.first.mockResolvedValueOnce({ responsible_division_code: 'SDI' });
    await expect(svc.markNotApplicable({
      planNodeId: 1, divisionCode: 'MIS', quarter: 'Q3', fiscalYear: '2026', userId: 7, reason: 'Not MIS indicator',
    })).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('(SDI)') });
    expect(db.__chain.update).not.toHaveBeenCalled();
    expect(db.__chain.insert).not.toHaveBeenCalled();
  });

  it('should accept a division of the same directorate as the main one', async () => {
    sameDivision.mockResolvedValueOnce(false);
    sameDirectorate.mockResolvedValueOnce(true);
    db.__chain.first
      .mockResolvedValueOnce({ responsible_division_code: 'RHSS' })
      .mockResolvedValueOnce({ id: 5, status: 'DRAFT' })
      .mockResolvedValueOnce({ id: 5, status: 'NOT_APPLICABLE' });
    await expect(svc.markNotApplicable({
      planNodeId: 1, divisionCode: 'KM', quarter: 'Q3', fiscalYear: '2026', userId: 7, reason: 'x',
    })).resolves.toMatchObject({ status: 'NOT_APPLICABLE' });
  });
});

describe('indicatorDivisionReportsService.saveDraft — negative disaggregations (D-20261013-11)', () => {
  it('should refuse a negative disaggregation value with 400 and write nothing', async () => {
    await expect(svc.saveDraft({
      planNodeId: 1, divisionCode: 'LEGAL', quarter: 'Q3', fiscalYear: '2026', userId: 7,
      data: { actual_value: 3, disaggregations: { region: { eastern: 1 }, mou_type: { member_states: -22 } } },
    })).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect(db.__chain.update).not.toHaveBeenCalled();
  });
});

describe('indicatorDivisionReportsService — indicator dropped by the main division (D-20261013-12)', () => {
  const ownerNa = () => db.__chain.then.mockImplementationOnce((r) => Promise.resolve([{ division_code: 'SDI' }]).then(r));

  it('should refuse a contributor draft once the main division marked the indicator N/A', async () => {
    ownerNa();
    await expect(svc.saveDraft({
      planNodeId: 1, divisionCode: 'MIS', quarter: 'Q3', fiscalYear: '2026', userId: 7, data: { actual_value: 3 },
    })).rejects.toMatchObject({ status: 400, code: 'INDICATOR_NOT_APPLICABLE', message: expect.stringContaining('(SDI)') });
    expect(db.__chain.update).not.toHaveBeenCalled();
  });

  it('should refuse a contributor submission once the main division marked the indicator N/A', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 9, status: 'DRAFT', role: 'CONTRIB', plan_node_id: 1, quarter: 'Q3', fiscal_year: '2026', division_code: 'MIS', actual_value: 2 });
    ownerNa();
    await expect(svc.submit(9, 7)).rejects.toMatchObject({ status: 400, code: 'INDICATOR_NOT_APPLICABLE' });
  });

  it('should let the main division itself save (it may reopen its N/A)', async () => {
    ownerNa();
    db.__chain.first
      .mockResolvedValueOnce({ id: 5, status: 'NOT_APPLICABLE', division_code: 'SDI' }) // getOrInit: found
      .mockResolvedValueOnce({ id: 90 })                                               // created history exists
      .mockResolvedValueOnce({ id: 5, status: 'DRAFT' });                              // re-fetch
    await expect(svc.saveDraft({
      planNodeId: 1, divisionCode: 'SDI', quarter: 'Q3', fiscalYear: '2026', userId: 7, data: { actual_value: 3 },
    })).resolves.toBeTruthy();
  });
});

