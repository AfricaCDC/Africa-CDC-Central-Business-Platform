// ── 20261009140000_server_error_alerts migration (live server-error alert) ──
// Runs against the in-memory knex stand-in.

const { makeFakeKnex } = require('../helpers/fakeKnex');
const migration = require('../../src/db/migrations/20261009140000_server_error_alerts');

function setup() {
  const tables = {
    roles: [], notification_events: [], notification_templates: [],
    notification_subscriptions: [], app_settings: [], user_roles: [],
  };
  return { knex: makeFakeKnex(tables), tables };
}

describe('server error alert migration', () => {
  it('should create the role, event, template, subscription and settings', async () => {
    const { knex, tables } = setup();
    await migration.up(knex);
    expect(tables.roles).toEqual([expect.objectContaining({ code: 'TECH_ALERTS', permissions: '[]' })]);
    expect(tables.notification_events[0]).toMatchObject({ event_key: 'system.server_error', is_active: 1 });
    expect(tables.notification_subscriptions[0]).toMatchObject({
      recipient_role: 'TECH_ALERTS', recipient_scope: 'role_all_active', template_key: 'system-server-error',
    });
    expect(tables.app_settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'alerts.server_error.enabled', value: '1' }),
      expect.objectContaining({ key: 'alerts.server_error.repeat_window_min', value: '30' }),
    ]));
  });

  it('should be idempotent', async () => {
    const { knex, tables } = setup();
    await migration.up(knex);
    await migration.up(knex);
    expect(tables.roles).toHaveLength(1);
    expect(tables.notification_subscriptions).toHaveLength(1);
    expect(tables.app_settings).toHaveLength(2);
  });

  it('should remove what it created on down, including role holders', async () => {
    const { knex, tables } = setup();
    await migration.up(knex);
    tables.user_roles.push({ id: 1, user_id: 35, role_id: tables.roles[0].id });
    await migration.down(knex);
    expect(tables.roles).toHaveLength(0);
    expect(tables.user_roles).toHaveLength(0);
    expect(tables.notification_subscriptions).toHaveLength(0);
    expect(tables.app_settings).toHaveLength(0);
  });
});
