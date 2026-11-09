/* eslint-disable no-restricted-syntax --
 * The string literals here ("Division", "Broad", "Specific", "Outcome", …) are
 * CSV/XLSX column-header labels and report sample data used as test fixtures,
 * not ENTITY_TYPES references (CHARTER §11 CSV-header exception). */
// ── planExportService — NESTED workplan & PIRS row-builder unit tests ──
//
// The builders now load plan_nodes via planHierarchyService and emit a
// preorder, depth-tagged (Level) set of rows: outcome area → indicators →
// activities. We mock loadPlanNodes (the only DB touch) and let the REAL forest
// builders + row mappers run, asserting the nesting, Level column, indented
// titles, node-type labels and the linked-indicator column.

jest.mock('../../src/services/reporting/planHierarchyService', () => {
  const actual = jest.requireActual('../../src/services/reporting/planHierarchyService');
  return { ...actual, loadPlanNodes: jest.fn() };
});

const { PLAN_NODE_TYPES } = require('@rbm/lib/enums');
const { loadPlanNodes } = require('../../src/services/reporting/planHierarchyService');
const {
  buildWorkplanRows,
  buildPirsRows,
  WORKPLAN_HEADERS,
  PIRS_HEADERS,
} = require('../../src/services/reporting/planExportService');

// A small but representative plan_nodes graph:
//   area 1.1
//     └─ T2 indicator 1.1.1 (PH)
//          └─ broad 1.1.1.01 (WD)
//               ├─ specific 1.1.1.01.01 → linked to T3 indicator (WD)
//               └─ specific 1.1.1.01.02 → no linked indicator (orphan)
//     └─ T3 indicator CHSISD.1.1-1 (WD)   ← contributes via the linked specific
const NODES = [
  { id: 1, parent_id: null, node_type: PLAN_NODE_TYPES.OUTCOME_AREA, code: '1.1', title: 'Area one' },
  {
    id: 2, parent_id: 1, node_type: PLAN_NODE_TYPES.OUTCOME_INDICATOR, tier_id: 2,
    code: '1.1.1', indicator_code: 'IND.T2', title: 'T2 indicator', unit: '%', baseline: 10,
    target_y1: 20, q1_target_numeric: 5, q2_target_numeric: null,
    responsible_division_code: 'PH', division_name: 'Public Health',
    contributing_divisions: '["WD","SG"]', status: 'APPROVED',
  },
  {
    id: 3, parent_id: 1, node_type: PLAN_NODE_TYPES.OUTCOME_INDICATOR, tier_id: 3,
    code: 'CHSISD.1.1-1', indicator_code: 'IND.T3', title: 'T3 indicator',
    responsible_division_code: 'WD', division_name: 'Workforce', status: 'APPROVED',
  },
  {
    id: 4, parent_id: 2, node_type: PLAN_NODE_TYPES.BROAD_ACTIVITY, code: '1.1.1.01', title: 'Broad one',
    responsible_division_code: 'WD', division_name: 'Workforce', activity_type: 'Training',
    budget_main: 1000, budget_pass_through: null, budget_total_2026: 1200, status: 'DRAFT',
  },
  {
    id: 5, parent_id: 4, node_type: PLAN_NODE_TYPES.SPECIFIC_ACTIVITY, code: '1.1.1.01.01', title: 'Spec linked',
    responsible_division_code: 'WD', division_name: 'Workforce', linked_indicator_id: 3,
    budget_main: 500, status: 'IN_REVIEW',
  },
  {
    id: 6, parent_id: 4, node_type: PLAN_NODE_TYPES.SPECIFIC_ACTIVITY, code: '1.1.1.01.02', title: 'Spec orphan',
    responsible_division_code: 'WD', division_name: 'Workforce', linked_indicator_id: null,
    budget_main: null, status: 'DRAFT',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  loadPlanNodes.mockResolvedValue(NODES);
});

