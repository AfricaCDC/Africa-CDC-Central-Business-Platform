// ── Contributor Approval Chain — Blocked (Missing HOD) Email ──
// Sent to all active M&E officers + admins when the HOD resolver returns
// null for a contributing or accountable division at step 1 or 2. Unblocks
// the chain by surfacing the gap to people who can assign a new HOD.
// Spec §8 / §7.3 — D-20260415-05.
//
// Follow-up (#24): Registration in templates/index.js + NOTIFICATION_TYPES enum
// entry are owned by feature-notification-wizard. This file is self-contained
// until that wiring lands. Suggested enum id: APPROVAL_BLOCKED_MISSING_HOD.
//
// Interpolated fields escaped via @rbm/lib/html (CSP-04).

const { esc, when, appUrl, firstOf, kvRow, kvList } = require('./_helpers');

function prepare(data) {
  const step = firstOf(data.blockedStep, '');
  return {
    reportId:       esc(data.reportId),
    reportType:     esc(data.reportType, 'Report'),
    code:           esc(data.code),
    title:          esc(data.title),
    blockedStep:    esc(step),
    blockedOrgUnit: esc(data.blockedOrgUnit),
    submitterName:  esc(data.submitterName),
    quarter:        esc(data.quarter),
    fiscalYear:     esc(data.fiscalYear),
    deepLink:       appUrl(data.deepLink),
  };
}

/**
 * Email template — contributor approval chain blocked because no active
 * HOD can be resolved for the contributing or accountable division.
 *
 * @param {object} data
 * @param {string|number} data.reportId
 * @param {string} data.reportType
 * @param {string} [data.code]
 * @param {string} data.title
 * @param {(1|2)} data.blockedStep
 * @param {string} data.blockedOrgUnit — division code/name that has no HOD.
 * @param {string} [data.submitterName]
 * @param {string} [data.quarter]
 * @param {string} [data.fiscalYear]
 * @param {string} [data.deepLink]
 * @returns {string} HTML email body
 */
function approvalBlockedMissingHodTemplate(data) {
  const f = prepare(data);
  const reportCell = when(f.code, (c) => `<strong>${c}</strong> — `) + f.title;
  const periodRow = when(f.quarter, (q) => kvRow('Period', `${q} ${f.fiscalYear}`));
  const submitterRow = when(f.submitterName, (s) => kvRow('Submitted by', s));
  const stepRow = when(f.blockedStep, (s) => kvRow('Blocked at', `Step ${s}`));

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:#d97706; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">⚠ Approval Chain Blocked — No Active HOD</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Africa CDC — RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 15px;">
          A contributor ${f.reportType.toLowerCase()} cannot progress because no active
          head of division is assigned to <strong>${f.blockedOrgUnit}</strong>. Please
          assign an active HOD and trigger a re-evaluation so the chain can continue.
        </p>
        ${kvList(`
${kvRow('Report', reportCell)}
${kvRow('Report ID', f.reportId)}
${stepRow}
${kvRow('Division without HOD', `<strong>${f.blockedOrgUnit}</strong>`)}
${submitterRow}
${periodRow}`)}
        <p style="color:#666; font-size:13px;">
          Recommended actions: assign or re-activate an HOD for the division, then open
          the report to resume the approval chain.
        </p>
        <p style="text-align:center; margin:25px 0;">
          <a href="${f.deepLink}" style="display:inline-block; padding:10px 24px; background:#d97706; color:white; text-decoration:none; font-size:13px; font-weight:600;">
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

approvalBlockedMissingHodTemplate.subject = '[RBM] Approval blocked — no active HOD';
module.exports = approvalBlockedMissingHodTemplate;
