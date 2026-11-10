// ── Contributor Approval Chain — Rejected Email ──
// Sent to the original submitter when any approver rejects the report
// (at step 1, 2, or 3). Spec §8 — D-20260415-05.
//
// Follow-up (#24): Registration in templates/index.js + NOTIFICATION_TYPES enum
// entry are owned by feature-notification-wizard. This file is self-contained
// until that wiring lands. Suggested enum id: CONTRIB_REJECTED.
//
// Interpolated fields escaped via @rbm/lib/html (CSP-04).

const { esc, when, appUrl, firstOf, kvRow, kvList } = require('./_helpers');

function prepare(data) {
  const step = firstOf(data.rejectedAtStep, '');
  const stepLabel = step ? `Step ${step}` : 'Review';
  return {
    reportType: esc(data.reportType, 'Report'),
    code:       esc(data.code),
    title:      esc(data.title),
    contribOrg: esc(data.contribOrg),
    mainOrg:    esc(data.mainOrg),
    rejectedBy: esc(data.rejectedBy),
    reason:     esc(data.reason),
    quarter:    esc(data.quarter),
    fiscalYear: esc(data.fiscalYear),
    reportUrl:  appUrl(data.reportUrl),
    stepLabel,
  };
}

/**
 * Email template — contributor approval chain, rejected.
 * Sent to the original submitter on rejection at any step.
 *
 * @param {object} data
 * @param {string} data.reportType
 * @param {string} data.code
 * @param {string} data.title
 * @param {string} data.contribOrg
 * @param {string} [data.mainOrg]
 * @param {string} data.rejectedBy
 * @param {string} data.reason    — mandatory reviewer comment per spec.
 * @param {(1|2|3)} [data.rejectedAtStep]
 * @param {string} [data.quarter]
 * @param {string} [data.fiscalYear]
 * @param {string} [data.reportUrl]
 * @returns {string} HTML email body
 */
function contribRejectedTemplate(data) {
  const f = prepare(data);
  const reportCell = when(f.code, (c) => `<strong>${c}</strong> — `) + f.title;
  const periodRow = when(f.quarter, (q) => kvRow('Period', `${q} ${f.fiscalYear}`));
  const mainOrgRow = when(f.mainOrg, (m) => kvRow('Accountable division', m));
  const reasonRow = when(f.reason, (r) => kvRow('Reason', r));

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:#DC2626; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">✗ Contributor Report Rejected</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Africa CDC — RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 15px;">
          Your ${f.reportType.toLowerCase()} was <strong style="color:#DC2626">rejected</strong>
          at <strong>${f.stepLabel}</strong>. Please review the feedback and resubmit.
        </p>
        ${kvList(`
${kvRow('Report', reportCell)}
${kvRow('Contributing division', f.contribOrg)}
${mainOrgRow}
${periodRow}
${kvRow('Rejected at', f.stepLabel)}
${kvRow('Rejected by', f.rejectedBy)}
${reasonRow}`)}
        <p style="color:#666; font-size:13px;">
          Open the report, address the reviewer's comments, and resubmit. The approval chain restarts from step&nbsp;1.
        </p>
        <p style="text-align:center; margin:25px 0;">
          <a href="${f.reportUrl}" style="display:inline-block; padding:10px 24px; background:#DC2626; color:white; text-decoration:none; font-size:13px; font-weight:600;">
            Open Report
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

contribRejectedTemplate.subject = '[RBM] Contributor report rejected';
module.exports = contribRejectedTemplate;
