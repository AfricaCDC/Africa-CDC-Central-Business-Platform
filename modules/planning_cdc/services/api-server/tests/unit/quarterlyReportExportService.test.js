/* eslint-disable no-restricted-syntax --
 * The string literals here ("Division", "Directorate", "Q1 target", …) are
 * CSV/XLSX column-header labels and report sample data used as test fixtures,
 * not ENTITY_TYPES references (CHARTER §11 CSV-header exception). */
// ── quarterlyReportExportService — pure encoder unit tests ──
//
// Covers the deterministic, DB-free parts of the export service: CSV/XLSX
// encoding and header resolution. The DB aggregation (buildQuarterlyReportRows)
// is exercised live (see exportRoutes integration + manual curl) — it needs the
// real schema and is not meaningfully unit-testable against a Knex mock.

const XLSX = require('xlsx');

// knex is globally mocked in tests/setup.js, so requiring the service (which
// pulls in config/db) opens no real connection.
const {
  csvCell,
  toCsv,
  toXlsxBuffer,
  fallbackHeaders,
  headersFor,
} = require('../../src/services/reporting/quarterlyReportExportService');

describe('csvCell formula guard (D-20261108-02)', () => {
  it.each([
    ['=HYPERLINK("http://x","y")', `"'=HYPERLINK(""http://x"",""y"")"`],
    ['+33 6 00', "'+33 6 00"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['-cmd', "'-cmd"],
  ])('should neutralise the formula %s', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it.each([[-5, '-5'], ['-5', '-5'], ['-2.5', '-2.5'], [12, '12'], ['on track', 'on track']])(
    'should leave %p as is', (input, expected) => expect(csvCell(input)).toBe(expected),
  );
});

describe('quarterlyReportExportService encoders', () => {
  const headers = ['Division', 'Q1 target', 'Q1 Narration'];
  const rows = [
    { 'Division': 'Eastern Africa RCC', 'Q1 target': 10, 'Q1 Narration': 'on track' },
    { 'Division': 'West, Central', 'Q1 target': 5, 'Q1 Narration': 'line1\nline2' },
  ];

  describe('toCsv', () => {
    it('should emit a header row followed by one line per row (CRLF)', () => {
      const csv = toCsv(rows, headers);
      const lines = csv.split('\r\n');
      expect(lines[0]).toBe('Division,Q1 target,Q1 Narration');
      expect(lines).toHaveLength(3);
    });

    it('should quote cells containing commas, quotes or newlines', () => {
      const csv = toCsv(rows, headers);
      expect(csv).toContain('"West, Central"');
      expect(csv).toContain('"line1\nline2"');
    });

    it('should render null/undefined cells as empty', () => {
      const csv = toCsv([{ 'Division': null, 'Q1 target': undefined, 'Q1 Narration': '' }], headers);
      expect(csv.split('\r\n')[1]).toBe(',,');
    });
  });

  describe('toXlsxBuffer (styled — exceljs, D-20260713-03)', () => {
    // exceljs workbook generation is CPU-bound and repeatedly blew the 30s
    // global timeout when the pre-push hook runs the backend and frontend
    // suites concurrently — the failure was pure machine load, never a real
    // regression. 60s keeps the assertion meaningful while ending the flake.
    jest.setTimeout(60000);

    it('should produce a parseable workbook: banner, meta, header row 3, data from row 4', async () => {
      const buf = await toXlsxBuffer(rows, headers, 'Q1 2026');
      expect(Buffer.isBuffer(buf)).toBe(true);
      const wb = XLSX.read(buf, { type: 'buffer' });
      expect(wb.SheetNames).toContain('Q1 2026');
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets['Q1 2026'], { header: 1 });
      expect(aoa[0][0]).toBe('Q1 2026');                      // title banner
      expect(String(aoa[1][0])).toContain('generated');       // meta line
      expect(aoa[2]).toEqual(headers);                        // header row
      expect(aoa[3][0]).toBe('Eastern Africa RCC');           // first data row
      expect(aoa).toHaveLength(5); // title + meta + header + 2 rows
    });

    it('should style the header row and stripe alternate data rows', async () => {
      const ExcelJS = require('exceljs');
      const buf = await toXlsxBuffer(rows, headers, 'Styled');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.getWorksheet('Styled');
      const head = ws.getRow(3).getCell(1);
      expect(head.font.bold).toBe(true);
      expect(head.fill.fgColor.argb).toBe('FF14442A');
      expect(ws.getRow(1).getCell(1).fill.fgColor.argb).toBe('FF1A5632'); // banner green
      expect(ws.getRow(5).getCell(1).fill?.fgColor?.argb).toBe('FFF4F7F5'); // zebra on 2nd data row
      expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 3 });
      expect(ws.autoFilter).toBeTruthy();
    });

    it('should truncate a sheet name longer than 31 chars (Excel limit)', async () => {
      const buf = await toXlsxBuffer([], ['A'], 'x'.repeat(40));
      const wb = XLSX.read(buf, { type: 'buffer' });
      expect(wb.SheetNames[0].length).toBeLessThanOrEqual(31);
    });
  });

  describe('fallbackHeaders / headersFor', () => {
    it('should build the canonical 20-column header set for an empty export', () => {
      const h = fallbackHeaders('2026', 'Q2');
      expect(h).toContain('Directorate');
      expect(h).toContain('AHSS Pillar'); // D-20260714-02
      expect(h).toContain('Target 2026');
      expect(h).toContain('Q2 Achievement');
      // Q1-Q4 achievements, then the chosen quarter's narrative (D-20261013-06).
      ['Q1 Achievement', 'Q3 Achievement', 'Q4 Achievement', 'Q2 Narration'].forEach((c) => expect(h).toContain(c));
      expect(h).not.toContain('Q1 Narration');
      expect(h).toHaveLength(20);
    });

    it('headersFor should use row keys when rows exist, else the fallback', () => {
      expect(headersFor(rows, '2026', 'Q1')).toEqual(headers);
      expect(headersFor([], '2026', 'Q1')).toEqual(fallbackHeaders('2026', 'Q1'));
    });
  });
});
