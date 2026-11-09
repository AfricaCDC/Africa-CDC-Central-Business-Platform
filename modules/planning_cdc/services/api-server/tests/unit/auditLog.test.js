/* eslint-disable no-restricted-syntax --
 * P-31: these are DB column-enum WIRE values in test fixtures/assertions
 * (plan_nodes.node_type = 'SPECIFIC_ACTIVITY'/'BROAD_ACTIVITY'/'OUTCOME_INDICATOR', etc.;
 * workplan_items.item_type = 'ACTIVITY'/'TASK'), NOT ENTITY_TYPES identifiers.
 * Literal wire values are intentional in tests so a column-enum rename is caught
 * by a failing test instead of masked by importing the enum. Mirrors the source
 * plan-nodes route files which carry the same documented P-31 exception.
 */
// ── auditLog unit tests ──
//
// Covers: audit(), extractIp(), extractUserAgent()

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

const { audit } = require('../../src/middleware/auditLog');
const chain = sharedDb.__chain;

function resetChain() {
  chain.insert.mockReset().mockResolvedValue([1]);
  chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  ['where', 'select'].forEach((m) => {
    if (chain[m]) chain[m].mockClear().mockReturnValue(chain);
  });
}

beforeEach(() => {
  resetChain();
});

describe('audit()', () => {
  it('inserts an audit row with actor from req.user', async () => {
    const req = {
      user: { id: 42 },
      headers: { 'user-agent': 'TestAgent/1.0' },
      ip: '127.0.0.1',
    };
    await audit(req, 'LOGIN', 'user', 1, { method: 'password' });
    expect(chain.insert).toHaveBeenCalledTimes(1);
    const row = chain.insert.mock.calls[0][0];
    expect(row.actor_id).toBe(42);
    expect(row.action).toBe('LOGIN');
    expect(row.entity_type).toBe('user');
    expect(row.entity_id).toBe(1);
    expect(row.ip_address).toBe('127.0.0.1');
    expect(row.user_agent).toBe('TestAgent/1.0');
  });

  it('uses overrideActorId when provided', async () => {
    const req = { user: { id: 1 }, headers: {}, ip: null };
    await audit(req, 'FORCE_LOGOUT', 'user', 5, null, 99);
    const row = chain.insert.mock.calls[0][0];
    expect(row.actor_id).toBe(99);
  });

  it('sets actor_id to null when req has no user', async () => {
    const req = { headers: {} };
    await audit(req, 'SYSTEM_EVENT', 'system', null, null);
    const row = chain.insert.mock.calls[0][0];
    expect(row.actor_id).toBeNull();
  });

  it('handles null req gracefully', async () => {
    await expect(audit(null, 'EVENT', 'system', null)).resolves.toBeUndefined();
    expect(chain.insert).toHaveBeenCalledTimes(1);
    const row = chain.insert.mock.calls[0][0];
    expect(row.ip_address).toBeNull();
    expect(row.actor_id).toBeNull();
  });

  it('stores non-numeric entityId in details.entity_code and sets entity_id to null', async () => {
    const req = { user: { id: 1 }, headers: {} };
    await audit(req, 'UPDATE', 'division', 'DCM', { foo: 'bar' });
    const row = chain.insert.mock.calls[0][0];
    expect(row.entity_id).toBeNull();
    const details = JSON.parse(row.details);
    expect(details.entity_code).toBe('DCM');
    expect(details.foo).toBe('bar');
  });

  it('stores numeric entityId directly', async () => {
    const req = { user: { id: 1 }, headers: {} };
    await audit(req, 'DELETE', 'plan_node', 77, null);
    const row = chain.insert.mock.calls[0][0];
    expect(row.entity_id).toBe(77);
  });

  it('defaults entity_type to "system" when not provided', async () => {
    const req = { user: { id: 1 }, headers: {} };
    await audit(req, 'EVENT');
    const row = chain.insert.mock.calls[0][0];
    expect(row.entity_type).toBe('system');
  });

  it('truncates action longer than 100 chars', async () => {
    const req = { user: { id: 1 }, headers: {} };
    const longAction = 'A'.repeat(150);
    await audit(req, longAction);
    const row = chain.insert.mock.calls[0][0];
    expect(row.action.length).toBe(100);
  });

  it('does not throw when DB insert fails (fire-and-forget)', async () => {
    chain.insert.mockRejectedValueOnce(new Error('DB down'));
    const req = { user: { id: 1 }, headers: {} };
    await expect(audit(req, 'EVENT', 'system')).resolves.toBeUndefined();
  });

  it('ignores a client-supplied x-forwarded-for and keeps req.ip (D-20261108-02)', async () => {
    const req = {
      user: { id: 1 },
      headers: { 'x-forwarded-for': '6.6.6.6, 41.0.0.9' },
      ip: '41.0.0.9', // what express resolves through the trusted proxies
    };
    await audit(req, 'EVENT', 'system');
    const row = chain.insert.mock.calls[0][0];
    expect(row.ip_address).toBe('41.0.0.9');
  });

  it('falls back to req.ip when no x-forwarded-for', async () => {
    const req = { user: { id: 1 }, headers: {}, ip: '192.168.1.1' };
    await audit(req, 'EVENT', 'system');
    const row = chain.insert.mock.calls[0][0];
    expect(row.ip_address).toBe('192.168.1.1');
  });

  it('falls back to connection.remoteAddress when no req.ip', async () => {
    const req = {
      user: { id: 1 },
      headers: {},
      ip: null,
      connection: { remoteAddress: '172.16.0.1' },
    };
    await audit(req, 'EVENT', 'system');
    const row = chain.insert.mock.calls[0][0];
    expect(row.ip_address).toBe('172.16.0.1');
  });

  it('stores null details when metadata is null', async () => {
    const req = { user: { id: 1 }, headers: {} };
    await audit(req, 'EVENT', 'system', 1, null);
    const row = chain.insert.mock.calls[0][0];
    expect(row.details).toBeNull();
  });

  it('JSON stringifies metadata object', async () => {
    const req = { user: { id: 1 }, headers: {} };
    await audit(req, 'EVENT', 'system', 1, { key: 'value', n: 42 });
    const row = chain.insert.mock.calls[0][0];
    expect(JSON.parse(row.details)).toEqual({ key: 'value', n: 42 });
  });
});