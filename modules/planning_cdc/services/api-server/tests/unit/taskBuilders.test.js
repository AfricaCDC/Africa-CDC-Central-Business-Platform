// ── taskBuilders unit tests ──
//
// Covers: fetchPendingSpecificActivities, buildSaReviewTask,
//         buildSaRejectedTasks, buildReportReviewTask,
//         buildOwnershipDisputesTask,
//         buildNotificationTasks, sortTasks

jest.mock('../../src/services/reporting/reviewQueueReminders', () => ({ collectPendingReviews: jest.fn() }));

const db = require('../../src/config/db');
const { collectPendingReviews } = require('../../src/services/reporting/reviewQueueReminders');
const chain = db.__chain;

// Reset chain before each test
function resetChain() {
  chain.first.mockReset().mockResolvedValue(undefined);
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.update.mockReset().mockResolvedValue(1);
  chain.del.mockReset().mockResolvedValue(1);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['select', 'where', 'whereIn', 'whereNotNull', 'whereNull', 'orderBy',
    'leftJoin', 'join', 'limit', 'andWhere'].forEach((m) => {
    if (chain[m]) chain[m].mockReset().mockReturnValue(chain);
    else chain[m] = jest.fn().mockReturnValue(chain);
  });
}

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
});

const svc = require('../../src/routes/me/taskBuilders');

