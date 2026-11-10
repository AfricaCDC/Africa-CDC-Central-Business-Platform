// ── Big Tickets — reads (D-20261015-02) ──
//
// A ticket runs over start_year..end_year (end_year NULL = open). Its lines
// keep an indicator code resolved per year against plan_nodes, its targets
// and reports are per fiscal year.

'use strict';

const db = require('../../config/db');
const { NODE_TYPES } = require('@rbm/lib/enums');

const QUARTER_KEYS = ['q1', 'q2', 'q3', 'q4'];
const INDICATOR_TYPES = [NODE_TYPES.IMPACT_INDICATOR, NODE_TYPES.OUTCOME_INDICATOR];

/** Tickets running in `fiscalYear`. */
function activeIn(q, fiscalYear) {
  return q.where('b.start_year', '<=', fiscalYear)
    .where(function openOrLater() { this.whereNull('b.end_year').orWhere('b.end_year', '>=', fiscalYear); });
}

const average = (nums) => {
  const list = nums.filter((n) => n !== null && n !== undefined).map(Number);
  return list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;
};

/**
 * Tickets of a year with the report of the chosen quarter.
 *
 * @param {{ fiscalYear: string, quarter: string, pillarId?: number, lead?: string, progress?: string, q?: string }} f
 * @returns {Promise<object[]>} one row per ticket: pillar, lead, contributors, line count, report summary
 *   (`lead` filters on a business unit that leads or contributes)
 * @throws {Error} on DB failure
 * @example await listTickets({ fiscalYear: '2026', quarter: 'Q2' });
 */
async function listTickets({ fiscalYear, quarter, pillarId, lead, progress, q }) {
  let query = activeIn(db('big_tickets as b'), fiscalYear)
    .leftJoin('pillars as p', 'p.id', 'b.pillar_id')
    .leftJoin('division_codes as d', 'd.code', 'b.lead_division_code')
    .where('b.is_active', true)
    .select('b.id', 'b.code', 'b.title', 'b.pillar_id', 'p.name as pillar_name', 'p.sort_order as pillar_order',
      'b.lead_division_code', 'd.division_name as lead_division_name', 'b.start_year', 'b.end_year', 'b.sort_order')
    .orderBy([{ column: 'p.sort_order' }, { column: 'b.sort_order' }, { column: 'b.code' }]);
  if (pillarId) query = query.where('b.pillar_id', pillarId);
  // A business unit sees the tickets it leads and those it contributes to.
  if (lead) {
    query = query.where(function leadOrContributor() {
      this.where('b.lead_division_code', lead).orWhereExists(function contributes() {
        this.from('big_ticket_contributors as c').whereRaw('c.big_ticket_id = b.id').where('c.division_code', lead);
      });
    });
  }
  if (q) query = query.where(function search() { this.where('b.code', 'like', `%${q}%`).orWhere('b.title', 'like', `%${q}%`); });
  const tickets = await query;
  if (!tickets.length) return [];

  const ids = tickets.map((t) => t.id);
  const [lines, reports, contributors] = await Promise.all([
    db('big_ticket_lines').whereIn('big_ticket_id', ids).select('big_ticket_id', 'indicator_code'),
    db('big_ticket_reports').whereIn('big_ticket_id', ids).where({ fiscal_year: fiscalYear, quarter })
      .select('id', 'big_ticket_id', 'status', 'progress_status', 'imported'),
    db('big_ticket_contributors').whereIn('big_ticket_id', ids).orderBy('division_code').select('big_ticket_id', 'division_code'),
  ]);
  const values = reports.length
    ? await db('big_ticket_report_values').whereIn('report_id', reports.map((r) => r.id)).select('report_id', 'performance_pct')
    : [];
  const rows = tickets.map((t) => {
    const own = lines.filter((l) => l.big_ticket_id === t.id);
    const report = reports.find((r) => r.big_ticket_id === t.id) || null;
    return {
      ...t,
      line_count: own.length,
      contributor_codes: contributors.filter((c) => c.big_ticket_id === t.id).map((c) => c.division_code),
      indicator_codes: [...new Set(own.map((l) => l.indicator_code).filter(Boolean))],
      report: report && {
        id: report.id, status: report.status, progress_status: report.progress_status, imported: !!report.imported,
        performance_pct: average(values.filter((v) => v.report_id === report.id).map((v) => v.performance_pct)),
      },
    };
  });
  return progress ? rows.filter((r) => r.report?.progress_status === progress) : rows;
}

