// ── Big Tickets import (D-20261015-02): snapshot invariants + BU mapping ──
//
// Pure checks on the committed JSON and the migration helpers. No DB.

const snapshot = require('../../src/db/data/big_tickets_2026.json');
const divisionMap = require('../../src/db/data/big_tickets_division_map.json');
const { _internals } = require('../../src/db/migrations/20261015120000_big_tickets');
const { _internals: extract } = require('../../src/scripts/extract_big_tickets_2026');

const { mapLabels, q2Narrative, splitLabels } = _internals;

describe('big_tickets_2026.json', () => {
  it('should hold the 42 tickets and 46 lines of the consolidation', () => {
    expect(snapshot.tickets).toHaveLength(42);
    expect(snapshot.tickets.reduce((n, t) => n + t.lines.length, 0)).toBe(46);
    expect(new Set(snapshot.tickets.map((t) => t.code)).size).toBe(42);
  });

  it('should map every business-unit label, with a lead division for each ticket', () => {
    for (const t of snapshot.tickets) {
      const labels = [...splitLabels(t.lead_label), ...splitLabels(t.contributors_label)];
      labels.forEach((l) => expect(divisionMap.labels).toHaveProperty([l]));
      expect(mapLabels(t).lead).toBeTruthy();
    }
  });

  it('should only use known progress statuses', () => {
    const allowed = ['ON_TRACK', 'ACHIEVED', 'AT_RISK', 'OFF_TRACK'];
    snapshot.tickets.forEach((t) => expect(allowed).toContain(t.q2_status));
  });
});

describe('mapLabels', () => {
  it('should take the first lead label as lead and the others as contributors', () => {
    const r = mapLabels({ code: 'BT41', lead_label: 'Finance + Human Resources + PRA', contributors_label: 'All BUs' });
    expect(r).toEqual({ lead: 'FMG', contributors: ['HR', 'PRA'], note: 'All BUs' });
  });

  it('should not list the lead among its contributors', () => {
    expect(mapLabels({ code: 'X', lead_label: 'Workforce Division', contributors_label: 'Workforce, PHI' }).contributors).toEqual(['NPHI']);
  });

  it('should throw on a label missing from the map', () => {
    expect(() => mapLabels({ code: 'X', lead_label: 'Nowhere', contributors_label: '' })).toThrow(/missing from big_tickets_division_map/);
  });
});

describe('q2Narrative', () => {
  it('should prefix each line of a multi-line ticket', () => {
    expect(q2Narrative([{ label: 'A', q2_narrative: 'one' }, { label: 'B', q2_narrative: 'two' }])).toBe('A: one\nB: two');
    expect(q2Narrative([{ q2_narrative: 'only' }])).toBe('only');
  });
});

describe('extract helpers', () => {
  it('should read the leading number of a cell, not an enumeration', () => {
    expect(extract.toNumber('1,538 professionals')).toBe(1538);
    expect(extract.toNumber('90% of outbreaks')).toBe(90);
    expect(extract.toNumber('1) 30 MS')).toBeNull();
    expect(extract.toNumber('>95%')).toBeNull();
  });

  it('should find PIRS codes inside the indicator text', () => {
    expect('PR&A.13.1-29 - Percentage'.match(extract.CODE)[1]).toBe('PR&A.13.1-29');
    expect('KM.10.3-3_Number of policy briefs'.match(extract.CODE)[1]).toBe('KM.10.3-3');
  });
});
