// ── Division Quarterly Deck (VH-6 / D-2) ──
//
// Renders the D-1 division quarterly summary as a presentation-ready PPTX
// slide deck: cover → overview (completion donut + status breakdown) →
// achievement-by-indicator bar chart → indicators table with coloured status
// pills → narrative. Synchronous, CPU-light via pptxgenjs — the same engine the
// file-generator-service would use, kept in-process for the MVP (ADR-0001).
//
// Reuses summaryReportService so the deck and the XLSX/CSV export never drift.
/* eslint-disable no-restricted-syntax --
 * The flagged literals ('Indicator', 'Code', 'Status', …) are PPTX slide
 * table-header / chart labels (CHARTER §11 CSV/table-header exception), NOT
 * ENTITY_TYPES references. Same category as planExportService. */
'use strict';

const PptxGenJS = require('pptxgenjs');
const { STATUSES } = require('@rbm/lib/enums');
const { getDivisionQuarterlySummary } = require('./summaryReportService');

// ── Palette ──
const GREEN = '1A5632'; // Africa CDC brand
const GREEN_SOFT = 'E7F1EC';
const MINT = 'A7F3D0';
const DARK = '111827';
const GREY = '6B7280';
const LIGHT = 'F3F4F6';
const BORDER = 'E5E7EB';
const WHITE = 'FFFFFF';

// Achievement / status bands → a single colour vocabulary used by both the
// overview breakdown and the per-bar chart colours.
const ACHIEVED = '16A34A'; // ≥100% of quarter target
const ON_TRACK = 'D97706'; // 50–99%
const BEHIND = 'DC2626'; //   <50%
const NEUTRAL = '9CA3AF'; // not reported yet

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const clip = (s, n) => {
  const str = String(s || '');
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
};
const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const pctTxt = (v) => (v === null || v === undefined ? 'N/A' : `${v}%`);

/** Report-status → coloured pill style. Keyed by STATUSES (zero hardcode). */
const STATUS_STYLE = {
  [STATUSES.APPROVED]: { label: 'Approved', fill: 'DCFCE7', color: '166534' },
  [STATUSES.VALIDATED]: { label: 'Validated', fill: 'DCFCE7', color: '166534' },
  [STATUSES.SUBMITTED]: { label: 'Submitted', fill: 'FEF3C7', color: '92400E' },
  [STATUSES.IN_REVIEW]: { label: 'In review', fill: 'FEF3C7', color: '92400E' },
  [STATUSES.DRAFT]: { label: 'Draft', fill: LIGHT, color: '374151' },
  [STATUSES.REJECTED]: { label: 'Rejected', fill: 'FEE2E2', color: '991B1B' },
};
const NOT_STARTED = { label: 'Not started', fill: LIGHT, color: GREY };
const statusStyle = (status) => (status && STATUS_STYLE[status]) || NOT_STARTED;

/** Bucket an indicator by its reporting status (always meaningful, unlike
 *  achievement which needs both a target and an actual). Mirrors the table pills. */
function statusGroup(status) {
  if (!status) return 'not_started';
  if (status === STATUSES.APPROVED || status === STATUSES.VALIDATED) return 'approved';
  if (status === STATUSES.SUBMITTED || status === STATUSES.IN_REVIEW) return 'in_review';
  if (status === STATUSES.REJECTED) return 'rejected';
  return 'draft';
}
const GROUP_ORDER = ['approved', 'in_review', 'draft', 'not_started'];
const GROUP_META = {
  approved: { label: 'Approved', color: ACHIEVED },
  in_review: { label: 'In review', color: ON_TRACK },
  draft: { label: 'Draft', color: NEUTRAL },
  not_started: { label: 'Not started', color: 'CBD5E1' },
  rejected: { label: 'Rejected', color: BEHIND },
};

