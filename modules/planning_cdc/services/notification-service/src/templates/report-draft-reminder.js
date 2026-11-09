const { itemBlock } = require('./_helpers');

/**
 * Reminder email for users with DRAFT reports that haven't been
 * submitted yet. Triggered by POST /api/admin/reports/remind-drafts
 * (typically from a system cron). Plain HTML, same visual language as
 * `report-submitted` / `contrib-*` templates.
 *
 * @param {object} data
 * @param {object} data.user              — { first_name, last_name }
 * @param {number} data.count             — number of draft reports
 * @param {Array<object>} data.drafts     — [{ indicator_code, indicator_title, quarter, fiscal_year, division_name }]
 * @param {string} data.portalUrl         — direct link to the reporting page
 * @returns {string} HTML body
 */
function render({ user, count, drafts = [], portalUrl = 'https://pra.africacdc.org/report' }) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Colleague';
  const items = drafts.slice(0, 20).map((d) => itemBlock({
    code: d.indicator_code,
    title: d.indicator_title,
    meta: [[d.fiscal_year, d.quarter].filter(Boolean).join(' · '), d.division_name],
  })).join('');
  const more = drafts.length > 20 ? `<p style="font-size:11px;color:#6b7280;margin-top:8px;">…and ${drafts.length - 20} more.</p>` : '';

  return `<!doctype html>
<html><body style="word-break:break-word;overflow-wrap:anywhere;font-family:Arial,sans-serif;font-size:13px;color:#111827;background:#f9fafb;padding:16px;">
  <div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;">
    <div style="background:#1A5632;color:#fff;padding:16px 24px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:.85;">Africa CDC — Quarterly Report reminder</div>
      <div style="font-size:18px;font-weight:600;margin-top:4px;">You have ${count} draft report${count > 1 ? 's' : ''} waiting to be submitted</div>
    </div>
    <div style="padding:20px 24px;">
      <p>Hi ${esc(name)},</p>
      <p>The following quarterly reports are still in <strong>DRAFT</strong> — they have not been submitted for review.</p>
      <div style="margin-top:12px;">${items}</div>
      ${more}
      <p style="margin-top:20px;">
        <a href="${esc(portalUrl)}" style="background:#1A5632;color:#fff;padding:10px 18px;text-decoration:none;font-weight:600;font-size:13px;">Open reporting page</a>
      </p>
      <p style="font-size:11px;color:#6b7280;margin-top:20px;">You are receiving this email because you are listed as reporter on the drafts above. If a draft is no longer relevant, reject it or ask an admin to archive it.</p>
    </div>
  </div>
</body></html>`;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

render.subject = 'You have draft quarterly reports pending';
module.exports = render;
