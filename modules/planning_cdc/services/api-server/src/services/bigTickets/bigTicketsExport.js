// ── Big Tickets — Excel export in the shape of PR&A's consolidation (D-20261015-10) ──
//
// One row per indicator line of every ticket running in the year: identity,
// target and milestones of the year, achieved value of each quarter, then the
// chosen quarter's performance, status, narration, challenges and next steps,
// and the business units. Sent through routes/reporting/_exportHelpers.sendExport
// (the shared styled xlsx builder).

'use strict';

const db = require('../../config/db');
const { BIG_TICKET_PROGRESS_CONFIG, STATUSES } = require('@rbm/lib/enums');

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
// Work in progress of a business unit: only exported for an institution-wide scope.
const UNPUBLISHED = [STATUSES.DRAFT, STATUSES.REJECTED];
const INDICATOR = 'PIRS Indicator & Code'; // header of PR&A's workbook
/** Cell text: empty for a missing value. */
const txt = (v) => (v === null || v === undefined ? '' : v);

/** Column order of the export for a year and quarter. */
function exportHeaders(fiscalYear, quarter) {
  return [
    'Ticket #', 'AHSS Pillar', 'Big Ticket', 'Result(s)', INDICATOR, 'Tier', `${fiscalYear} Target`,
    ...QUARTERS.map((q) => `${q} Milestone`),
    ...QUARTERS.map((q) => `${q} Achieved`),
    `${quarter} Performance (%)`, `${quarter} Progress`, `${quarter} Narration`, `${quarter} Challenges`,
    `${quarter} Next Steps`, `${quarter} Report`, 'Lead BU', 'Contributing BU',
  ];
}

async function loadYear(fiscalYear, includeDrafts) {
  const tickets = await db('big_tickets as b')
    .where('b.start_year', '<=', fiscalYear)
    .where(function openOrLater() { this.whereNull('b.end_year').orWhere('b.end_year', '>=', fiscalYear); })
    .where('b.is_active', true)
    .leftJoin('pillars as p', 'p.id', 'b.pillar_id')
    .orderBy([{ column: 'p.sort_order' }, { column: 'b.sort_order' }, { column: 'b.code' }])
    .select('b.id', 'b.code', 'b.title', 'b.expected_result', 'b.lead_division_code', 'p.name as pillar_name');
  const ids = tickets.map((t) => t.id);
  if (!ids.length) return { tickets, lines: [], targets: [], reports: [], values: [], contributors: [] };
  const [lines, reports, contributors] = await Promise.all([
    db('big_ticket_lines').whereIn('big_ticket_id', ids).orderBy(['big_ticket_id', 'sort_order', 'id']),
    db('big_ticket_reports').whereIn('big_ticket_id', ids).where('fiscal_year', fiscalYear)
      .modify((q) => { if (!includeDrafts) q.whereNotIn('status', UNPUBLISHED); }),
    db('big_ticket_contributors').whereIn('big_ticket_id', ids).orderBy('division_code'),
  ]);
  const [targets, values] = await Promise.all([
    lines.length ? db('big_ticket_line_targets').whereIn('line_id', lines.map((l) => l.id)).where('fiscal_year', fiscalYear) : [],
    reports.length ? db('big_ticket_report_values').whereIn('report_id', reports.map((r) => r.id)) : [],
  ]);
  return { tickets, lines, targets, reports, values, contributors };
}

/** Achieved text of a line in each quarter's report. */
function achievedByQuarter(line, reports, values) {
  const out = {};
  for (const q of QUARTERS) {
    const report = reports.find((r) => r.big_ticket_id === line.big_ticket_id && r.quarter === q);
    const value = report && values.find((v) => v.report_id === report.id && v.line_id === line.id);
    out[`${q} Achieved`] = txt(value?.achieved);
  }
  return out;
}

function identityCells(ticket, line, target, fiscalYear) {
  return {
    'Ticket #': ticket.code,
    'AHSS Pillar': txt(ticket.pillar_name),
    'Big Ticket': ticket.title,
    'Result(s)': txt(ticket.expected_result),
    [INDICATOR]: txt(line.source_indicator) || txt(line.indicator_code) || txt(line.label),
    Tier: txt(line.tier),
    [`${fiscalYear} Target`]: txt(target?.annual_target),
    ...Object.fromEntries(QUARTERS.map((q) => [`${q} Milestone`, txt(target?.[`${q.toLowerCase()}_milestone`])])),
  };
}

function quarterCells(report, value, quarter) {
  const pct = value?.performance_pct;
  return {
    [`${quarter} Performance (%)`]: pct === null || pct === undefined ? '' : Number(pct),
    [`${quarter} Progress`]: txt(BIG_TICKET_PROGRESS_CONFIG[report?.progress_status]?.label),
    [`${quarter} Narration`]: txt(report?.narrative),
    [`${quarter} Challenges`]: txt(report?.challenges),
    [`${quarter} Next Steps`]: txt(report?.next_steps),
    [`${quarter} Report`]: txt(report?.status),
  };
}

function lineRow({ ticket, line, target, report, value, contributors, achieved, fiscalYear, quarter }) {
  return {
    ...identityCells(ticket, line, target, fiscalYear),
    ...achieved,
    ...quarterCells(report, value, quarter),
    'Lead BU': txt(ticket.lead_division_code),
    'Contributing BU': contributors.join(', '),
  };
}

/**
 * Rows and headers of the Big Tickets export for a year, the chosen quarter
 * giving the performance, status and narration columns. Draft and returned
 * reports are left out unless `includeDrafts` (export scope `all`).
 *
 * @param {{ fiscalYear: string, quarter: string, includeDrafts?: boolean }} p
 * @returns {Promise<{ headers: string[], rows: object[] }>}
 * @throws {Error} on DB failure
 * @example await bigTicketsExport({ fiscalYear: '2026', quarter: 'Q3' });
 */
async function bigTicketsExport({ fiscalYear, quarter, includeDrafts = false }) {
  const { tickets, lines, targets, reports, values, contributors } = await loadYear(fiscalYear, includeDrafts);
  const rows = [];
  for (const ticket of tickets) {
    const report = reports.find((r) => r.big_ticket_id === ticket.id && r.quarter === quarter);
    const units = contributors.filter((c) => c.big_ticket_id === ticket.id).map((c) => c.division_code);
    for (const line of lines.filter((l) => l.big_ticket_id === ticket.id)) {
      rows.push(lineRow({
        ticket, line, report, contributors: units, fiscalYear, quarter,
        target: targets.find((t) => t.line_id === line.id),
        value: report && values.find((v) => v.report_id === report.id && v.line_id === line.id),
        achieved: achievedByQuarter(line, reports, values),
      }));
    }
  }
  return { headers: exportHeaders(fiscalYear, quarter), rows };
}

/**
 * Quarter an export shows by default: the latest one with reports in the year,
 * else the calendar quarter.
 *
 * @param {string} fiscalYear
 * @returns {Promise<string>} 'Q1'..'Q4'
 * @throws {Error} on DB failure
 * @example await defaultQuarter('2026') // 'Q3'
 */
async function defaultQuarter(fiscalYear) {
  const row = await db('big_ticket_reports').where('fiscal_year', fiscalYear).max('quarter as q').first();
  return row?.q || `Q${Math.floor(new Date().getUTCMonth() / 3) + 1}`;
}

module.exports = { bigTicketsExport, exportHeaders, defaultQuarter };