/** Cover slide. */
function addCover(pres, s) {
  const slide = pres.addSlide();
  slide.background = { color: GREEN };
  // accent rule
  slide.addShape('rect', { x: 0.6, y: 2.55, w: 2.2, h: 0.08, fill: { color: MINT } });
  slide.addText('Division Quarterly Summary', { x: 0.6, y: 1.6, w: 12.1, h: 0.9, fontSize: 34, bold: true, color: WHITE });
  slide.addText(s.division.name || s.division.code, { x: 0.6, y: 2.75, w: 12.1, h: 0.7, fontSize: 22, color: WHITE });
  slide.addText(`${s.quarter} · FY${s.fiscal_year}`, { x: 0.6, y: 3.5, w: 12.1, h: 0.5, fontSize: 16, color: MINT });
  if (s.division.directorate) {
    slide.addText(s.division.directorate, { x: 0.6, y: 4.05, w: 12.1, h: 0.4, fontSize: 12, color: MINT });
  }
  slide.addText('Africa CDC — Results-Based Management', { x: 0.6, y: 6.9, w: 12, h: 0.3, fontSize: 10, color: MINT });
}

/** One KPI card with a coloured top accent. */
function addKpiCard(slide, { x, label, value, sub, accent }) {
  const w = 2.95;
  slide.addShape('rect', { x, y: 1.15, w, h: 1.55, fill: { color: WHITE }, line: { color: BORDER, width: 1 } });
  slide.addShape('rect', { x, y: 1.15, w, h: 0.08, fill: { color: accent } });
  slide.addText(label.toUpperCase(), { x: x + 0.18, y: 1.32, w: w - 0.3, h: 0.35, fontSize: 9, bold: true, color: GREY, charSpacing: 1 });
  slide.addText(String(value), { x: x + 0.18, y: 1.68, w: w - 0.3, h: 0.6, fontSize: 30, bold: true, color: DARK });
  slide.addText(sub, { x: x + 0.18, y: 2.32, w: w - 0.3, h: 0.32, fontSize: 9, color: GREY });
}

/** Slide title bar (white-bg content slides). */
function addHeader(slide, title) {
  slide.addText(title, { x: 0.6, y: 0.35, w: 12.1, h: 0.55, fontSize: 22, bold: true, color: GREEN });
  slide.addShape('rect', { x: 0.6, y: 0.92, w: 12.1, h: 0.02, fill: { color: BORDER } });
}

/** Overview slide: KPI cards + completion donut + status breakdown. */
function addOverview(pres, s) {
  const slide = pres.addSlide();
  addHeader(slide, 'Overview');
  const k = s.kpis;
  [
    { label: 'Owned indicators', value: k.total_indicators, sub: `${k.reported_count} reported`, accent: GREEN },
    { label: 'Completion', value: `${k.completion_pct}%`, sub: `${k.approved_count} approved`, accent: ACHIEVED },
    { label: 'Achievement', value: pctTxt(k.achievement_pct), sub: 'avg vs quarter target', accent: ON_TRACK },
    { label: 'Indicators shown', value: s.indicators.length, sub: 'owned + contributed', accent: NEUTRAL },
  ].forEach((c, i) => addKpiCard(slide, { ...c, x: 0.6 + i * 3.13 }));

  // Completion donut (reported vs not reported of owned indicators).
  const total = k.total_indicators;
  const reported = k.reported_count;
  if (total > 0) {
    slide.addText('Reporting completion', { x: 0.6, y: 3.1, w: 5.8, h: 0.4, fontSize: 13, bold: true, color: DARK });
    slide.addChart(
      pres.ChartType.doughnut,
      [{ name: 'Completion', labels: ['Reported', 'Not reported'], values: [reported, Math.max(total - reported, 0)] }],
      {
        x: 0.6, y: 3.5, w: 5.7, h: 3.4, holeSize: 62,
        chartColors: [ACHIEVED, BORDER], showLegend: true, legendPos: 'b', legendFontSize: 10,
        showValue: false, dataLabelColor: WHITE, showTitle: false, chartArea: { fill: { color: WHITE } },
      },
    );
    // % in the hole
    slide.addText(`${k.completion_pct}%`, { x: 1.55, y: 4.55, w: 3.0, h: 0.7, fontSize: 26, bold: true, color: DARK, align: 'center' });
  } else {
    slide.addText('No owned indicator for this division and period.', { x: 0.6, y: 3.6, w: 5.7, h: 0.5, fontSize: 11, italic: true, color: GREY });
  }

  // Status breakdown legend with counts (rejected only shown when present).
  const counts = s.indicators.reduce((acc, ind) => { const g = statusGroup(ind.status); acc[g] = (acc[g] || 0) + 1; return acc; }, {});
  const groups = [...GROUP_ORDER, ...(counts.rejected ? ['rejected'] : [])];
  slide.addText('Indicators by status', { x: 6.9, y: 3.1, w: 5.8, h: 0.4, fontSize: 13, bold: true, color: DARK });
  groups.forEach((key, i) => {
    const y = 3.65 + i * 0.62;
    const m = GROUP_META[key];
    slide.addShape('rect', { x: 6.9, y: y + 0.05, w: 0.28, h: 0.28, fill: { color: m.color } });
    slide.addText(m.label, { x: 7.35, y, w: 4.0, h: 0.4, fontSize: 12, color: DARK });
    slide.addText(String(counts[key] || 0), { x: 11.3, y, w: 1.4, h: 0.4, fontSize: 14, bold: true, color: m.color, align: 'right' });
  });
}

