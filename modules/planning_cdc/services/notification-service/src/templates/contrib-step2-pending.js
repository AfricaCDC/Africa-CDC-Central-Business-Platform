// ── Contributor Approval Chain — Step-2 Pending Email ──
// Sent to the HOD of the accountable (main) division after step-1 approval
// by the contributing HOD. Step-2 of the 3-step chain (D-20260415-05, spec §8).
//
// Follow-up (#24): Registration in templates/index.js + NOTIFICATION_TYPES enum
// entry are owned by feature-notification-wizard. This file is self-contained
// until that wiring lands. Suggested enum id: CONTRIB_STEP2_PENDING.
//
// Interpolated fields escaped via @rbm/lib/html (CSP-04).

const { esc, when, appUrl, kvRow, kvList } = require('./_helpers');

function prepare(data) {
  return {
    reportType:    esc(data.reportType, 'Report'),
    code:          esc(data.code),
    title:         esc(data.title),
    submitterName: esc(data.submitterName),
    contribOrg:    esc(data.contribOrg),
    mainOrg:       esc(data.mainOrg),
    step1Approver: esc(data.step1Approver),
    quarter:       esc(data.quarter),
    fiscalYear:    esc(data.fiscalYear),
    reviewUrl:     appUrl(data.reviewUrl),
  };
}

/**
 * Email template — contributor approval chain, step 2 pending.
 * Sent to the HOD of the accountable (main) division after step-1 approval.
 *
 * @param {object} data
 * @param {string} data.reportType
 * @param {string} data.code
 * @param {string} data.title
 * @param {string} data.submitterName
 * @param {string} data.contribOrg
 * @param {string} data.mainOrg
 * @param {string} [data.step1Approver]
 * @param {string} [data.quarter]
 * @param {string} [data.fiscalYear]
 * @param {string} [data.reviewUrl]
 * @returns {string} HTML email body
 */
function contribStep2PendingTemplate(data) {
  const f = prepare(data);
  const reportCell = when(f.code, (c) => `<strong>${c}</strong> — `) + f.title;
  const periodRow = when(f.quarter, (q) => kvRow('Period', `${q} ${f.fiscalYear}`));
  const step1Row = when(f.step1Approver, (a) => kvRow('Step 1 approved by', a));

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:#1A5632; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">Contributor Report — Step 2 Approval Needed</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Africa CDC — RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 15px;">
          A ${f.reportType.toLowerCase()} contributed by <strong>${f.contribOrg}</strong> has been
          approved at step 1 and is awaiting your approval as head of the accountable division
          <strong>${f.mainOrg}</strong> (step 2 of 3).
        </p>
        ${kvList(`
${kvRow('Report', reportCell)}
${kvRow('Submitted by', f.submitterName)}
${kvRow('Contributing division', f.contribOrg)}
${kvRow('Accountable division', f.mainOrg)}
${step1Row}
${periodRow}
${kvRow('Step', `2 of 3 — Accountable HOD`)}`)}
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

contribStep2PendingTemplate.subject = '[RBM] Step 2 approval needed — contributor report';
module.exports = contribStep2PendingTemplate;
