// ── Reports waiting for your review — D-20261015-01 ──
// Weekday reminder to each approver (M&E officer, HOD) listing the reports
// whose current approval step is theirs. Values escaped (CSP-04).

const { esc, appUrl, itemBlock, decideLink } = require('./_helpers');

/**
 * Email template — "N reports are waiting for your review".
 *
 * @param {object} data - outbox payload
 * @param {object} data.metadata - count, reviewUrl,
 *   items [{ type, code, title, division, period, since }]
 * @returns {string} HTML email body
 * @example reviewPendingReminderTemplate({ metadata: { count: 1, items: [{ code: '1.2.3.1' }] } });
 */
function reviewPendingReminderTemplate(data) {
  const m = (data && data.metadata) || {};
  const items = Array.isArray(m.items) ? m.items : [];
  const count = items.length;
  const list = items
    .map((i) => itemBlock({
      code: i.code,
      title: i.title,
      meta: [i.type, i.division, i.period, i.since && `waiting since ${i.since}`],
    }) + decideLink(i.decideUrl))
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:#1A5632; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">Reports waiting for your review</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Africa CDC — RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 10px;">
          ${count} ${count === 1 ? 'report is' : 'reports are'} waiting for your decision. Please approve or return ${count === 1 ? 'it' : 'them'} so the business units can move on.
        </p>
        ${list}
        <p style="text-align:center; margin:25px 0;">
          <a href="${appUrl(m.reviewUrl)}" style="display:inline-block; padding:10px 24px; background:#1A5632; color:white; text-decoration:none; font-size:13px; font-weight:600;">
            Open Review Submissions
          </a>
        </p>
        <p style="color:#666; font-size:12px; margin:0;">${esc('You receive this reminder every working day while reports wait for you.')}</p>
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

/** Subject, e.g. "3 reports waiting for your review". */
reviewPendingReminderTemplate.subject = (data) => {
  const items = (data && data.metadata && data.metadata.items) || [];
  return `${items.length} ${items.length === 1 ? 'report' : 'reports'} waiting for your review`;
};

module.exports = reviewPendingReminderTemplate;
