// ── Report content for notification emails (D-20261013-07) ──
//
// The responsible person of a business unit receives the submitted report
// itself by email: its fields, the attachment links and a link to open it.
// These builders produce the `metadata` read by the notification-service
// template `report-submitted-details`.

'use strict';

const db = require('../../config/db');
const { APPROVAL_ENTITIES } = require('@rbm/lib/enums');
const { decideUrlFor } = require('../approvals/stepSummary');

const APP_URL = (process.env.APP_BASE_URL || 'https://pra.africacdc.org').replace(/\/$/, '');
const HTTP_URL = /^https?:\/\//i;

/** Plain text of a column: JSON lists joined with "; ", objects flattened. */
function text(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return Object.values(value).filter(Boolean).join('; ');
  const s = String(value).trim();
  if (!s.startsWith('[')) return s;
  try {
    const list = JSON.parse(s);
    return Array.isArray(list) ? list.map((v) => String(v).trim()).filter(Boolean).join('; ') : s;
  } catch {
    return s;
  }
}

/** Link to an activity report in the app. */
const activityReportUrl = (report) => `${APP_URL}/activity-report/${report.plan_node_id}/report/${report.id}`;

/** Link to a quarterly indicator report in the app. */
const indicatorReportUrl = (report) =>
  `${APP_URL}/quarterly-report/${report.plan_node_id}?q=${encodeURIComponent(report.quarter || '')}&division=${encodeURIComponent(report.division_code || '')}${report.fiscal_year ? `&fy=${encodeURIComponent(report.fiscal_year)}` : ''}`;

/**
 * Entity fields that route a decision email to the author (`entity_owner`)
 * and to the business unit: focal person (`focal_of_main`) and head
 * (`entity_main_hod`). D-20261015-01.
 *
 * @param {number|null} ownerId - the report author
 * @param {string|null} divisionCode - the business unit the report is for
 * @returns {{ owner_user_id: number|null, main_division_code: string|null }}
 * @example outcomeRecipients(12, 'KM');
 */
const outcomeRecipients = (ownerId, divisionCode) => ({
  owner_user_id: ownerId || null,
  main_division_code: divisionCode || null,
});

const day = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');
const fields = (pairs) => pairs.map(([label, value]) => ({ label, value: text(value) })).filter((f) => f.value);

/**
 * Attachment links of a report (evidence_files), SharePoint URLs only.
 *
 * @param {string} parentType - 'activity_report' | 'indicator_report'
 * @param {number} parentId
 * @returns {Promise<Array<{ name: string, url: string }>>}
 * @throws {Error} on DB failure
 * @example await attachmentsOf('activity_report', 12);
 */
async function attachmentsOf(parentType, parentId) {
  const rows = await db('evidence_files')
    .where({ parent_type: parentType, parent_id: parentId })
    .orderBy('id', 'asc')
    .select('original_name', 'file_url');
  return rows
    .filter((r) => HTTP_URL.test(r.file_url || ''))
    .map((r) => ({ name: r.original_name || 'Attachment', url: r.file_url }));
}

/**
 * Email metadata for a submitted activity report.
 *
 * @param {{ report: object, node: object, submittedBy: string }} p
 * @returns {Promise<object>} metadata for `report-submitted-details`
 * @throws {Error} on DB failure
 * @example await activityReportEmail({ report, node, submittedBy: 'Jane Doe' });
 */
async function activityReportEmail({ report, node, submittedBy }) {
  return {
    reportType: 'Activity Report',
    code: node.code || '',
    title: node.title || '',
    division: node.responsible_division_code || '',
    quarter: report.quarter || '',
    fiscalYear: report.fiscal_year || '',
    submittedBy,
    reportUrl: activityReportUrl(report),
    decideUrl: await decideUrlFor(APPROVAL_ENTITIES.ACTIVITY_REPORT, report.id),
    fields: fields([
      ['Activity status', report.not_started
        ? `Not started yet, expected to start in ${report.expected_start_quarter || '?'} ${report.expected_start_year || ''}`.trim()
        : ''],
      ['Mission type', report.mission_type],
      ['Dates', [day(report.start_date), day(report.end_date)].filter(Boolean).join(' to ')],
      ['Location', report.location],
      ['Participants', report.participants_count],
      ['Objectives', report.objectives],
      ['Achievements', report.achievements || report.narrative],
      ['Challenges', report.challenges],
      ['Lessons learned', report.lessons_learned],
      ['Next steps', report.next_steps],
      ['Findings and recommendations', report.findings_recommendations],
      ['Actual spend (USD)', report.actual_spend],
    ]),
    attachments: await attachmentsOf('activity_report', report.id),
  };
}

/** Display name of the submitter: the actor when it carries names, else the users row. */
async function submitterName(userId, actor) {
  const named = actor && (actor.first_name || actor.last_name) ? actor : await db('users').where('id', userId).first();
  if (!named) return '';
  return `${named.first_name || ''} ${named.last_name || ''}`.trim() || named.email || '';
}

/**
 * Email metadata for a submitted quarterly indicator report.
 *
 * @param {{ report: object, node: object, actor?: object }} p
 * @returns {Promise<object>} metadata for `report-submitted-details`
 * @throws {Error} on DB failure
 * @example await indicatorReportEmail({ report, node, actor: req.user });
 */
async function indicatorReportEmail({ report, node, actor }) {
  const q = String(report.quarter || '').toLowerCase();
  return {
    reportType: 'Indicator Quarterly Report',
    code: node.code || '',
    title: node.title || '',
    division: report.division_code || '',
    quarter: report.quarter || '',
    fiscalYear: report.fiscal_year || '',
    submittedBy: await submitterName(report.submitted_by, actor),
    reportUrl: indicatorReportUrl(report),
    decideUrl: await decideUrlFor(APPROVAL_ENTITIES.INDICATOR_DIVISION_REPORT, report.id),
    fields: fields([
      [`${report.quarter || 'Quarter'} target`, node[`${q}_target_numeric`]],
      ['Achievement', report.actual_value],
      ['Narration', report.narrative],
      ['Challenges', report.challenges],
      ['Recommendations', report.recommendations],
    ]),
    attachments: await attachmentsOf('indicator_report', report.id),
  };
}

module.exports = {
  activityReportEmail, indicatorReportEmail, attachmentsOf, text,
  activityReportUrl, indicatorReportUrl, submitterName, outcomeRecipients, APP_URL,
};
