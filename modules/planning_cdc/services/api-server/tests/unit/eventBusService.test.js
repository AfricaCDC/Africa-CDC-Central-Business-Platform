// ── eventBusService.emitEvent — fan-out & outbox unit tests ──
//
// Covers the behavioural contract of the notification wizard event bus:
//   - happy path: matched subscription → outbox row + audit row
//   - empty / no-match short-circuits without inserting outbox rows
//   - invalid eventKey returns zeros without touching the DB
//   - resolver failure writes WORKFLOW_EVENT_RESOLVER_FAILED audit and
//     never propagates the error
//   - dedup collapses (user_id, channel, template_key) across subscriptions
//   - channel='both' expands to one email row + one in-app row per user
//
// All DB calls flow through the shared knex mock from tests/setup.js.
// `notificationResolvers.resolveRecipients` is jest-mocked so we control
// recipient lists per test without exercising the resolver registry here
// (covered separately in notificationResolvers.test.js).

const resolveRecipients = jest.fn();
jest.mock('../../src/services/notificationResolvers', () => ({
  resolveRecipients: (...args) => resolveRecipients(...args),
}));

const db = require('../../src/config/db');
const { emitEvent } = require('../../src/services/eventBusService');

function resetChain() {
  const c = db.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
}

// Program the next two `await chain` resolutions in order:
//   1st await → subscriptions list (from fetchActiveSubscriptions)
//   2nd await → users list (from loadUserMap)
function programThens(...resultsInOrder) {
  resultsInOrder.forEach((rows) => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));
  });
}

beforeEach(() => {
  resetChain();
  resolveRecipients.mockReset();
});

describe('emitEvent — invalid eventKey', () => {
  it('returns zeros and inserts nothing when eventKey is null', async () => {
    const result = await emitEvent({ eventKey: null });
    expect(result).toEqual({ matched: 0, recipients: 0, outboxRows: 0 });
    expect(db.__chain.insert).not.toHaveBeenCalled();
    expect(resolveRecipients).not.toHaveBeenCalled();
  });

  it('returns zeros for empty string eventKey', async () => {
    const result = await emitEvent({ eventKey: '' });
    expect(result).toEqual({ matched: 0, recipients: 0, outboxRows: 0 });
  });

  it('returns zeros for non-string eventKey', async () => {
    const result = await emitEvent({ eventKey: 42 });
    expect(result).toEqual({ matched: 0, recipients: 0, outboxRows: 0 });
  });
});

describe('emitEvent — no matching subscriptions', () => {
  it('returns zeros without invoking the resolver', async () => {
    programThens([]); // fetchActiveSubscriptions → []

    const result = await emitEvent({
      eventKey: 'plan_node.submitted',
      entity: { id: 1 },
      actor: { id: 7 },
    });

    expect(result).toEqual({ matched: 0, recipients: 0, outboxRows: 0 });
    expect(resolveRecipients).not.toHaveBeenCalled();
    expect(db.__chain.insert).not.toHaveBeenCalled();
  });
});

describe('emitEvent — happy path', () => {
  it('inserts one outbox row and one audit row when a subscription matches', async () => {
    const sub = {
      id: 11,
      event_key: 'plan_node.submitted',
      recipient_role: null,
      recipient_scope: 'entity_owner',
      channel: 'email',
      template_key: 'plan-node-submitted',
      priority: 10,
    };
    programThens(
      [sub], // subscriptions
      [{ id: 42, email: 'owner@x.com', first_name: 'O', last_name: 'Wn' }], // users
    );
    resolveRecipients.mockResolvedValueOnce({ userIds: [42], error: null });

    const result = await emitEvent({
      eventKey: 'plan_node.submitted',
      entity: { id: 9, entity_type: 'PLAN_NODE' },
      actor: { id: 7, email: 'actor@x.com' },
      metadata: { period_label: 'Q2' },
      correlationId: 'trace-1',
    });

    expect(result).toEqual({ matched: 1, recipients: 1, outboxRows: 1 });

    // Two inserts: outbox + audit
    expect(db.__chain.insert).toHaveBeenCalledTimes(2);
    const outboxCall = db.__chain.insert.mock.calls[0][0];
    expect(outboxCall).toHaveLength(1);
    expect(outboxCall[0]).toMatchObject({
      event_key: 'plan_node.submitted',
      subscription_id: 11,
      recipient_user_id: 42,
      recipient: 'owner@x.com',
      channel: 'email',
      status: 'queued',
      correlation_id: 'trace-1',
    });
    const payload = JSON.parse(outboxCall[0].payload);
    expect(payload.template_key).toBe('plan-node-submitted');
    expect(payload.metadata).toEqual({ period_label: 'Q2' });
    expect(payload.actor).toEqual({ id: 7, email: 'actor@x.com' });

    const auditCall = db.__chain.insert.mock.calls[1][0];
    expect(auditCall).toMatchObject({
      actor_user_id: 7,
      action: 'WORKFLOW_EVENT_EMITTED',
      entity_type: 'PLAN_NODE',
      entity_id: 9,
    });
    expect(JSON.parse(auditCall.metadata)).toMatchObject({
      event_key: 'plan_node.submitted',
      matched_subscription_ids: [11],
      recipient_count: 1,
      outbox_rows: 1,
    });
  });

  it('skips email channel when the resolved user has no email address', async () => {
    const sub = {
      id: 12,
      recipient_scope: 'entity_owner',
      channel: 'email',
      template_key: 't',
      priority: 1,
    };
    programThens(
      [sub],
      [{ id: 50, email: null, first_name: 'X', last_name: 'Y' }],
    );
    resolveRecipients.mockResolvedValueOnce({ userIds: [50], error: null });

    const result = await emitEvent({ eventKey: 'evt.x', entity: {} });

    expect(result).toEqual({ matched: 1, recipients: 1, outboxRows: 0 });
    // Only the audit row is inserted (outbox skipped because rows.length === 0)
    const inserts = db.__chain.insert.mock.calls;
    expect(inserts).toHaveLength(1);
    expect(inserts[0][0].action).toBe('WORKFLOW_EVENT_EMITTED');
  });
});

