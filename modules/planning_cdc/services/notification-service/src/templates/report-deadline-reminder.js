const { itemBlock } = require('./_helpers');

/**
 * Deadline reminder for APPROVERS: reports still awaiting their decision while
 * the quarterly reporting window is about to close. Enqueued by the
 * `quarterDeadlineReminderCron` (7/3/1 days before end_date) and by
 * POST /api/reporting/admin/remind-deadline. Same visual language as
 * `report-draft-reminder`.
 *
 * @param {object} data
 * @param {object} data.user            — { first_name, last_name }
 * @param {number} data.count           — number of reports awaiting this approver
 * @param {Array<object>} data.items    — [{ indicator_code, indicator_title, division_name, step_label, quarter, fiscal_year }]
 * @param {string} data.quarter         — e.g. 'Q1'
 * @param {string|number} data.fiscalYear
 * @param {string} data.endDate         — window close date (ISO)
 * @param {number} data.daysLeft        — whole days until close (<=0 => today)
 * @param {string} data.portalUrl       — link to the review page
 * @returns {string} HTML body
 */
function render(data) {
  const d = withDefaults(data);
  const name = displayName(d.user);
  const { plural, isAre, itThem } = plurals(d.count);
  const rows = renderRows(d.items);
  const more = moreLine(d.items);
  const closeLine = closingPhrase(d.daysLeft);
  const dateSuffix = d.endDate ? ` (${esc(String(d.endDate).slice(0, 10))})` : '';

  return `<!doctype html>
<html><body style="word-break:break-word;overflow-wrap:anywhere;font-family:Arial,sans-serif;font-size:13px;color:#111827;background:#f9fafb;padding:16px;">
  <div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;">
    <div style="background:#1A5632;color:#fff;padding:16px 24px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:.85;">Africa CDC — Approval deadline reminder</div>
      <div style="font-size:18px;font-weight:600;margin-top:4px;">${d.count} report${plural} awaiting your approval</div>
    </div>
    <div style="padding:20px 24px;">
      <p>Hi ${esc(name)},</p>
      <p>The <strong>${esc(d.quarter)} ${esc(String(d.fiscalYear))}</strong> reporting window ${closeLine}${dateSuffix}. The following report${isAre} still <strong>awaiting your decision</strong>. Please review ${itThem} before the window closes.</p>
      <div style="margin-top:12px;">${rows}</div>
      ${more}
      <p style="margin-top:20px;">
        <a href="${esc(d.portalUrl)}" style="background:#1A5632;color:#fff;padding:10px 18px;text-decoration:none;font-weight:600;font-size:13px;">Review submissions</a>
      </p>
      <p style="font-size:11px;color:#6b7280;margin-top:20px;">You are receiving this email because these reports are assigned to you for approval. If a report should be handled by someone else, an admin can reassign it on the Review Submissions page.</p>
    </div>
  </div>
</body></html>`;
}

/** Fill defaults so `render({})` (smoke test) and partial payloads are safe. */
function withDefaults(data) {
  const d = data || {};
  return {
    user: d.user || null,
    count: d.count || 0,
    items: d.items || [],
    quarter: d.quarter || '',
    fiscalYear: d.fiscalYear == null ? '' : d.fiscalYear,
    endDate: d.endDate || '',
    daysLeft: d.daysLeft == null ? null : d.daysLeft,
    portalUrl: d.portalUrl || 'https://pra.africacdc.org/report',
  };
}

/** Approver display name with a neutral fallback. */
function displayName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Colleague';
}

/** Pluralisation fragments derived from the report count. */
function plurals(count) {
  const one = count === 1;
  return { plural: one ? '' : 's', isAre: one ? ' is' : 's are', itThem: one ? 'it' : 'them' };
}

/** "closes today" / "closes in N days" (empty when daysLeft unknown). */
function closingPhrase(daysLeft) {
  if (daysLeft == null) return '';
  if (daysLeft <= 0) return '<strong>closes today</strong>';
  return `<strong>closes in ${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>`;
}

/** Render up to 20 report rows. */
function renderRows(items) {
  return items.slice(0, 20).map((d) => itemBlock({
    code: d.indicator_code,
    title: d.indicator_title,
    meta: [d.division_name, d.step_label],
  })).join('');
}

/** "…and N more." footer when the list was truncated. */
function moreLine(items) {
  if (items.length <= 20) return '';
  return `<p style="font-size:11px;color:#6b7280;margin-top:8px;">…and ${items.length - 20} more.</p>`;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

render.subject = 'Reports awaiting your approval — quarter closing soon';
module.exports = render;
