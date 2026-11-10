// ── MIS export parser + totals (D-20261015-04) ──
//
// Pure checks: no DB, no file. Rows mimic the MIS layout: a budget row per
// (fund center, fund), GL rows, then a Total row.

const { parseRows } = require('../../src/services/budgetExecution/misParser');
const { totals } = require('../../src/services/budgetExecution/budgetExecutionQuery');
const { suggestActivity } = require('../../src/services/budgetExecution/budgetExecutionLinks');

const HEADER = ['Cost Center', 'Fund center', 'Fund', 'Fund center Text', 'GL Account', 'GL Description', 'Original Budget',
  'Total Released Budget', 'Commitment', 'Actual Expenditure', 'Released Budget balance', 'Released Budget execution (%)',
  'Brough forward Budget from PY', 'Expenditure on Budget Brought Forward'];
// fund center, fund, text, gl, desc, original, released, commitment, actual, bbf, bbfSpent
const row = (fc, fund, text, gl, desc, o, r, c, a, bbf = 0, bbfSpent = 0) => ['', fc, fund, text, gl, desc, o, r, c, a, 0, 0, bbf, bbfSpent];

const VALID = [
  HEADER,
  row('CDC100202MB', 'PB-WDF01', 'Support the domestication', '', '', 1000, 800, 0, 0),
  row('CDC100202MB', 'PB-WDF01', '', '0000512012', 'Travel Ticket.', 0, 0, 100, 200),
  row('CDC100202MB', 'PB-WDF01', '', '0000512013', 'DSA', 0, 0, 50, 150),
  row('CDC100202MB', '', '', 'Total', '', 1000, 800, 150, 350),
  row('CDC100202MB', 'PB-STBF01', 'Support the domestication', '', '', 0, 300, 0, 0, 40, 0),
  row('CDC100202MB', 'PB-STBF01', '', '0000512012', 'Travel Ticket.', 0, 0, 0, 100, 0, 40),
  row('CDC100202MB', '', '', 'Total', '', 0, 300, 0, 100, 40, 40),
];

describe('parseRows', () => {
  it('should read every block: one budget row and the GL rows, Total rows left out', () => {
    const r = parseRows(VALID);
    expect(r.blockCount).toBe(2);
    expect(r.fundCenterCount).toBe(1);
    expect(r.lines).toHaveLength(5);
    expect(r.lines[0]).toMatchObject({ fund_center: 'CDC100202MB', fund: 'PB-WDF01', gl_account: null, released_budget: 800 });
    expect(r.lines[1]).toMatchObject({ gl_account: '0000512012', gl_description: 'Travel Ticket.', committed: 100, spent: 200, fund_center_text: 'Support the domestication' });
  });

  it('should refuse a block that does not match its Total row', () => {
    const broken = VALID.map((r) => [...r]);
    broken[4][9] = 999; // Total actual expenditure
    expect(() => parseRows(broken)).toThrow(/does not add up.*CDC100202MB: spent/);
  });

  it('should refuse a file without the MIS columns', () => {
    expect(() => parseRows([['Name', 'Amount'], ['x', 1]])).toThrow(/missing column\(s\) fund center/);
  });

  it('should refuse an empty export', () => {
    expect(() => parseRows([])).toThrow(/empty/);
    expect(() => parseRows([HEADER])).toThrow(/No budget line/);
  });

  it('should accept the header in any order and amounts written as text', () => {
    const order = [HEADER[1], HEADER[2], HEADER[4], HEADER[7], HEADER[8], HEADER[9]];
    const r = parseRows([order, ['CDC1', 'F1', '', '1,500.50', 0, 0], ['CDC1', 'F1', 'G1', 0, '10', '20'], ['CDC1', '', 'Total', '1500.5', 10, 20]]);
    expect(r.lines.map((l) => [l.released_budget, l.committed, l.spent])).toEqual([[1500.5, 0, 0], [0, 10, 20]]);
  });
});

describe('totals', () => {
  it('should compute the balance and both rates the MIS way', () => {
    const t = totals([{ released_budget: 800, committed: 150, spent: 350 }, { released_budget: 200, committed: 0, spent: 100 }]);
    expect(t).toMatchObject({ released_budget: 1000, committed: 150, spent: 450, balance: 400, execution_pct: 60, spend_pct: 45 });
  });

  it('should give no rate when nothing was released', () => {
    expect(totals([{ released_budget: 0, spent: 20 }])).toMatchObject({ balance: -20, execution_pct: null, spend_pct: null });
    expect(totals([])).toMatchObject({ balance: 0, execution_pct: null });
  });
});

describe('suggestActivity', () => {
  const acts = [
    { id: 1, title: 'Support the domestication and implementation of the strategy' },
    { id: 2, title: 'Support Member States in strengthening infection prevention' },
    { id: 3, title: 'Support Member States in strengthening laboratories' },
  ];

  it('should suggest the only activity starting with the MIS text', () => {
    expect(suggestActivity('Support the domestication and implementa', acts).id).toBe(1);
  });

  it('should not guess when several activities match or the text is too short', () => {
    expect(suggestActivity('Support Member States in strengthening', acts)).toBeNull();
    expect(suggestActivity('Support', acts)).toBeNull();
    expect(suggestActivity(null, acts)).toBeNull();
  });
});