/** Achievement-by-indicator horizontal bar chart (reported indicators only). */
function addAchievementChart(pres, s) {
  const reported = s.indicators.filter((i) => i.achievement_pct !== null && i.achievement_pct !== undefined).slice(0, 12);
  const slide = pres.addSlide();
  addHeader(slide, 'Achievement by indicator');
  if (reported.length === 0) {
    slide.addText('No indicator has been reported yet for this period — nothing to chart.', {
      x: 0.6, y: 3.2, w: 12.1, h: 0.6, fontSize: 13, italic: true, color: GREY, align: 'center',
    });
    return;
  }
  slide.addChart(
    pres.ChartType.bar,
    [{ name: 'Achievement %', labels: reported.map((i) => clip(i.code || i.title, 16)), values: reported.map((i) => i.achievement_pct) }],
    {
      x: 0.6, y: 1.2, w: 12.1, h: 5.6, barDir: 'bar',
      chartColors: [GREEN], showValue: true, dataLabelColor: DARK, dataLabelFontSize: 9, dataLabelPosition: 'outEnd',
      catAxisLabelColor: DARK, catAxisLabelFontSize: 9, valAxisLabelColor: GREY, valAxisLabelFontSize: 9,
      valAxisMinVal: 0, valGridLine: { color: BORDER }, showLegend: false, showTitle: false,
      valAxisTitle: 'Achievement (% of quarter target)', showValAxisTitle: true, valAxisTitleFontSize: 9, valAxisTitleColor: GREY,
    },
  );
}

