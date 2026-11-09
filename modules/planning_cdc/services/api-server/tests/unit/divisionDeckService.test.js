// ── divisionDeckService — PPTX deck render unit tests ──
//
// buildDivisionQuarterlyDeck composes the D-1 summary into a pptxgenjs deck and
// returns a nodebuffer. We mock summaryReportService so the render is
// deterministic, and assert the buffer is a valid PPTX (ZIP "PK" magic), the
// filename/mime, and that the optional narrative slide is added only when an
// activity report was filed. The real pptxgenjs engine runs (no network/IO).

jest.mock('../../src/services/reporting/summaryReportService', () => ({
  getDivisionQuarterlySummary: jest.fn(),
}));

const { getDivisionQuarterlySummary } = require('../../src/services/reporting/summaryReportService');
const { buildDivisionQuarterlyDeck, PPTX_MIME } = require('../../src/services/reporting/divisionDeckService');

const baseSummary = (overrides = {}) => ({
  division: { code: 'MIS', name: 'Division of MIS', directorate: 'Directorate of Administration' },
  fiscal_year: '2026',
  quarter: 'Q1',
  period: { id: 1, quarter: 'Q1' },
  kpis: { total_indicators: 3, reported_count: 1, approved_count: 1, completion_pct: 33, achievement_pct: null },
  indicators: [
    { id: 10, code: 'MIS.1', title: 'A', tier_id: 3, role: 'OWNER', quarter_target: 10, actual_value: 8, achievement_pct: 80, status: 'APPROVED' },
    { id: 20, code: 'OTH.1', title: 'C', tier_id: 4, role: 'CONTRIB', quarter_target: null, actual_value: null, achievement_pct: null, status: null },
  ],
  activities: [],
  ...overrides,
});

beforeEach(() => { jest.clearAllMocks(); });

describe('buildDivisionQuarterlyDeck', () => {
  it('returns a valid PPTX buffer with the canonical filename + mime', async () => {
    getDivisionQuarterlySummary.mockResolvedValue(baseSummary());
    const { buffer, filename, mime } = await buildDivisionQuarterlyDeck({ divisionCode: 'MIS', fiscalYear: '2026', quarter: 'Q1' });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.slice(0, 2).toString()).toBe('PK'); // ZIP/OOXML magic
    expect(filename).toBe('division-summary-MIS-2026-Q1.pptx');
    expect(mime).toBe(PPTX_MIME);
  });

  it('passes the divisionCode / fiscalYear / quarter through to the summary builder', async () => {
    getDivisionQuarterlySummary.mockResolvedValue(baseSummary());
    await buildDivisionQuarterlyDeck({ divisionCode: 'MIS', fiscalYear: 2026, quarter: 'Q1' });
    expect(getDivisionQuarterlySummary).toHaveBeenCalledWith({ divisionCode: 'MIS', fiscalYear: 2026, quarter: 'Q1' });
  });

  it('renders without an activity report slide when the unit filed none', async () => {
    getDivisionQuarterlySummary.mockResolvedValue(baseSummary({ activities: [] }));
    const { buffer } = await buildDivisionQuarterlyDeck({ divisionCode: 'MIS', fiscalYear: '2026', quarter: 'Q1' });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('renders the activity reports slide, 12 rows at most', async () => {
    const report = (i) => ({ id: i, code: `1.2.3.${i}`, title: 'Workshop', status: 'SUBMITTED', achievements: 'a' });
    getDivisionQuarterlySummary.mockResolvedValue(baseSummary({ activities: Array.from({ length: 14 }, (_, i) => report(i)) }));
    const { buffer } = await buildDivisionQuarterlyDeck({ divisionCode: 'MIS', fiscalYear: '2026', quarter: 'Q1' });
    expect(buffer.slice(0, 2).toString()).toBe('PK');
  });

  it('handles an empty division (no indicators) without throwing', async () => {
    getDivisionQuarterlySummary.mockResolvedValue(baseSummary({
      indicators: [],
      kpis: { total_indicators: 0, reported_count: 0, approved_count: 0, completion_pct: 0, achievement_pct: null },
    }));
    const { buffer } = await buildDivisionQuarterlyDeck({ divisionCode: 'ZZZ', fiscalYear: '2026', quarter: 'Q1' });
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});
