// ── Contributor Approval Chain — Approved (Final) Email ──
// Sent to the original submitter once the report is fully approved, either
// via step-3 M&E approval or via admin bypass (D-20260415-05, spec §8).
//
// Follow-up (#24): Registration in templates/index.js + NOTIFICATION_TYPES enum
// entry are owned by feature-notification-wizard. This file is self-contained
// until that wiring lands. Suggested enum id: CONTRIB_APPROVED_FINAL.
//
// Interpolated fields escaped via @rbm/lib/html (CSP-04).

const { esc, when, appUrl, firstOf, kvRow, kvList } = require('./_helpers');

function prepare(data) {
  const approvedVia = firstOf(data.approvedVia, 'step3');
  const viaBypass   = approvedVia === 'bypass';
  return {
    reportType:   esc(data.reportType, 'Report'),
    code:         esc(data.code),
    title:        esc(data.title),
    contribOrg:   esc(data.contribOrg),
    mainOrg:      esc(data.mainOrg),
    approvedBy:   esc(data.approvedBy),
    bypassReason: esc(data.bypassReason),
    quarter:      esc(data.quarter),
    fiscalYear:   esc(data.fiscalYear),
    reportUrl:    appUrl(data.reportUrl),
    viaBypass,
    routeLabel:   viaBypass ? 'Admin bypass' : 'Step 3 — M&E approval',
  };
}

/**
 * Email template — contributor approval chain, approved (final).
 * Sent to the original submitter on full approval.
 *
 * @param {object} data
 * @param {string} data.reportType
 * @param {string} data.code
 * @param {string} data.title
 * @param {string} data.contribOrg
 * @param {string} [data.mainOrg]
 * @param {string} data.approvedBy
 * @param {('step3'|'bypass')} [data.approvedVia]
 * @param {string} [data.bypassReason] — required iff approvedVia = 'bypass'.
 * @param {string} [data.quarter]
 * @param {string} [data.fiscalYear]
 * @param {string} [data.reportUrl]
 * @returns {string} HTML email body
 */
function contribApprovedFinalTemplate(data) {
  const f = prepare(data);
  const reportCell = when(f.code, (c) => `<strong>${c}</strong> — `) + f.title;
  const periodRow = when(f.quarter, (q) => kvRow('Period', `${q} ${f.fiscalYear}`));
  const mainOrgRow = when(f.mainOrg, (m) => kvRow('Accountable division', m));
  const bypassNote = f.viaBypass
    ? `<p style="background:#fef3c7; border-left:3px solid #d97706; padding:10px 12px; font-size:13px; color:#78350f; margin:15px 0;">This approval was issued via admin bypass.${f.bypassReason ? ` Reason: <em>${f.bypassReason}</em>` : ''}</p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:#1A5632; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">✓ Contributor Report Approved</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Africa CDC — RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 15px;">
          Your ${f.reportType.toLowerCase()} has been <strong style="color:#1A5632">approved</strong>.
        </p>
        ${bypassNote}
        ${kvList(`
${kvRow('Report', reportCell)}
${kvRow('Contributing division', f.contribOrg)}
${mainOrgRow}
${periodRow}
${kvRow('Approved via', f.routeLabel)}
${kvRow('Approved by', f.approvedBy)}`)}
        <p style="text-align:center; margin:25px 0;">
          <a href="${f.reportUrl}" style="display:inline-block; padding:10px 24px; background:#1A5632; color:white; text-decoration:none; font-size:13px; font-weight:600;">
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

contribApprovedFinalTemplate.subject = '[RBM] Contributor report approved';
module.exports = contribApprovedFinalTemplate;
