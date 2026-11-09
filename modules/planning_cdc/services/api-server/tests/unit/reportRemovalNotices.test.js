// ── Removal notices: indicator N/A, activity draft deleted (D-20261015-01) ──
//
// Mocks: the shared chainable knex mock (db.__chain) and the event bus.

jest.mock('../../src/services/eventBusService', () => ({ emitEvent: jest.fn().mockResolvedValue({}) }));

const db = require('../../src/config/db');
const { emitEvent } = require('../../src/services/eventBusService');
const { notifyNotApplicable, notifyDraftDeleted } = require('../../src/services/reporting/reportRemovalNotices');

const actor = { id: 3, first_name: 'Jane', last_name: 'Doe' };

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.first.mockReset().mockResolvedValue(undefined);
});

describe('notifyNotApplicable', () => {
  const report = { id: 50, plan_node_id: 4, division_code: 'KM', quarter: 'Q3', fiscal_year: '2026' };
  const node = { id: 4, code: '1.2.3', title: 'Labs', contributing_divisions: '["DHIS"]' };

  it('should route to the main division and the contributors with the reason', async () => {
    await notifyNotApplicable({ report, node, actor, reason: 'Not ours' });
    const call = emitEvent.mock.calls[0][0];
    expect(call.eventKey).toBe('indicator_report.not_applicable');
    expect(call.entity).toEqual({ id: 50, main_division_code: 'KM', contributing_divisions: '["DHIS"]' });
    expect(call.metadata).toMatchObject({
      template_key: 'report-removed', code: '1.2.3', division: 'KM', quarter: 'Q3', fiscalYear: '2026', by: 'Jane Doe', reason: 'Not ours',
    });
    expect(call.metadata.reportUrl).toMatch(/\/quarterly-report\/4\?q=Q3&division=KM&fy=2026$/);
  });

  it('should never throw when the bus fails', async () => {
    emitEvent.mockRejectedValueOnce(new Error('bus down'));
    await expect(notifyNotApplicable({ report, node, actor, reason: 'x' })).resolves.toBeUndefined();
  });
});

describe('notifyDraftDeleted', () => {
  const removed = { id: 12, plan_node_id: 4, user_id: 8, quarter: 'Q3', fiscal_year: '2026' };

  it('should tell the author when someone else deleted the draft', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 4, code: '1.2.3.1', title: 'EQA', responsible_division_code: 'DHIS' });
    await notifyDraftDeleted({ removed, actor });
    const call = emitEvent.mock.calls[0][0];
    expect(call.eventKey).toBe('activity_report.draft_deleted');
    expect(call.entity).toEqual({ id: 12, owner_user_id: 8, main_division_code: 'DHIS' });
    expect(call.metadata).toMatchObject({ code: '1.2.3.1', division: 'DHIS', by: 'Jane Doe' });
    expect(call.metadata.reportUrl).toMatch(/\/activity-report\/4$/);
  });

  it('should not email the author about their own deletion', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 4, responsible_division_code: 'DHIS' });
    await notifyDraftDeleted({ removed: { ...removed, user_id: 3 }, actor });
    expect(emitEvent.mock.calls[0][0].entity.owner_user_id).toBeNull();
  });

  it('should still notify when the activity row is gone', async () => {
    await notifyDraftDeleted({ removed, actor });
    expect(emitEvent.mock.calls[0][0].entity.main_division_code).toBeNull();
  });
});
