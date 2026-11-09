// ── Contributor Approval Chain — Step-1 Pending Email ──
// Sent to the HOD of the contributing division when a contrib-flow report
// is submitted. Step-1 of the 3-step chain (D-20260415-05, spec §8).
//
// Follow-up (#24): Registration in templates/index.js + NOTIFICATION_TYPES enum
// entry are owned by feature-notification-wizard. This file is self-contained
// until that wiring lands. Suggested enum id: CONTRIB_STEP1_PENDING.
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
    quarter:       esc(data.quarter),
    fiscalYear:    esc(data.fiscalYear),
    reviewUrl:     appUrl(data.reviewUrl),
  };
}

/**
 * Email template — contributor approval chain, step 1 pending.
 * Sent to the HOD of the contributing division on submission.
 *
 * @param {object} data
 * @param {string} data.reportType
 * @param {string} data.code
 * @param {string} data.title
 * @param {string} data.submitterName
 * @param {string} data.contribOrg   — contributing division code/name.
 * @param {string} [data.mainOrg]    — accountable division code/name.
 * @param {string} [data.quarter]
 * @param {string} [data.fiscalYear]
 * @param {string} [data.reviewUrl]
 * @returns {string} HTML email body
 */
function contribStep1PendingTemplate(data) {
  const f = prepare(data);
  const reportCell = when(f.code, (c) => `<strong>${c}</strong> — `) + f.title;
  const periodRow = when(f.quarter, (q) => kvRow('Period', `${q} ${f.fiscalYear}`));
  const mainOrgRow = when(f.mainOrg, (m) => kvRow('Accountable division', m));

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:#1A5632; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">Contributor Report — Step 1 Approval Needed</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Africa CDC — RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 15px;">
          A ${f.reportType.toLowerCase()} submitted by <strong>${f.submitterName}</strong> for
          the contributing division <strong>${f.contribOrg}</strong> is awaiting your approval as
          head of division (step 1 of 3).
        </p>
        ${kvList(`
${kvRow('Report', reportCell)}
${kvRow('Contributing division', f.contribOrg)}
${mainOrgRow}
${periodRow}
${kvRow('Step', `1 of 3 — Contributing HOD`)}`)}
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

contribStep1PendingTemplate.subject = '[RBM] Step 1 approval needed — contributor report';
module.exports = contribStep1PendingTemplate;
