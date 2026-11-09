// ── AMERT FY2027 snapshot + division map ──
//
// The committed JSON is the contract between the extractor and the load
// migration. These tests pin its invariants so a regenerated snapshot that
// drifted cannot reach production unnoticed.

const snapshot = require('../../src/db/data/amert_2027_proposal.json');
const divisionMap = require('../../src/db/data/amert_2027_division_map.json');

const GRAND_TOTAL = 105563940;
const round2 = (n) => Math.round(n * 100) / 100;
const sum = (rows) => round2(rows.reduce((t, r) => t + Number(r.budget.total_2027 || 0), 0));

describe('snapshot volumes', () => {
  it('should hold exactly one project outcome', () => {
    expect(snapshot.outcome).toBeDefined();
    expect(typeof snapshot.outcome.title).toBe('string');
  });

  it.each([
    ['outcome_indicators', 7],
    ['outputs', 13],
    ['output_indicators', 54],
    ['activities', 115],
    ['costing_lines', 1050],
  ])('should hold %i %s', (key, expected) => {
    expect(snapshot[key]).toHaveLength(expected);
  });
});

describe('budget integrity', () => {
  it.each(['outcome_indicators', 'outputs', 'output_indicators', 'activities'])(
    'should roll %s up to the grand total',
    (key) => {
      expect(sum(snapshot[key])).toBe(GRAND_TOTAL);
    },
  );

  it('should roll the costing lines up to the grand total', () => {
    const total = round2(snapshot.costing_lines.reduce((t, l) => t + Number(l.amount_2027 || 0), 0));
    expect(total).toBe(GRAND_TOTAL);
  });

  it('should make every activity equal the sum of its own costing lines', () => {
    // Compared with a tolerance, not for equality: these are binary floats, and
    // rounding the running total at each line is itself a source of drift.
    const byActivity = new Map();
    for (const line of snapshot.costing_lines) {
      byActivity.set(line.activity_code, (byActivity.get(line.activity_code) || 0) + Number(line.amount_2027 || 0));
    }
    const mismatched = snapshot.activities
      .filter((a) => Math.abs((byActivity.get(a.code) || 0) - Number(a.budget.total_2027 || 0)) > 0.005)
      .map((a) => a.code);
    expect(mismatched).toEqual([]);
  });
});

describe('hierarchy', () => {
  it('should give every output a known parent indicator', () => {
    const codes = new Set(snapshot.outcome_indicators.map((i) => i.code));
    expect(snapshot.outputs.filter((o) => !codes.has(o.outcome_indicator_code))).toEqual([]);
  });

  it('should give every output indicator a known parent output', () => {
    const codes = new Set(snapshot.outputs.map((o) => o.code));
    expect(snapshot.output_indicators.filter((i) => !codes.has(i.output_code))).toEqual([]);
  });

  it('should give every activity a known parent output indicator', () => {
    const codes = new Set(snapshot.output_indicators.map((i) => i.code));
    expect(snapshot.activities.filter((a) => !codes.has(a.output_indicator_code))).toEqual([]);
  });

  it('should keep every code unique within its level', () => {
    for (const key of ['outcome_indicators', 'outputs', 'output_indicators', 'activities']) {
      const codes = snapshot[key].map((r) => r.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });
});

describe('the unbudgeted indicator (D1)', () => {
  it('should carry exactly one unbudgeted outcome indicator', () => {
    const flagged = snapshot.outcome_indicators.filter((i) => i.unbudgeted);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].code).toBe('7');
  });

  it('should give it a zero budget', () => {
    const orphan = snapshot.outcome_indicators.find((i) => i.unbudgeted);
    expect(Number(orphan.budget.total_2027)).toBe(0);
  });

  it('should hang no output off it, so no activity can be planned against it', () => {
    const orphan = snapshot.outcome_indicators.find((i) => i.unbudgeted);
    expect(snapshot.outputs.filter((o) => o.outcome_indicator_code === orphan.code)).toEqual([]);
  });
});

describe('division map', () => {
  it('should be signed off by a human', () => {
    expect(divisionMap.reviewed_by).toBeTruthy();
  });

  it('should cover every label the snapshot uses, verbatim', () => {
    const mapped = new Set(divisionMap.mappings.map((m) => m.label));
    const missing = snapshot.division_labels.filter((l) => !mapped.has(l));
    expect(missing).toEqual([]);
  });

  it('should carry no label the snapshot does not use', () => {
    const used = new Set(snapshot.division_labels);
    expect(divisionMap.mappings.filter((m) => !used.has(m.label)).map((m) => m.label)).toEqual([]);
  });

  it('should resolve every activity to a mapping entry', () => {
    const mapped = new Set(divisionMap.mappings.map((m) => m.label));
    const unresolved = snapshot.activities
      .filter((a) => a.responsible_division_raw && !mapped.has(a.responsible_division_raw))
      .map((a) => a.code);
    expect(unresolved).toEqual([]);
  });

  it('should justify every arbitrated mapping with a note', () => {
    const undocumented = divisionMap.mappings
      .filter((m) => ['arbitrated', 'confirmed'].includes(m.basis) && !m.note)
      .map((m) => m.label);
    expect(undocumented).toEqual([]);
  });
});