// ── fetchPendingSpecificActivities ────────────────────────────────────────────
describe('fetchPendingSpecificActivities()', () => {
  it('should fetch all IN_REVIEW specific activities when seeAll=true', async () => {
    const rows = [{ id: 1, code: 'SA.01', title: 'Activity 1', submitted_at: '2026-01-01' }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const result = await svc.fetchPendingSpecificActivities({ seeAll: true, respDivs: [] });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
  });

  it('should filter by respDivs when seeAll=false', async () => {
    const rows = [{ id: 2, code: 'SA.02', title: 'Activity 2', submitted_at: '2026-02-01' }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const result = await svc.fetchPendingSpecificActivities({ seeAll: false, respDivs: ['DCM'] });
    expect(Array.isArray(result)).toBe(true);
    // whereIn should have been called with respDivs
    expect(chain.whereIn).toHaveBeenCalledWith('responsible_division_code', ['DCM']);
  });

  it('should return empty array when no rows', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const result = await svc.fetchPendingSpecificActivities({ seeAll: true, respDivs: [] });
    expect(result).toEqual([]);
  });
});

// ── buildSaReviewTask ─────────────────────────────────────────────────────────
describe('buildSaReviewTask()', () => {
  it('should return null when rows is empty', () => {
    const result = svc.buildSaReviewTask([]);
    expect(result).toBeNull();
  });

  it('should return single activity task with correct grammar', () => {
    const rows = [{ id: 1, code: 'SA.01', title: 'My Activity', submitted_at: '2026-01-01' }];
    const task = svc.buildSaReviewTask(rows);
    expect(task).toBeTruthy();
    expect(task.count).toBe(1);
    expect(task.title).toContain('1 specific activity is');
    expect(task.type).toBe('specific_activity_review');
  });

  it('should return plural text for multiple activities', () => {
    const rows = [
      { id: 1, code: 'SA.01', title: 'A1', submitted_at: '2026-01-01' },
      { id: 2, code: 'SA.02', title: 'A2', submitted_at: '2026-01-02' },
    ];
    const task = svc.buildSaReviewTask(rows);
    expect(task.count).toBe(2);
    expect(task.title).toContain('2 specific activities are');
    // Description shows first 3 codes
    expect(task.description).toContain('SA.01');
  });

  it('should include oldest submitted_at as created_at', () => {
    const rows = [
      { id: 1, code: 'SA.01', title: 'A1', submitted_at: '2026-01-05' },
      { id: 2, code: 'SA.02', title: 'A2', submitted_at: '2026-01-01' }, // oldest
    ];
    const task = svc.buildSaReviewTask(rows);
    // oldest = last element
    expect(task.created_at).toBe('2026-01-01');
  });
});

// ── buildSaRejectedTasks ──────────────────────────────────────────────────────
describe('buildSaRejectedTasks()', () => {
  it('should return empty array when no rejected activities', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const result = await svc.buildSaRejectedTasks(7);
    expect(result).toEqual([]);
  });

  it('should return task with rejection reason', async () => {
    const rows = [{ id: 1, code: 'SA.01', title: 'Act 1', rejection_reason: 'Incomplete', reviewed_at: '2026-01-01' }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const result = await svc.buildSaRejectedTasks(7);
    expect(result.length).toBe(1);
    expect(result[0].description).toContain('Reason: Incomplete');
    expect(result[0].severity).toBe('warning');
  });

  it('should use default description when no rejection_reason', async () => {
    const rows = [{ id: 2, code: 'SA.02', title: 'Act 2', rejection_reason: null, reviewed_at: null }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const result = await svc.buildSaRejectedTasks(7);
    expect(result[0].description).toContain('Open the activity');
  });
});

// ── buildReportReviewTask ─────────────────────────────────────────────────────
describe('buildReportReviewTask()', () => {
  it('should return null when no report waits for the user', async () => {
    collectPendingReviews.mockResolvedValueOnce([]);
    expect(await svc.buildReportReviewTask(7)).toBeNull();
    expect(collectPendingReviews).toHaveBeenCalledWith({ userId: 7 });
  });

  it('should count each pending step once, latest first in the description', async () => {
    collectPendingReviews.mockResolvedValueOnce([
      { step_id: 1, type: 'Indicator report', code: 'EPR.1.1-1', quarter: 'Q2', fiscal_year: '2026', since: '2026-07-01' },
      { step_id: 2, type: 'Activity report', code: '1.2.3.01', quarter: 'Q3', fiscal_year: '2026', since: '2026-10-02' },
      { step_id: 2, type: 'Activity report', code: '1.2.3.01', quarter: 'Q3', fiscal_year: '2026', since: '2026-10-02' },
    ]);
    const task = await svc.buildReportReviewTask(7);
    expect(task).toMatchObject({ count: 2, title: '2 reports awaiting your decision', created_at: '2026-07-01', href: '/review-submissions' });
    expect(task.description).toBe('Latest: Activity report 1.2.3.01 Q3 2026');
  });

  it('should use singular grammar for 1 report', async () => {
    collectPendingReviews.mockResolvedValueOnce([{ step_id: 3, type: 'Indicator report', since: '2026-07-01' }]);
    expect((await svc.buildReportReviewTask(7)).title).toBe('1 report awaiting your decision');
  });
});

// ── buildOwnershipDisputesTask ────────────────────────────────────────────────
describe('buildOwnershipDisputesTask()', () => {
  it('should return null when no disputes', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const result = await svc.buildOwnershipDisputesTask();
    expect(result).toBeNull();
  });

  it('should return dispute task with count and description', async () => {
    const rows = [
      { id: 1, plan_node_id: 10, code: 'BA.01', title: 'Activity 1', flagged_by: 'John Doe', created_at: '2026-01-01' },
      { id: 2, plan_node_id: 11, code: 'BA.02', title: 'Activity 2', flagged_by: null, created_at: '2026-01-02' },
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const result = await svc.buildOwnershipDisputesTask();
    expect(result.count).toBe(2);
    expect(result.description).toContain('BA.01');
    expect(result.description).toContain('flagged by John Doe');
  });

  it('should use singular grammar for 1 dispute', async () => {
    const rows = [{ id: 1, plan_node_id: 10, code: 'BA.01', title: 'A1', flagged_by: 'Alice', created_at: '2026-01-01' }];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const result = await svc.buildOwnershipDisputesTask();
    expect(result.title).toContain('1 ownership dispute to resolve');
  });

  // D-20260818-01: several NA reports can exist for the same activity now
  // that the (plan_node_id, quarter, fiscal_year) unique key is gone. The
  // task counts disputed ACTIVITIES, not rows.
  it('should count distinct activities, not rows, when one activity has several NA reports', async () => {
    const rows = [
      { id: 1, plan_node_id: 10, code: 'BA.01', title: 'A1', flagged_by: 'Alice', created_at: '2026-01-02' },
      { id: 2, plan_node_id: 10, code: 'BA.01', title: 'A1', flagged_by: 'Bob', created_at: '2026-01-01' },
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const result = await svc.buildOwnershipDisputesTask();
    expect(result.count).toBe(1);
    expect(result.title).toContain('1 ownership dispute to resolve');
  });

  it('should count two activities when NA reports span two plan nodes', async () => {
    const rows = [
      { id: 1, plan_node_id: 10, code: 'BA.01', title: 'A1', flagged_by: 'Alice', created_at: '2026-01-03' },
      { id: 2, plan_node_id: 10, code: 'BA.01', title: 'A1', flagged_by: 'Bob', created_at: '2026-01-02' },
      { id: 3, plan_node_id: 11, code: 'BA.02', title: 'A2', flagged_by: 'Carol', created_at: '2026-01-01' },
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const result = await svc.buildOwnershipDisputesTask();
    expect(result.count).toBe(2);
    expect(result.title).toContain('2 ownership disputes to resolve');
  });
});

// ── buildNotificationTasks ────────────────────────────────────────────────────
describe('buildNotificationTasks()', () => {
  it('should return empty array when no unread notifications', async () => {
    chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    const result = await svc.buildNotificationTasks(7);
    expect(result).toEqual([]);
  });

  it('should return notification tasks with action severity for activity_report', async () => {
    const rows = [
      { id: 1, message: 'Report needs review', entity_type: 'activity_report', entity_id: 5, created_at: '2026-01-01' },
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const result = await svc.buildNotificationTasks(7);
    expect(result.length).toBe(1);
    expect(result[0].severity).toBe('action');
    expect(result[0].type).toBe('notification');
  });

  it('should return info severity for non-activity_report entity type', async () => {
    const rows = [
      { id: 2, message: 'System update', entity_type: 'general', entity_id: null, created_at: '2026-01-02' },
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const result = await svc.buildNotificationTasks(7);
    expect(result[0].severity).toBe('info');
  });

  it('should truncate long messages to 120 chars', async () => {
    const longMsg = 'A'.repeat(200);
    const rows = [
      { id: 3, message: longMsg, entity_type: 'general', entity_id: null, created_at: '2026-01-03' },
    ];
    chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
    const result = await svc.buildNotificationTasks(7);
    expect(result[0].title.length).toBe(120);
  });
});

// ── sortTasks ─────────────────────────────────────────────────────────────────
describe('sortTasks()', () => {
  it('should sort by severity then by created_at (descending)', () => {
    const tasks = [
      { severity: 'info', created_at: '2026-01-01' },
      { severity: 'action', created_at: '2026-01-02' },
      { severity: 'warning', created_at: '2026-01-03' },
    ];
    svc.sortTasks(tasks);
    expect(tasks[0].severity).toBe('action');
    expect(tasks[1].severity).toBe('warning');
    expect(tasks[2].severity).toBe('info');
  });

  it('should sort same-severity tasks by created_at descending', () => {
    const tasks = [
      { severity: 'action', created_at: '2026-01-01' },
      { severity: 'action', created_at: '2026-01-05' },
    ];
    svc.sortTasks(tasks);
    expect(tasks[0].created_at).toBe('2026-01-05');
  });

  it('should handle null created_at (treated as 0)', () => {
    const tasks = [
      { severity: 'action', created_at: null },
      { severity: 'action', created_at: '2026-01-01' },
    ];
    svc.sortTasks(tasks);
    expect(tasks[0].created_at).toBe('2026-01-01');
  });
});
