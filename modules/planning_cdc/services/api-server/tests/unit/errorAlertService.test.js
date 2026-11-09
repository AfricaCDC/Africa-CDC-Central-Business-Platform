// ── errorAlertService tests ──
// Live 5xx alert: one grouped email, who / page / input / error, deduped per
// window. DB, settings and resolvers are mocked; no real connection.

jest.mock('../../src/services/settingsService', () => ({ getBool: jest.fn(), getInt: jest.fn() }));
jest.mock('../../src/services/notificationResolvers', () => ({ resolveRecipients: jest.fn() }));
jest.mock('../../src/config/db', () => {
  const state = { inserts: [], subs: [], users: [] };
  const builder = (table) => {
    const q = { table, single: false };
    const b = {
      join: () => b, where: () => b, whereIn: () => b, whereNotNull: () => b, select: () => b,
      first: () => { q.single = true; return b; },
      insert: (row) => { state.inserts.push({ table, row }); return Promise.resolve([1]); },
      then: (resolve, reject) => {
        let out = [];
        if (table === 'notification_subscriptions') out = state.subs;
        if (table === 'users') out = q.single ? state.users.find((u) => u.id === 7) : state.users;
        return Promise.resolve(out).then(resolve, reject);
      },
    };
    return b;
  };
  const db = jest.fn(builder);
  db.__state = state;
  return db;
});

const db = require('../../src/config/db');
const settings = require('../../src/services/settingsService');
const { resolveRecipients } = require('../../src/services/notificationResolvers');
const svc = require('../../src/services/errorAlertService');

const details = (overrides = {}) => ({
  method: 'POST', path: '/api/reporting/indicator-division-reports', status: 500, duration_ms: 36,
  body: { plan_node_id: 6130, actual_value: '', password: '***REDACTED***' },
  error: "Incorrect decimal value: '' for column 'actual_value'",
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  svc.resetForTests();
  db.__state.inserts = [];
  db.__state.subs = [{ id: 40, recipient_scope: 'role_all_active', recipient_role: 'TECH_ALERTS' }];
  db.__state.users = [
    { id: 7, email: 'abayak@africacdc.org', first_name: 'Kofi', last_name: 'Abaya' },
    { id: 35, email: 'kibiyed@africacdc.org' },
    { id: 88, email: 'andrewa@africacdc.org' },
  ];
  settings.getBool.mockResolvedValue(true);
  settings.getInt.mockResolvedValue(30);
  // Real shape of notificationResolvers.resolveRecipients.
  resolveRecipients.mockResolvedValue({ userIds: [35, 88], error: null });
});

const outbox = () => db.__state.inserts.filter((i) => i.table === 'notification_outbox').map((i) => i.row);

describe('notifyServerError', () => {
  it('should queue one grouped email with the user, route, input and error', async () => {
    await expect(svc.notifyServerError({ reqUser: { id: 7 }, details: details(), ip: '1.2.3.4' })).resolves.toBe(true);
    const [row] = outbox();
    expect(outbox()).toHaveLength(1);
    expect(row.subject).toBe('[RBM] Error 500 · POST /api/reporting/indicator-division-reports · Kofi Abaya');
    const payload = JSON.parse(row.payload);
    expect(payload.template_key).toBe('system-server-error');
    expect(payload.actor).toMatchObject({ id: 7, name: 'Kofi Abaya', email: 'abayak@africacdc.org' });
    expect(payload.error).toMatchObject({ status: 500, body: { plan_node_id: 6130 }, repeated: 0 });
    expect(payload.error.message).toMatch(/Incorrect decimal value/);
    expect(payload.client.ip).toBe('1.2.3.4');
  });

  it('should send the same error for the same user only once per window and count repeats', async () => {
    await svc.notifyServerError({ reqUser: { id: 7 }, details: details() });
    await svc.notifyServerError({ reqUser: { id: 7 }, details: details() });
    await svc.notifyServerError({ reqUser: { id: 7 }, details: details({ path: '/api/reporting/indicator-division-reports' }) });
    expect(outbox()).toHaveLength(1);
  });

  it('should alert again for a different user or a different error', async () => {
    await svc.notifyServerError({ reqUser: { id: 7 }, details: details() });
    await svc.notifyServerError({ reqUser: { id: 9 }, details: details() });
    await svc.notifyServerError({ reqUser: { id: 7 }, details: details({ error: 'other' }) });
    expect(outbox()).toHaveLength(3);
  });

  it('should report how many repeats were swallowed once the window has passed', () => {
    const now = 1_000_000;
    expect(svc.shouldAlert('sig', now, 60000)).toBe(0);
    expect(svc.shouldAlert('sig', now + 1000, 60000)).toBeNull();
    expect(svc.shouldAlert('sig', now + 2000, 60000)).toBeNull();
    expect(svc.shouldAlert('sig', now + 61000, 60000)).toBe(2);
  });

  it('should do nothing when disabled', async () => {
    settings.getBool.mockResolvedValue(false);
    await expect(svc.notifyServerError({ reqUser: { id: 7 }, details: details() })).resolves.toBe(false);
    expect(outbox()).toHaveLength(0);
  });

  it('should do nothing when nobody holds the alert role', async () => {
    resolveRecipients.mockResolvedValue({ userIds: [], error: null });
    await expect(svc.notifyServerError({ reqUser: { id: 7 }, details: details() })).resolves.toBe(false);
  });

  it('should never throw when the database fails', async () => {
    settings.getBool.mockRejectedValue(new Error('db down'));
    await expect(svc.notifyServerError({ reqUser: null, details: details() })).resolves.toBe(false);
  });

  it('should collapse numeric ids in the route', () => {
    expect(svc.normalizePath('/api/reports/12/submit?x=1')).toBe('/api/reports/:id/submit');
  });
});
