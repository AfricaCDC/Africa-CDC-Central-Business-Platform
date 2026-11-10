// ── governanceService unit tests ──
//
// Focus: the approval/reject/inbox flows. Everything flows through the
// auto-mocked `knex` chain via `config/db.js`.

const governanceService = require('../../src/services/governanceService');
const db = require('../../src/config/db');

function resetChain() {
  const c = db.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
}

beforeEach(() => {
  resetChain();
});

describe('governanceService.markRead / markAllRead', () => {
  it('markRead should scope the update to one notification of the caller (D-20261108-02)', async () => {
    await governanceService.markRead(42, 7);
    expect(db.__chain.where).toHaveBeenCalledWith({ id: 42, user_id: 7 });
    expect(db.__chain.update).toHaveBeenCalledWith({ is_read: true });
  });

  it('markAllRead should scope to the user AND only unread rows', async () => {
    await governanceService.markAllRead(7);
    expect(db.__chain.where).toHaveBeenCalledWith({
      user_id: 7,
      is_read: false,
    });
  });
});

// ─────────────────────────────────────────────────────────────────
//   governanceService.getApprovals — extra filters
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
//   governanceService.decideStep — additional branches
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
//   getInbox / getMyDrafts
// ─────────────────────────────────────────────────────────────────
describe('governanceService.getInbox', () => {
  it('should scope the query to the current user as PENDING approver on IN_REVIEW instances', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await governanceService.getInbox(7);
    const whereCalls = db.__chain.where.mock.calls;
    expect(whereCalls).toContainEqual(['approval_steps.approver_id', 7]);
    expect(whereCalls).toContainEqual(['approval_steps.decision', 'PENDING']);
    // status filter — should be IN_REVIEW
    const statusCall = whereCalls.find((c) => c[0] === 'approval_instances.status');
    expect(statusCall).toBeDefined();
    expect(statusCall[1]).toBe('IN_REVIEW');
  });

  it('should call distinct() to dedupe rows', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await governanceService.getInbox(7);
    expect(db.__chain.distinct).toHaveBeenCalled();
  });

  it('should select every column it orders by, as MySQL 8 requires with DISTINCT', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await governanceService.getInbox(7);
    expect(db.__chain.orderBy).toHaveBeenCalledWith('approval_instances.updated_at', 'desc');
    const selected = db.__chain.select.mock.calls.at(-1);
    for (const [column] of db.__chain.orderBy.mock.calls) expect(selected).toContain(column);
  });
});

describe('governanceService.getMyDrafts', () => {
  it('should scope to (initiated_by_id, status=DRAFT)', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await governanceService.getMyDrafts(7);
    expect(db.__chain.where).toHaveBeenCalledWith({
      initiated_by_id: 7,
      status: 'DRAFT',
    });
  });
});

// ─────────────────────────────────────────────────────────────────
//   getAuditEvents — filter combinations
// ─────────────────────────────────────────────────────────────────
describe('governanceService.getAuditEvents', () => {
  it('should default the limit to 25 when not provided', async () => {
    db.__chain.first.mockResolvedValueOnce({ cnt: 0 });
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await governanceService.getAuditEvents();
    expect(db.__chain.limit).toHaveBeenCalledWith(25);
  });

  it('should respect a custom limit', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await governanceService.getAuditEvents({ limit: 25 });
    expect(db.__chain.limit).toHaveBeenCalledWith(25);
  });

  it('should apply entity_type, entity_id, and actor_id filters when provided', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await governanceService.getAuditEvents({
      entity_type: 'plan_node',
      entity_id: 42,
      actor_id: 7,
    });
    const whereCalls = db.__chain.where.mock.calls;
    expect(whereCalls).toContainEqual(['audit_events.entity_type', 'plan_node']);
    expect(whereCalls).toContainEqual(['audit_events.entity_id', 42]);
    expect(whereCalls).toContainEqual(['audit_events.actor_id', 7]);
  });

  it('should not call where for filters that are absent', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    db.__chain.where.mockClear();
    await governanceService.getAuditEvents({ limit: 50 });
    // Only the join's implicit where (none) — no entity/actor filters
    const filterCalls = db.__chain.where.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].startsWith('audit_events.')
    );
    expect(filterCalls).toHaveLength(0);
  });

  it('should always order by timestamp desc', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await governanceService.getAuditEvents();
    expect(db.__chain.orderBy).toHaveBeenCalledWith('audit_events.timestamp', 'desc');
  });
});

// ─────────────────────────────────────────────────────────────────
//   Snapshots / Notifications / logEvent / createNotification
// ─────────────────────────────────────────────────────────────────

describe('governanceService.getNotifications', () => {
  it('should scope to the user and limit to 50', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await governanceService.getNotifications(7);
    expect(db.__chain.where).toHaveBeenCalledWith('user_id', 7);
    expect(db.__chain.limit).toHaveBeenCalledWith(50);
    expect(db.__chain.orderBy).toHaveBeenCalledWith('created_at', 'desc');
  });
});