/** Indicators table with coloured status pills. */
function addIndicatorsTable(pres, s) {
  const slide = pres.addSlide();
  addHeader(slide, 'Indicators');
  const head = ['Code', 'Indicator', 'Role', 'Target', 'Actual', 'Achv %', 'Status'].map((t) => ({
    text: t, options: { bold: true, color: WHITE, fill: { color: GREEN }, fontSize: 9, valign: 'middle' },
  }));
  const rows = s.indicators.slice(0, 13).map((i, idx) => {
    const st = statusStyle(i.status);
    const zebra = idx % 2 === 1 ? { color: GREEN_SOFT } : { color: WHITE };
    return [
      { text: clip(i.code, 16), options: { fontSize: 8, fill: zebra } },
      { text: clip(i.title, 50), options: { fontSize: 8, fill: zebra } },
      { text: i.role === 'OWNER' ? 'Owner' : 'Contributor', options: { fontSize: 8, fill: zebra } },
      { text: fmt(i.quarter_target), options: { fontSize: 8, align: 'center', fill: zebra } },
      { text: fmt(i.actual_value), options: { fontSize: 8, align: 'center', fill: zebra } },
      { text: pctTxt(i.achievement_pct), options: { fontSize: 8, align: 'center', bold: true, fill: zebra } },
      { text: st.label, options: { fontSize: 8, align: 'center', bold: true, color: st.color, fill: { color: st.fill } } },
    ];
  });
  slide.addTable([head, ...rows], {
    x: 0.6, y: 1.15, w: 12.1, colW: [1.5, 4.7, 1.4, 1.05, 1.05, 1.1, 1.3],
    border: { type: 'solid', color: BORDER, pt: 0.5 }, valign: 'middle', rowH: 0.32,
  });
  if (s.indicators.length > 13) {
    slide.addText(`+ ${s.indicators.length - 13} more — see the XLSX/CSV export`, { x: 0.6, y: 7.05, w: 12, h: 0.3, fontSize: 9, italic: true, color: GREY });
  }
}

/** Activity reports of the quarter, one row each — only when the unit filed some. */
function addActivityReports(pres, activities) {
  const slide = pres.addSlide();
  addHeader(slide, 'Activity reports');
  const head = ['Code', 'Activity', 'Status', 'Achievements'].map((t) => ({
    text: t, options: { bold: true, color: WHITE, fill: { color: GREEN }, fontSize: 9, valign: 'middle' },
  }));
  const rows = activities.slice(0, 12).map((a, idx) => {
    const zebra = idx % 2 === 1 ? { color: GREEN_SOFT } : { color: WHITE };
    return [
      { text: clip(a.code, 16), options: { fontSize: 8, fill: zebra } },
      { text: clip(a.title, 60), options: { fontSize: 8, fill: zebra } },
      { text: statusStyle(a.status).label, options: { fontSize: 8, fill: zebra } },
      { text: clip(a.achievements || '', 140), options: { fontSize: 8, fill: zebra } },
    ];
  });
  slide.addTable([head, ...rows], {
    x: 0.6, y: 1.15, w: 12.1, colW: [1.5, 4.2, 1.3, 5.1],
    border: { type: 'solid', color: BORDER, pt: 0.5 }, valign: 'middle',
  });
  if (activities.length > 12) {
    slide.addText(`+ ${activities.length - 12} more on the platform`, { x: 0.6, y: 7.05, w: 12, h: 0.3, fontSize: 9, italic: true, color: GREY });
  }
}

/**
 * Build the division quarterly summary as a presentation-ready PPTX buffer.
 *
 * @param {{ divisionCode: string, fiscalYear: string|number, quarter: string }} params
 * @returns {Promise<{ buffer: Buffer, filename: string, mime: string }>}
 * @throws {Error} when the summary build or PPTX render fails
 * @example
 * const { buffer, filename } = await buildDivisionQuarterlyDeck({ divisionCode: 'MIS', fiscalYear: '2026', quarter: 'Q1' });
 */
async function buildDivisionQuarterlyDeck({ divisionCode, fiscalYear, quarter }) {
  const summary = await getDivisionQuarterlySummary({ divisionCode, fiscalYear, quarter });

  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'Africa CDC RBM';
  pres.title = `${summary.division.code} ${summary.quarter} FY${summary.fiscal_year} summary`;

  addCover(pres, summary);
  addOverview(pres, summary);
  addAchievementChart(pres, summary);
  addIndicatorsTable(pres, summary);
  if (summary.activities.length) addActivityReports(pres, summary.activities);

  const buffer = await pres.write({ outputType: 'nodebuffer' });
  return {
    buffer,
    filename: `division-summary-${summary.division.code}-${summary.fiscal_year}-${summary.quarter}.pptx`,
    mime: PPTX_MIME,
  };
}

module.exports = { buildDivisionQuarterlyDeck, PPTX_MIME };
