// ── Activity report given to another preparer — D-20261013-07 ──
// Sent to the new and to the previous preparer when an administrator or
// M&E officer changes who prepared a report. Values escaped (CSP-04).

const { esc, when, appUrl, kvRow, kvList } = require('./_helpers');

/**
 * Email template — "this report is now prepared by X".
 *
 * @param {object} data - outbox payload
 * @param {object} data.metadata - code, title, quarter, fiscalYear, fromName,
 *   toName, changedBy, reason, reportUrl
 * @returns {string} HTML email body
 * @example reportPreparerChangedTemplate({ metadata: { code: '1.2.3.1', toName: 'Jane Doe' } });
 */
function reportPreparerChangedTemplate(data) {
  const m = (data && data.metadata) || {};
  const report = when(m.code, (c) => `<strong>${c}</strong> — `) + esc(m.title);

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:#1A5632; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">Activity report given to another preparer</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Africa CDC — RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 15px;">
          ${esc(m.changedBy, 'An administrator')} changed who prepared this activity report. It is now prepared by ${esc(m.toName, 'another person')}.
        </p>
        ${kvList(`
${kvRow('Report', report)}
${kvRow('Period', `${esc(m.quarter)} ${esc(m.fiscalYear)}`)}
${kvRow('Previously prepared by', esc(m.fromName, '—'))}
${kvRow('Now prepared by', esc(m.toName, '—'))}
${kvRow('Reason', esc(m.reason, '—'))}`)}
        <p style="text-align:center; margin:25px 0;">
          <a href="${appUrl(m.reportUrl)}" style="display:inline-block; padding:10px 24px; background:#1A5632; color:white; text-decoration:none; font-size:13px; font-weight:600;">
            Open the report
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

/** Subject, e.g. "Activity report 1.2.3.1 now prepared by Jane Doe". */
reportPreparerChangedTemplate.subject = (data) => {
  const m = (data && data.metadata) || {};
  return `Activity report ${m.code || ''} now prepared by ${m.toName || 'another person'}`.replace(/\s+/g, ' ').trim();
};

module.exports = reportPreparerChangedTemplate;
