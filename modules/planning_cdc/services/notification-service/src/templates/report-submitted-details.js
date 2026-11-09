// ── Report Submitted (with the report content) — D-20261013-07 ──
// Sent to the responsible person of the business unit when a report is
// submitted for it: the report fields, the attachment links and a button
// to open it. Every interpolated value is escaped (CSP-04).

const { escape } = require('@rbm/lib/html');
const { esc, when, appUrl, kvRow, kvList, decideButtons } = require('./_helpers');

const HTTP_URL = /^https?:\/\//i;

/** Escaped multi-line text, line breaks kept. */
const multiline = (value) => escape(String(value)).replace(/\r?\n/g, '<br>');

function attachmentList(attachments) {
  const links = (Array.isArray(attachments) ? attachments : [])
    .filter((a) => a && HTTP_URL.test(a.url || ''))
    .map((a) => `<li style="margin:4px 0;"><a href="${escape(a.url)}" style="color:#1A5632;">${esc(a.name, 'Attachment')}</a></li>`);
  if (!links.length) return kvRow('Attachments', 'None');
  return kvRow('Attachments', `<ul style="margin:0;padding-left:18px;">${links.join('')}</ul>`);
}

function fieldRows(fields) {
  return (Array.isArray(fields) ? fields : [])
    .filter((f) => f && f.value)
    .map((f) => kvRow(esc(f.label), multiline(f.value)))
    .join('');
}

/**
 * Email template — a report submitted for the recipient's business unit,
 * with its content.
 *
 * @param {object} data - outbox payload
 * @param {object} data.metadata - reportType, code, title, division, quarter,
 *   fiscalYear, submittedBy, reportUrl, fields [{label, value}], attachments [{name, url}]
 * @returns {string} HTML email body
 * @example reportSubmittedDetailsTemplate({ metadata: { reportType: 'Activity Report', fields: [] } });
 */
function reportSubmittedDetailsTemplate(data) {
  const m = (data && data.metadata) || {};
  const reportType = esc(m.reportType, 'Report');
  const report = when(m.code, (c) => `<strong>${c}</strong> — `) + esc(m.title);
  const division = when(m.division, (d) => ` (${d})`);

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:#1A5632; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">${reportType} submitted</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Africa CDC — RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 15px;">
          ${esc(m.submittedBy, 'A colleague')} submitted a report for your business unit${division}. Here is its content.
        </p>
        ${kvList(`
${kvRow('Report', report)}
${kvRow('Period', `${esc(m.quarter)} ${esc(m.fiscalYear)}`)}
${kvRow('Submitted by', esc(m.submittedBy))}
${fieldRows(m.fields)}
${attachmentList(m.attachments)}`)}
        ${decideButtons(m.decideUrl)}
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

/** Subject with the report code, e.g. "Activity Report submitted: 1.2.3.1 (Q3 2026)". */
reportSubmittedDetailsTemplate.subject = (data) => {
  const m = (data && data.metadata) || {};
  const period = [m.quarter, m.fiscalYear].filter(Boolean).join(' ');
  const what = m.code || m.title || '';
  return `${m.reportType || 'Report'} submitted: ${what}${period ? ` (${period})` : ''}`.trim();
};

module.exports = reportSubmittedDetailsTemplate;
