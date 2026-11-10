// ── Report Submitted Email Template ──
// Interpolated fields escaped via @rbm/lib/html (CSP-04).

const { esc, when, appUrl, kvRow, kvList } = require('./_helpers');

function prepare(data) {
  return {
    reportType:  esc(data.reportType, 'Report'),
    code:        esc(data.code),
    title:       esc(data.title),
    submittedBy: esc(data.submittedBy),
    quarter:     esc(data.quarter),
    fiscalYear:  esc(data.fiscalYear),
    division:    esc(data.division),
    reviewUrl:   appUrl(data.reviewUrl),
  };
}

/**
 * Email template — report submitted for approval.
 * Sent to the reviewer (head of division / M&E officer) when a focal
 * person submits an activity report or indicator report.
 *
 * @param {object} data
 * @param {string} data.reportType - 'Activity Report' | 'Indicator Report'
 * @param {string} data.code
 * @param {string} data.title
 * @param {string} data.submittedBy
 * @param {string} data.quarter
 * @param {string} data.fiscalYear
 * @param {string} [data.division]
 * @param {string} [data.reviewUrl]
 * @returns {string} HTML email body
 */
function reportSubmittedTemplate(data) {
  const f = prepare(data);
  const reportCell = when(f.code, (c) => `<strong>${c}</strong> — `) + f.title;
  // eslint-disable-next-line no-restricted-syntax -- 'Division' is the row label printed in the email, not an ENTITY_TYPES identifier
  const divisionRow = when(f.division, (d) => kvRow('Division', d));

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:#1A5632; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">${f.reportType} Submitted</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Africa CDC — RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 15px;">
          A ${f.reportType.toLowerCase()} has been submitted and requires your review.
        </p>
        ${kvList(`
${kvRow('Report', reportCell)}
${kvRow('Period', `${f.quarter} ${f.fiscalYear}`)}
${kvRow('Submitted by', f.submittedBy)}
${divisionRow}`)}
        <p style="text-align:center; margin:25px 0;">
          <a href="${f.reviewUrl}" style="display:inline-block; padding:10px 24px; background:#1A5632; color:white; text-decoration:none; font-size:13px; font-weight:600;">
            Review Report
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

reportSubmittedTemplate.subject = 'Report Submitted for Review';
module.exports = reportSubmittedTemplate;
