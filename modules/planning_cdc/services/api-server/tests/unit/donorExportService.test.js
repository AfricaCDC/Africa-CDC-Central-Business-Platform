// ── donorExportService — donor (funding/grant) export filtering unit tests ──
//
// buildDonorRows loads plan_nodes via loadPlanNodes (the only DB touch, mocked
// here) and flattens broad/specific activities matching a funding source / grant
// + an optional division scope. We assert the filtering + row mapping.

jest.mock('../../src/services/reporting/planHierarchyService', () => {
  const actual = jest.requireActual('../../src/services/reporting/planHierarchyService');
  return { ...actual, loadPlanNodes: jest.fn() };
});

const { PLAN_NODE_TYPES } = require('@rbm/lib/enums');
const { loadPlanNodes } = require('../../src/services/reporting/planHierarchyService');
const { buildDonorRows, DONOR_HEADERS } = require('../../src/services/reporting/donorExportService');

// A mix of activity and non-activity nodes, two funding sources + one grant,
// across two divisions, including a blank-funding activity (excluded by default).
const NODES = [
  { id: 1, node_type: PLAN_NODE_TYPES.OUTCOME_AREA, code: '1.1', title: 'Area' },
  {
    id: 2, node_type: PLAN_NODE_TYPES.BROAD_ACTIVITY, code: '1.1.1.01', title: 'Broad JP',
    responsible_division_code: 'WD', division_name: 'Workforce',
    primary_funding_source: 'Japan Funds', grant_name: '', budget_main: 1000, budget_total_2026: 1200, status: 'DRAFT',
  },
  {
    id: 3, node_type: PLAN_NODE_TYPES.SPECIFIC_ACTIVITY, code: '1.1.1.01.01', title: 'Spec JP',
    responsible_division_code: 'WD', division_name: 'Workforce',
    primary_funding_source: ' japan funds ', grant_name: 'GAVI-001', budget_main: 500, status: 'IN_REVIEW',
  },
  {
    id: 4, node_type: PLAN_NODE_TYPES.SPECIFIC_ACTIVITY, code: '1.1.1.01.02', title: 'Spec WB',
    responsible_division_code: 'PH', division_name: 'Public Health',
    primary_funding_source: 'World Bank', grant_name: '', budget_main: 700, status: 'DRAFT',
  },
  {
    id: 5, node_type: PLAN_NODE_TYPES.SPECIFIC_ACTIVITY, code: '1.1.1.01.03', title: 'Spec none',
    responsible_division_code: 'WD', division_name: 'Workforce',
    primary_funding_source: '', grant_name: '', budget_main: 0, status: 'DRAFT',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  loadPlanNodes.mockResolvedValue(NODES);
});

describe('buildDonorRows', () => {
  it('filters by funding source case-insensitively and trims whitespace', async () => {
    const rows = await buildDonorRows({ fiscalYear: '2026', fundingSource: 'Japan Funds' });
    expect(rows.map((r) => r.Code)).toEqual(['1.1.1.01', '1.1.1.01.01']);
    expect(rows.every((r) => /japan funds/i.test(r['Funding source']))).toBe(true);
  });

  it('filters by grant when no funding source is given', async () => {
    const rows = await buildDonorRows({ fiscalYear: '2026', grant: 'gavi-001' });
    expect(rows.map((r) => r.Code)).toEqual(['1.1.1.01.01']);
  });

  it('returns all funded activities (excluding blank funding) when no filter is given', async () => {
    const rows = await buildDonorRows({ fiscalYear: '2026' });
    // node 5 has blank funding → excluded; the area (non-activity) is never included.
    expect(rows.map((r) => r.Code)).toEqual(['1.1.1.01', '1.1.1.01.01', '1.1.1.01.02']);
  });

  it('applies the division scope filter on the owner division code', async () => {
    const rows = await buildDonorRows({ fiscalYear: '2026', divFilter: ['PH'] });
    expect(rows.map((r) => r.Code)).toEqual(['1.1.1.01.02']);
    expect(rows[0].Division).toBe('Public Health');
  });

  it('maps budget/type/status cells and exposes the canonical header set', async () => {
    const rows = await buildDonorRows({ fiscalYear: '2026', fundingSource: 'Japan Funds' });
    const broad = rows.find((r) => r.Code === '1.1.1.01');
    expect(broad.Type).toBe('Broad Activity');
    expect(broad['Budget (Main)']).toBe(1000);
    expect(broad['Total 2026']).toBe(1200);
    expect(broad.Status).toBe('DRAFT');
    expect(DONOR_HEADERS[0]).toBe('Type');
    expect(DONOR_HEADERS).toContain('Funding source');
  });
});
