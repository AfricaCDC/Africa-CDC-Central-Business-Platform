// ── Automation notice — one template for every scheduled alert (roadmap lot 0) ──
// Escalated approvals, overdue activity reports, high-risk activities, data
// health, budget alerts and the monthly digest all send the same shape:
// a heading, a short intro, item lists (optionally in sections) and one
// button. The wording comes from the emitting job. Values escaped (CSP-04).

const { esc, appUrl, itemBlock } = require('./_helpers');

const list = (items) => (Array.isArray(items) ? items : []).map((i) => itemBlock(i)).join('');

function sectionBlock(s) {
  return `
        <h2 style="font-size:14px;color:#1A5632;margin:20px 0 4px;">${esc(s.heading)}</h2>
        ${s.intro ? `<p style="color:#555;font-size:12px;margin:0 0 4px;">${esc(s.intro)}</p>` : ''}
        ${list(s.items)}`;
}

function button(m) {
  if (!m.ctaUrl) return '';
  return `
        <p style="text-align:center; margin:25px 0;">
          <a href="${appUrl(m.ctaUrl)}" style="display:inline-block; padding:10px 24px; background:#1A5632; color:white; text-decoration:none; font-size:13px; font-weight:600;">
            ${esc(m.ctaLabel, 'Open the platform')}
          </a>
        </p>`;
}

/**
 * Email template — generic automation notice.
 *
 * @param {object} data - outbox payload
 * @param {object} data.metadata - subject, heading, intro, items [{ code, title, meta[] }],
 *   sections [{ heading, intro, items }], ctaLabel, ctaUrl, footer
 * @returns {string} HTML email body
 * @example automationNoticeTemplate({ metadata: { heading: 'Activity reports overdue', items: [{ code: '1.2.3.01', title: 'Workshop' }] } });
 */
function automationNoticeTemplate(data) {
  const m = (data && data.metadata) || {};
  const sections = (Array.isArray(m.sections) ? m.sections : []).map(sectionBlock).join('');
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:#1A5632; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">${esc(m.heading, 'RBM Platform notice')}</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Africa CDC · RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        ${m.intro ? `<p style="color:#333; font-size:14px; margin:0 0 10px;">${esc(m.intro)}</p>` : ''}
        ${list(m.items)}
        ${sections}
        ${button(m)}
        ${m.footer ? `<p style="color:#666; font-size:12px; margin:0;">${esc(m.footer)}</p>` : ''}
      </td>
    </tr>
    <tr>
      <td style="padding:15px 30px; background:#f7fafc; border-top:1px solid #e2e8f0; text-align:center;">
        <p style="margin:0; font-size:11px; color:#a0aec0;">Africa CDC · RBM Platform | Automated notification</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Subject chosen by the emitting job, e.g. "2 activity reports overdue". */
automationNoticeTemplate.subject = (data) => {
  const m = (data && data.metadata) || {};
  return m.subject || m.heading || 'RBM Platform notice';
};

module.exports = automationNoticeTemplate;
