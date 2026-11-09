// ── divisionMergeService tests ──
//
// Pure rules (which fields the target inherits, which report row survives) are
// tested directly. The orchestration is tested against a scripted knex mock:
// no real connection is opened.

const svc = require('../../src/services/divisionMergeService');
const { ORG_LEVEL_TYPES: OLT } = require('@rbm/lib/enums');

describe('buildFillPatch', () => {
  it('should fill only the fields that are empty on the target', () => {
    const from = { code: 'PHC-ID', level_type: OLT.DIVISION, parent_code: 'PHC', responsible_user_id: 265, focal_user_id: 9 };
    const to = { code: 'ID', level_type: null, parent_code: null, responsible_user_id: null, focal_user_id: 28 };
    expect(svc.buildFillPatch(from, to)).toEqual({ level_type: OLT.DIVISION, parent_code: 'PHC', responsible_user_id: 265 });
  });

  it('should never make the target its own parent', () => {
    expect(svc.buildFillPatch({ parent_code: 'ID' }, { code: 'ID', parent_code: null })).toEqual({});
  });
});

describe('pickReportWinner', () => {
  it('should keep the moving row when its status is better', () => {
    expect(svc.pickReportWinner({ status: 'APPROVED' }, { status: 'REJECTED' })).toBe('moving');
  });

  it('should keep the existing target row on a tie', () => {
    expect(svc.pickReportWinner({ status: 'DRAFT' }, { status: 'DRAFT' })).toBe('existing');
  });

  it('should rank unknown statuses lowest', () => {
    expect(svc.pickReportWinner({ status: 'WEIRD' }, { status: 'REJECTED' })).toBe('existing');
  });
});

/**
 * Knex mock: every builder resolves to `rows[table]` for reads and records
 * writes. `leftovers[table]` is the row count UPDATE IGNORE leaves behind.
 */
function makeTrx({ rows = {}, leftovers = {}, fkColumns = [] } = {}) {
  const writes = [];
  const builder = (table) => {
    const state = { table, where: null, op: 'select' };
    const b = {
      // A three-argument where (`col, 'like', pattern`) does not filter.
      where(a, op, v) {
        if (typeof a === 'object') state.where = a;
        else state.where = v === undefined ? { [a]: op } : null;
        return b;
      },
      whereIn() { return b; },
      select() { return b; },
      pluck() { state.op = 'pluck'; return b; },
      count() { state.op = 'count'; return b; },
      first() { state.first = true; return b; },
      insert(p) { writes.push(['insert', table, p]); return Promise.resolve([1]); },
      update(p) { writes.push(['update', table, state.where, p]); return Promise.resolve(1); },
      del() { writes.push(['del', table, state.where]); return Promise.resolve(1); },
      then(resolve, reject) {
        let out;
        if (table === 'information_schema.key_column_usage') out = fkColumns.map(([t, c]) => ({ t, c }));
        else if (state.op === 'count') out = { n: leftovers[table] || 0 };
        else if (state.op === 'pluck') out = [];
        else {
          const list = (rows[table] || []).filter((r) => !state.where
            || Object.entries(state.where).every(([k, v]) => r[k] === v));
          out = state.first ? list[0] : list;
        }
        return Promise.resolve(out).then(resolve, reject);
      },
    };
    return b;
  };
  const trx = jest.fn(builder);
  trx.client = { database: () => 'rbm' };
  trx.schema = { hasColumn: jest.fn(async () => true) };
  trx.raw = jest.fn(async () => [{ affectedRows: 2 }]);
  trx.writes = writes;
  return trx;
}

describe('mergeDivisionCode', () => {
  it('should reject identical or missing codes', async () => {
    await expect(svc.mergeDivisionCode(makeTrx(), { from: 'ID', to: 'ID' })).rejects.toThrow(/two different codes/);
    await expect(svc.mergeDivisionCode(makeTrx(), { from: 'NOPE', to: 'ID' })).rejects.toThrow(/not found/);
  });

  it('should rename by copying the source row and then deleting it', async () => {
    const trx = makeTrx({
      rows: { division_codes: [{ code: 'PHAHM', division_name: 'APPM', division_cbp_id: 12 }] },
      fkColumns: [['users', 'division_code']],
    });
    const out = await svc.mergeDivisionCode(trx, { from: 'PHAHM', to: 'APPM' });
    expect(out.mode).toBe('rename');
    expect(trx.writes).toContainEqual(['insert', 'division_codes', { code: 'APPM', division_name: 'APPM', division_cbp_id: 12 }]);
    // CBP id released on the source first (unique index)
    expect(trx.writes).toContainEqual(['update', 'division_codes', { code: 'PHAHM' }, { division_cbp_id: null }]);
    expect(trx.raw).toHaveBeenCalledWith('UPDATE IGNORE ?? SET ?? = ? WHERE ?? = ?', ['users', 'division_code', 'APPM', 'division_code', 'PHAHM']);
    expect(trx.writes[trx.writes.length - 1]).toEqual(['del', 'division_codes', { code: 'PHAHM' }]);
  });

  it('should rewrite the code inside the secondary divisions of an activity', async () => {
    const trx = makeTrx({
      rows: {
        division_codes: [{ code: 'PHAHM' }],
        plan_nodes: [{ id: 30, secondary_division_codes: '["PHAHM","EPR"]' }],
      },
    });
    const out = await svc.mergeDivisionCode(trx, { from: 'PHAHM', to: 'APPM' });
    expect(trx.writes).toContainEqual(['update', 'plan_nodes', { id: 30 }, { secondary_division_codes: '["APPM","EPR"]' }]);
    expect(out.contribJson).toBe(1);
  });

  it('should drop duplicate user_divisions rows the target already has', async () => {
    const trx = makeTrx({
      rows: { division_codes: [{ code: 'PHC-ID' }, { code: 'ID' }] },
      leftovers: { user_divisions: 1 },
      fkColumns: [['user_divisions', 'division_code']],
    });
    const out = await svc.mergeDivisionCode(trx, { from: 'PHC-ID', to: 'ID' });
    expect(out.mode).toBe('merge');
    expect(out.columns['user_divisions.division_code']).toEqual({ moved: 2, deduped: 1 });
  });

  it('should abort when rows collide on a table that is not dedupe-safe', async () => {
    const trx = makeTrx({
      rows: { division_codes: [{ code: 'PHC-ID' }, { code: 'ID' }] },
      leftovers: { plan_nodes: 3 },
      fkColumns: [['plan_nodes', 'responsible_division_code']],
    });
    await expect(svc.mergeDivisionCode(trx, { from: 'PHC-ID', to: 'ID' })).rejects.toThrow(/plan_nodes.responsible_division_code: 3 row/);
    expect(trx.writes.some(([op, t]) => op === 'del' && t === 'division_codes')).toBe(false);
  });
});
