// ── Styled XLSX builder (exceljs) — Africa CDC design (D-20260713-03) ──
//
// ONE builder for EVERY xlsx export in the app (all flows route here via
// routes/reporting/_exportHelpers.sendExport): green title banner,
// generated-at meta line, bold white header on brand green with autofilter,
// frozen panes, zebra striping, thin borders, content-aware column widths.
// Flat design — no rounded corners, Africa CDC green #1A5632 (CLAUDE.md).

'use strict';

const BRAND_GREEN = 'FF1A5632';
const BRAND_GREEN_DARK = 'FF14442A';
const ZEBRA = 'FFF4F7F5';
const BORDER = { style: 'thin', color: { argb: 'FFD9E2DC' } };
const THIN_BORDERS = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

/** Content-aware column width: header vs longest cell, clamped 10..60. */
function columnWidth(header, rows) {
  let max = String(header).length;
  for (const r of rows.slice(0, 200)) {
    const v = r[header];
    if (v !== null && v !== undefined) max = Math.max(max, String(v).length);
  }
  return Math.min(Math.max(max + 2, 10), 60);
}

/**
 * Encode rows to a styled XLSX workbook buffer (one sheet).
 *
 * @param {Array<object>} rows
 * @param {string[]} headers - column order (header row + key order)
 * @param {string} [sheetName='Quarterly Report'] - also used as the banner title
 * @returns {Promise<Buffer>}
 * @example const buf = await toXlsxBuffer(rows, headers, 'Quarterly Report Q2 2026');
 */
async function toXlsxBuffer(rows, headers, sheetName = 'Quarterly Report') {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Africa CDC RBM Platform';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  ws.columns = headers.map((h) => ({ key: h, width: columnWidth(h, rows) }));

  // Row 1 — title banner (merged across all columns).
  const title = ws.addRow([sheetName]);
  ws.mergeCells(1, 1, 1, Math.max(headers.length, 1));
  title.height = 28;
  title.getCell(1).style = {
    font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_GREEN } },
    alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  };

  // Row 2 — meta line.
  const meta = ws.addRow([`Africa CDC RBM Platform — generated ${new Date().toISOString().slice(0, 10)} — ${rows.length} row${rows.length === 1 ? '' : 's'}`]);
  ws.mergeCells(2, 1, 2, Math.max(headers.length, 1));
  meta.getCell(1).style = {
    font: { italic: true, size: 9, color: { argb: 'FF6B7280' } },
    alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  };

  // Row 3 — column headers.
  const head = ws.addRow(headers);
  head.height = 24;
  head.eachCell((cell) => {
    cell.style = {
      font: { bold: true, size: 10, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_GREEN_DARK } },
      alignment: { vertical: 'middle', horizontal: 'left', wrapText: true },
      border: THIN_BORDERS,
    };
  });

  // Data rows — zebra striping, thin borders, numbers right-aligned.
  rows.forEach((r, i) => {
    const row = ws.addRow(headers.map((h) => {
      const v = r[h];
      return v === null || v === undefined ? '' : v;
    }));
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = THIN_BORDERS;
      cell.font = { size: 9.5 };
      cell.alignment = {
        vertical: 'top',
        horizontal: typeof cell.value === 'number' ? 'right' : 'left',
        wrapText: true,
      };
      if (i % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      }
    });
  });

  if (headers.length) {
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: headers.length } };
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

module.exports = { toXlsxBuffer };