/** Indicator of each line for the year: plan_nodes row with that code. */
async function resolveIndicators(codes, fiscalYear) {
  if (!codes.length) return {};
  const nodes = await db('plan_nodes').whereIn('code', codes).where('fiscal_year', fiscalYear)
    .whereIn('node_type', INDICATOR_TYPES).select('id', 'code', 'title', 'node_type', 'responsible_division_code');
  return Object.fromEntries(nodes.map((n) => [n.code, n]));
}

/**
 * One ticket with its contributors, lines (target and indicator of the year)
 * and its reports of the year.
 *
 * @param {number} id
 * @param {string} fiscalYear
 * @returns {Promise<object|null>} null when the ticket does not exist
 * @throws {Error} on DB failure
 * @example await getTicket(12, '2026');
 */
async function getTicket(id, fiscalYear) {
  const ticket = await db('big_tickets as b')
    .leftJoin('pillars as p', 'p.id', 'b.pillar_id')
    .leftJoin('division_codes as d', 'd.code', 'b.lead_division_code')
    .where('b.id', id).first('b.*', 'p.name as pillar_name', 'd.division_name as lead_division_name');
  if (!ticket) return null;
  const [contributors, lines, reports, years] = await Promise.all([
    db('big_ticket_contributors as c').leftJoin('division_codes as d', 'd.code', 'c.division_code')
      .where('c.big_ticket_id', id).select('c.division_code', 'd.division_name').orderBy('c.division_code'),
    db('big_ticket_lines').where('big_ticket_id', id).orderBy('sort_order').orderBy('id'),
    db('big_ticket_reports').where({ big_ticket_id: id, fiscal_year: fiscalYear }).orderBy('quarter'),
    db('big_ticket_line_targets as t').join('big_ticket_lines as l', 'l.id', 't.line_id')
      .where('l.big_ticket_id', id).distinct('t.fiscal_year').pluck('t.fiscal_year'),
  ]);
  const lineIds = lines.map((l) => l.id);
  const [targets, values, indicators] = await Promise.all([
    lineIds.length ? db('big_ticket_line_targets').whereIn('line_id', lineIds).where('fiscal_year', fiscalYear) : [],
    reports.length ? db('big_ticket_report_values').whereIn('report_id', reports.map((r) => r.id)) : [],
    resolveIndicators([...new Set(lines.map((l) => l.indicator_code).filter(Boolean))], fiscalYear),
  ]);
  return {
    ...ticket,
    fiscal_year: fiscalYear,
    years: [...new Set([...years, fiscalYear])].sort(),
    contributors,
    lines: lines.map((l) => ({
      ...l,
      target: targets.find((t) => t.line_id === l.id) || null,
      indicator: (l.indicator_code && indicators[l.indicator_code]) || null,
    })),
    reports: reports.map((r) => ({ ...r, values: values.filter((v) => v.report_id === r.id) })),
  };
}

/**
 * Indicators of a year to link a line to (autocomplete).
 *
 * @param {{ fiscalYear: string, q: string }} p
 * @returns {Promise<Array<{ id: number, code: string, title: string, node_type: string }>>}
 * @throws {Error} on DB failure
 * @example await searchIndicators({ fiscalYear: '2026', q: 'KM.10' });
 */
async function searchIndicators({ fiscalYear, q }) {
  let query = db('plan_nodes').where('fiscal_year', fiscalYear).whereIn('node_type', INDICATOR_TYPES)
    .whereNotNull('code').select('id', 'code', 'title', 'node_type').orderBy('code').limit(20);
  if (q) query = query.where(function search() { this.where('code', 'like', `%${q}%`).orWhere('title', 'like', `%${q}%`); });
  return query;
}

module.exports = { listTickets, getTicket, searchIndicators, QUARTER_KEYS, _internals: { average } };
