// ── Big Tickets Q3 2026 update — extraction and committed snapshot (D-20261015-09) ──

const { _internals: { lineOf, value } } = require('../../src/scripts/extract_big_tickets_2026_q3');
const snapshot = require('../../src/db/data/big_tickets_2026_q3.json');

const row = (cells) => Object.assign(Array(19).fill(''), cells);

describe('extract_big_tickets_2026_q3', () => {
  it('should read the displayed values, with "NA" as empty', () => {
    expect(value('NA')).toBe('');
    expect(value(' n/a ')).toBe('');
    expect(value('71.4%')).toBe('71.4%');
  });

  it('should map a line: revised target and Q2, Q3 value and ratio', () => {
    const shown = row({ 6: '80%', 7: '60%', 10: '60%', 11: '90%', 12: '112.50%', 14: 'Done' });
    const raw = row({ 12: 1.125 });
    expect(lineOf(shown, raw)).toEqual({
      target_2026: '80%', target_2026_numeric: 80, q2_milestone: '60%', q2_milestone_numeric: 60,
      q2_achieved: '60%', q2_achieved_numeric: 60, q3_achieved: '90%', q3_achieved_numeric: 90,
      q3_performance: 1.125, q3_narrative: 'Done',
    });
  });

  it('should keep no number for a "NA" value', () => {
    const line = lineOf(row({ 10: 'NA', 11: 'NA', 12: 'NA' }), row({ 12: 'NA' }));
    expect(line).toMatchObject({ q2_achieved: '', q2_achieved_numeric: null, q3_achieved: '', q3_performance: null });
  });
});

describe('big_tickets_2026_q3.json', () => {
  it('should hold the 42 tickets and 46 lines of Q3 2026 with a known status', () => {
    expect(snapshot).toMatchObject({ fiscal_year: '2026', quarter: 'Q3' });
    expect(snapshot.tickets).toHaveLength(42);
    expect(snapshot.tickets.reduce((n, t) => n + t.lines.length, 0)).toBe(46);
    for (const t of snapshot.tickets) expect(['ON_TRACK', 'ACHIEVED', 'AT_RISK', 'OFF_TRACK']).toContain(t.q3_status);
  });
});
