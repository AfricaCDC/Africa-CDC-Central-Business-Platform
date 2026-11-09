// ── services/admin/refdata getMemberStates (D-20261106-06) ──

const db = require('../../src/config/db');
const { getMemberStates } = require('../../src/services/admin/refdata');

describe('getMemberStates', () => {
  it('should return the 55 AU member states by name, without the empty legacy table', async () => {
    const states = await getMemberStates();
    expect(states).toHaveLength(55);
    expect(states[0]).toEqual({ code: 'DZA', name: 'Algeria', region: 'Northern' });
    expect(states.map((s) => s.name)).toEqual([...states.map((s) => s.name)].sort((a, b) => a.localeCompare(b)));
    expect(db).not.toHaveBeenCalledWith('member_states');
  });
});