describe('buildWorkplanRows (nested)', () => {
  it('emits area → T2 → broad → linked T3 → specific, plus orphan specific, in preorder', async () => {
    const rows = await buildWorkplanRows({ fiscalYear: '2026' });

    expect(rows.map((r) => [r.Level, r.Type, r.Code])).toEqual([
      [0, 'Outcome Area', '1.1'],
      [1, 'Outcome Indicator', '1.1.1'],
      [2, 'Broad Activity', '1.1.1.01'],
      [3, 'Short-term Outcome Indicator', 'CHSISD.1.1-1'],
      [4, 'Specific Activity', '1.1.1.01.01'],
      [3, 'Specific Activity', '1.1.1.01.02'],
    ]);
  });

  it('carries budgets only on activity rows and shows the linked indicator code', async () => {
    const rows = await buildWorkplanRows({ fiscalYear: '2026' });
    const broad = rows.find((r) => r.Code === '1.1.1.01');
    const linkedSpec = rows.find((r) => r.Code === '1.1.1.01.01');
    const orphanSpec = rows.find((r) => r.Code === '1.1.1.01.02');
    const area = rows.find((r) => r.Code === '1.1');

    expect(broad['Budget (Main)']).toBe(1000);
    expect(broad['Pass-through']).toBe(''); // null numeric → ''
    expect(area['Budget (Main)']).toBe(''); // header rows have no budget
    expect(linkedSpec['Linked indicator']).toBe('IND.T3');
    expect(linkedSpec['Budget (Main)']).toBe(500);
    expect(orphanSpec['Budget (Main)']).toBe(''); // null → ''
    expect(orphanSpec['Linked indicator']).toBe('');
  });

  it('indents the title by depth so the hierarchy is readable', async () => {
    const rows = await buildWorkplanRows({ fiscalYear: '2026' });
    expect(rows.find((r) => r.Code === '1.1').Title).toBe('Area one');
    expect(rows.find((r) => r.Code === '1.1.1.01.01').Title).toBe(`${'    '.repeat(4)}Spec linked`);
  });

  it('prunes everything when a division filter matches no activities', async () => {
    const rows = await buildWorkplanRows({ fiscalYear: '2026', divFilter: ['ZZ'] });
    expect(rows).toEqual([]);
  });

  it('keeps the area/T2 scaffolding when the division filter matches its activities', async () => {
    const rows = await buildWorkplanRows({ fiscalYear: '2026', divFilter: ['WD'] });
    expect(rows.some((r) => r.Type === 'Outcome Area')).toBe(true);
    expect(rows.some((r) => r.Code === '1.1.1.01.01')).toBe(true);
  });

  it('exposes the canonical 23-column header set led by Level', () => {
    expect(WORKPLAN_HEADERS).toHaveLength(23);
    expect(WORKPLAN_HEADERS[0]).toBe('Level');
    expect(WORKPLAN_HEADERS).toContain('Linked indicator');
  });
});

describe('buildPirsRows (nested)', () => {
  it('lists each area followed by its indicators ordered (tier, code)', async () => {
    const rows = await buildPirsRows({ fiscalYear: '2026' });
    expect(rows.map((r) => [r.Level, r.Tier, r['Indicator code']])).toEqual([
      [0, 'Outcome Area', '1.1'],
      [1, 'Outcome', 'IND.T2'],
      [1, 'Short-term Outcome', 'IND.T3'],
    ]);
  });

  it('maps tier ids to labels and parses contributing divisions JSON', async () => {
    const rows = await buildPirsRows({ fiscalYear: '2026' });
    const t2 = rows.find((r) => r['Indicator code'] === 'IND.T2');
    expect(t2.Division).toBe('Public Health');
    expect(t2['Contributing divisions']).toBe('WD; SG');
    expect(t2['Q1 target']).toBe(5);
    expect(t2['Q2 target']).toBe(''); // null → ''
  });

  it('scopes to the requested division (indicator-level filter)', async () => {
    const rows = await buildPirsRows({ fiscalYear: '2026', divFilter: ['WD'] });
    // Only the WD-owned T3 indicator survives; its area is kept; the PH T2 is dropped.
    expect(rows.map((r) => r['Indicator code'])).toEqual(['1.1', 'IND.T3']);
  });

  it('keeps only the indicators in the given statuses (public API, D-20261026-03)', async () => {
    loadPlanNodes.mockResolvedValueOnce(NODES.map((n) => (n.id === 3 ? { ...n, status: 'DRAFT' } : n)));
    const rows = await buildPirsRows({ fiscalYear: '2026', statuses: ['APPROVED'] });
    expect(rows.map((r) => r['Indicator code'])).toEqual(['1.1', 'IND.T2']);
  });

  it('exposes the canonical 18-column header set led by Level', () => {
    expect(PIRS_HEADERS).toHaveLength(18);
    expect(PIRS_HEADERS[0]).toBe('Level');
    expect(PIRS_HEADERS).toContain('Contributing divisions');
  });
});
