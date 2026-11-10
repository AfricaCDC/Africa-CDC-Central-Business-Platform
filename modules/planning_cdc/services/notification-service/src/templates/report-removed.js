// ── A report taken out of reporting — D-20261015-01 ──
// Sent when an indicator is marked not applicable by its main division
// (business unit and contributors) or when an activity report draft is
// deleted (author and focal person). Values escaped (CSP-04).

const { esc, when, appUrl, kvRow, kvList } = require('./_helpers');

/**
 * Email template — "this report was removed / marked not applicable".
 *
 * @param {object} data - outbox payload
 * @param {object} data.metadata - heading, message, reportType, code, title,
 *   division, quarter, fiscalYear, by, reason, reportUrl
 * @returns {string} HTML email body
 * @example reportRemovedTemplate({ metadata: { heading: 'Indicator marked not applicable', code: '1.2.3' } });
 */
function reportRemovedTemplate(data) {
  const m = (data && data.metadata) || {};
  const report = when(m.code, (c) => `<strong>${c}</strong> — `) + esc(m.title);
  const button = m.reportUrl
    ? `<p style="text-align:center; margin:25px 0;">
          <a href="${appUrl(m.reportUrl)}" style="display:inline-block; padding:10px 24px; background:#1A5632; color:white; text-decoration:none; font-size:13px; font-weight:600;">
            Open the platform
          </a>
        </p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:#92400E; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">${esc(m.heading, 'Report removed')}</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Africa CDC — RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 15px;">${esc(m.message)}</p>
        ${kvList(`
${kvRow(esc(m.reportType, 'Report'), report)}
${when(m.division, (d) => kvRow('Business unit', d))}
${kvRow('Period', `${esc(m.quarter)} ${esc(m.fiscalYear)}`)}
${kvRow('By', esc(m.by, '—'))}
${when(m.reason, (r) => kvRow('Reason', r))}`)}
        ${button}
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

/** Subject, e.g. "Indicator marked not applicable: 1.2.3 (Q3 2026)". */
reportRemovedTemplate.subject = (data) => {
  const m = (data && data.metadata) || {};
  return `${m.heading || 'Report removed'}: ${m.code || ''} (${m.quarter || ''} ${m.fiscalYear || ''})`
    .replace(/\s+/g, ' ').replace(/\(\s*\)/, '').trim();
};

module.exports = reportRemovedTemplate;
