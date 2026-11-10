// ── Report Reviewed Email Template ──
// Interpolated fields escaped via @rbm/lib/html (CSP-04).
// Decision comparison uses DECISIONS from @rbm/lib/enums — no literals inline.

const { DECISIONS, STATUSES } = require('@rbm/lib/enums');
const { esc, appUrl, firstOf, kvRow, kvList } = require('./_helpers');

// Routes send the report status (APPROVED); older callers the decision (APPROVE).
const isApprovalDecision = (d) => d === STATUSES.APPROVED || d === STATUSES.VALIDATED || d === DECISIONS.APPROVE;

function prepare(data) {
  const decision   = firstOf(data.decision, '');
  const isApproved = isApprovalDecision(decision);
  return {
    reportType: esc(data.reportType, 'Report'),
    code:       esc(data.code),
    title:      esc(data.title),
    reviewedBy: esc(data.reviewedBy),
    reason:     esc(data.reason),
    quarter:    esc(data.quarter),
    fiscalYear: esc(data.fiscalYear),
    division:   esc(data.division),
    reportUrl:  appUrl(data.reportUrl),
    isApproved,
    color:      isApproved ? '#1A5632' : '#DC2626',
    label:      isApproved ? 'Approved' : 'Rejected',
    icon:       isApproved ? '✓' : '✗',
  };
}

/**
 * Email template — report approved or rejected.
 * Sent to the author and to the business unit (focal person, head) when a report is approved or rejected.
 *
 * @param {object} data - outbox payload; fields read from `data.metadata`
 *   (falls back to top-level for older rows)
 * @param {string} data.reportType
 * @param {string} data.code
 * @param {string} data.title
 * @param {string} data.decision - one of DECISIONS values.
 * @param {string} data.reviewedBy
 * @param {string} [data.reason]
 * @param {string} data.quarter
 * @param {string} data.fiscalYear
 * @param {string} [data.division]
 * @param {string} [data.reportUrl]
 * @returns {string} HTML email body
 * @example reportReviewedTemplate({ metadata: { decision: STATUSES.APPROVED, code: '1.2.3.1' } });
 */
function reportReviewedTemplate(data) {
  // Values travel in `metadata` (outbox payload); top-level kept for old rows.
  const f = prepare({ ...(data || {}), ...((data && data.metadata) || {}) });
  // prepare() already escaped every value: plain conditionals, not when() (it escapes again).
  const reportCell = (f.code ? `<strong>${f.code}</strong> — ` : '') + f.title;
  const reasonRow = f.reason ? kvRow('Reason', f.reason) : '';
  const rejectionNote = f.isApproved ? '' : `<p style="color:#666; font-size:13px;">The preparer can review the feedback and resubmit the report.</p>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:${f.color}; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">${f.icon} ${f.reportType} ${f.label}</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Africa CDC — RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 15px;">
          This ${f.reportType.toLowerCase()} has been <strong style="color:${f.color}">${f.label.toLowerCase()}</strong>.
        </p>
        ${kvList(`
${kvRow('Report', reportCell)}
${f.division ? kvRow('Business unit', f.division) : ''}
${kvRow('Period', `${f.quarter} ${f.fiscalYear}`)}
${kvRow('Decision', `<span style="display:inline-block; padding:3px 10px; font-size:12px; font-weight:600; color:${f.color};">${f.label}</span>`)}
${kvRow('Reviewed by', f.reviewedBy)}
${reasonRow}`)}
        ${rejectionNote}
        <p style="text-align:center; margin:25px 0;">
          <a href="${f.reportUrl}" style="display:inline-block; padding:10px 24px; background:${f.color}; color:white; text-decoration:none; font-size:13px; font-weight:600;">
            View Report
          </a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:15px 30px; background:#f7fafc; border-top:1px solid #e2e8f0; text-align:center;">
        <p style="margin:0; font-size:11px; color:#a0aec0;">Africa CDC — RBM Platform | Automated notification</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Subject, e.g. "Activity Report 1.2.3.1 approved (Q3 2026)". */
reportReviewedTemplate.subject = (data) => {
  const m = { ...(data || {}), ...((data && data.metadata) || {}) };
  if (!m.decision) return 'Report Review Decision';
  const label = isApprovalDecision(m.decision) ? 'approved' : 'rejected';
  return `${m.reportType || 'Report'} ${m.code || ''} ${label} (${m.quarter || ''} ${m.fiscalYear || ''})`
    .replace(/\s+/g, ' ').replace(/\(\s*\)/, '').trim();
};
module.exports = reportReviewedTemplate;