describe('emitEvent — resolver failure', () => {
  it('writes a RESOLVER_FAILED audit row and does not throw', async () => {
    const sub = {
      id: 13,
      recipient_scope: 'unknown_scope',
      channel: 'email',
      template_key: 't',
      priority: 1,
    };
    programThens([sub]);
    resolveRecipients.mockResolvedValueOnce({
      userIds: [],
      error: 'UNKNOWN_RESOLVER:unknown_scope',
    });

    const result = await emitEvent({
      eventKey: 'evt.x',
      entity: { id: 1 },
      actor: { id: 7 },
    });

    expect(result).toEqual({ matched: 0, recipients: 0, outboxRows: 0 });
    // One insert: the RESOLVER_FAILED audit. No outbox row, no EMITTED audit.
    const inserts = db.__chain.insert.mock.calls;
    expect(inserts).toHaveLength(1);
    expect(inserts[0][0]).toMatchObject({
      actor_user_id: 7,
      action: 'WORKFLOW_EVENT_RESOLVER_FAILED',
      entity_type: 'NOTIFICATION_SUBSCRIPTION',
      entity_id: 13,
    });
    expect(JSON.parse(inserts[0][0].metadata)).toMatchObject({
      eventKey: 'evt.x',
      error: 'UNKNOWN_RESOLVER:unknown_scope',
      scope: 'unknown_scope',
    });
  });

  it('still records the matched subscription when resolver returns an empty list', async () => {
    const sub = {
      id: 14,
      recipient_scope: 'entity_owner',
      channel: 'email',
      template_key: 't',
      priority: 1,
    };
    programThens([sub]);
    resolveRecipients.mockResolvedValueOnce({ userIds: [], error: null });

    const result = await emitEvent({ eventKey: 'evt.x', entity: {} });

    expect(result).toEqual({ matched: 0, recipients: 0, outboxRows: 0 });
    // No inserts at all — empty userIds short-circuits before any audit.
    expect(db.__chain.insert).not.toHaveBeenCalled();
  });
});

describe('emitEvent — dedup and channel expansion', () => {
  it('dedupes (user_id, channel, template_key) across subscriptions', async () => {
    const subA = {
      id: 21, recipient_scope: 'entity_owner', channel: 'email',
      template_key: 'shared-template', priority: 1,
    };
    const subB = {
      id: 22, recipient_scope: 'entity_responsible', channel: 'email',
      template_key: 'shared-template', priority: 2,
    };
    programThens(
      [subA, subB],
      [{ id: 33, email: 'u@x.com', first_name: 'U', last_name: 'Z' }],
    );
    // Both subs resolve to the same user → only one outbox row should land.
    resolveRecipients
      .mockResolvedValueOnce({ userIds: [33], error: null })
      .mockResolvedValueOnce({ userIds: [33], error: null });

    const result = await emitEvent({ eventKey: 'evt.x', entity: {} });

    expect(result).toEqual({ matched: 2, recipients: 1, outboxRows: 1 });
    const outboxCall = db.__chain.insert.mock.calls[0][0];
    expect(outboxCall).toHaveLength(1);
    expect(outboxCall[0].subscription_id).toBe(21); // first wins
  });

  it('expands channel="both" to email + in_app rows', async () => {
    const sub = {
      id: 31, recipient_scope: 'entity_owner', channel: 'both',
      template_key: 't', priority: 1,
    };
    programThens(
      [sub],
      [{ id: 44, email: 'u@x.com', first_name: 'U', last_name: 'Z' }],
    );
    resolveRecipients.mockResolvedValueOnce({ userIds: [44], error: null });

    const result = await emitEvent({ eventKey: 'evt.x', entity: {} });

    expect(result).toEqual({ matched: 1, recipients: 2, outboxRows: 2 });
    const outboxCall = db.__chain.insert.mock.calls[0][0];
    const channels = outboxCall.map((r) => r.channel).sort();
    expect(channels).toEqual(['email', 'in_app']);
    const inAppRow = outboxCall.find((r) => r.channel === 'in_app');
    expect(inAppRow.recipient).toBe('user:44');
  });
});

describe('emitEvent — resilience', () => {
  it('does not throw when subscription lookup fails', async () => {
    db.__chain.then.mockImplementationOnce((_resolve, reject) =>
      reject(new Error('db down')));
    const result = await emitEvent({ eventKey: 'evt.x' });
    expect(result).toEqual({ matched: 0, recipients: 0, outboxRows: 0 });
    // No outbox or audit insert should be attempted.
    expect(db.__chain.insert).not.toHaveBeenCalled();
  });

  it('returns matched count even when outbox insert fails', async () => {
    const sub = {
      id: 41, recipient_scope: 'entity_owner', channel: 'email',
      template_key: 't', priority: 1,
    };
    programThens(
      [sub],
      [{ id: 55, email: 'u@x.com', first_name: 'U', last_name: 'Z' }],
    );
    resolveRecipients.mockResolvedValueOnce({ userIds: [55], error: null });
    // First insert (outbox) rejects; second (audit) succeeds.
    db.__chain.insert
      .mockReset()
      .mockRejectedValueOnce(new Error('outbox down'))
      .mockResolvedValue([1]);

    const result = await emitEvent({ eventKey: 'evt.x', entity: {} });

    expect(result).toEqual({ matched: 1, recipients: 1, outboxRows: 0 });
  });
});
