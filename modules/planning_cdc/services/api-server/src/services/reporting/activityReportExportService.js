// ── Activity Report Export — activity report row builder ──
//
// Builds tabular rows for the in-app authenticated export of ACTIVITY REPORTS:
// one row per report a reporter wrote on a specific activity (activity_reports,
// the official Africa CDC activity reporting template, D-20261001-01), distinct
// from the indicator quarterly report (quarterlyReportExportService). Consumed
// by routes/reporting/exportRoutes.js, gated by activity_report:export.
//
// It read the legacy division_activity_reports table until D-20261013-02,
// which nobody fills any more: downloads came out empty.
//
// Headers are human-readable column labels (CSV/XLSX), not ENTITY_TYPES.
/* eslint-disable no-restricted-syntax -- column headers like "Division" are
 * spreadsheet labels, not ENTITY_TYPES references (CHARTER §11). */
'use strict';

const db = require('../../config/db');

const ACTIVITY_REPORT_HEADERS = [
  'Fiscal year', 'Quarter', 'Division', 'Broad activity', 'Specific activity',
  'Reported by', 'Status', 'Not started (expected start)', 'Mission type', 'Start date', 'End date', 'Location',
  'Participants', 'Objectives', 'Achievements', 'Challenges', 'Lessons learned',
  'Next steps', 'Findings and recommendations', 'Actual spend', 'Budget',
  'Submitted at', 'Approved at', 'Rejection reason',
];

/** Text cell: null/undefined → '', objects (JSON columns) → JSON text. */
function str(v) {
  if (v == null) return '';
  return typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : String(v);
}

/** Numeric cell: null/empty/NaN → ''. */
function numOrEmpty(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

/** ISO-ish date cell (YYYY-MM-DD HH:mm) from a DB timestamp, else ''. */
function dateCell(v) {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? str(v) : d.toISOString().slice(0, 16).replace('T', ' ');
}

/** "CODE — Title", or '' when the node is missing. */
function label(code, title) {
  return [code, title].filter(Boolean).join(' — ');
}

/**
 * Build activity report rows for a fiscal year, optionally narrowed to a
 * quarter and to a set of division codes (RBAC scope, matched on the specific
 * activity's responsible division). An empty divFilter means "all".
 *
 * @param {{ fiscalYear?: string, quarter?: string, divFilter?: string[] }} params
 * @returns {Promise<Array<object>>} one row per activity report
 * @throws {Error} on DB failure
 * @example
 * const rows = await buildActivityReportRows({ fiscalYear: '2026', quarter: 'Q3' });
 */
async function buildActivityReportRows({ fiscalYear, quarter, divFilter = [] } = {}) {
  const q = db('activity_reports as ar')
    .join('plan_nodes as sa', 'sa.id', 'ar.plan_node_id')
    .leftJoin('plan_nodes as ba', 'ba.id', 'sa.parent_id')
    .leftJoin('users as u', 'u.id', 'ar.user_id')
    .leftJoin('division_codes as dc', 'dc.code', 'sa.responsible_division_code')
    .select(
      'ar.fiscal_year', 'ar.quarter', 'ar.status', 'ar.mission_type',
      'ar.start_date', 'ar.end_date', 'ar.location', 'ar.participants_count',
      'ar.objectives', 'ar.achievements', 'ar.narrative', 'ar.challenges',
      'ar.lessons_learned', 'ar.next_steps', 'ar.findings_recommendations',
      'ar.actual_spend', 'ar.total_budget', 'ar.submitted_at', 'ar.approved_at',
      'ar.rejection_reason', 'ar.not_started', 'ar.expected_start_quarter', 'ar.expected_start_year',
      'sa.code as sa_code', 'sa.title as sa_title', 'sa.responsible_division_code',
      'ba.code as ba_code', 'ba.title as ba_title',
      'dc.division_name',
      'u.first_name', 'u.last_name', 'u.email',
    )
    .orderBy(['ar.quarter', 'sa.responsible_division_code', 'sa.code', 'ar.id']);

  if (fiscalYear) q.where('ar.fiscal_year', String(fiscalYear));
  if (quarter) q.where('ar.quarter', String(quarter).toUpperCase());
  if (divFilter.length) q.whereIn(db.raw('UPPER(sa.responsible_division_code)'), divFilter);

  const reports = await q;
  return reports.map((r) => ({
    'Fiscal year': str(r.fiscal_year),
    'Quarter': str(r.quarter),
    'Division': str(r.division_name || r.responsible_division_code),
    'Broad activity': label(r.ba_code, r.ba_title),
    'Specific activity': label(r.sa_code, r.sa_title),
    'Reported by': [r.first_name, r.last_name].filter(Boolean).join(' ') || str(r.email),
    'Status': str(r.status),
    'Not started (expected start)': r.not_started ? `Yes (${str(r.expected_start_quarter)} ${str(r.expected_start_year)})`.replace(' ( )', '') : '',
    'Mission type': str(r.mission_type),
    'Start date': dateCell(r.start_date).slice(0, 10),
    'End date': dateCell(r.end_date).slice(0, 10),
    'Location': str(r.location),
    'Participants': numOrEmpty(r.participants_count),
    'Objectives': str(r.objectives),
    'Achievements': str(r.achievements || r.narrative),
    'Challenges': str(r.challenges),
    'Lessons learned': str(r.lessons_learned),
    'Next steps': str(r.next_steps),
    'Findings and recommendations': str(r.findings_recommendations),
    'Actual spend': numOrEmpty(r.actual_spend),
    'Budget': numOrEmpty(r.total_budget),
    'Submitted at': dateCell(r.submitted_at),
    'Approved at': dateCell(r.approved_at),
    'Rejection reason': str(r.rejection_reason),
  }));
}

module.exports = {
  buildActivityReportRows,
  ACTIVITY_REPORT_HEADERS,
};
