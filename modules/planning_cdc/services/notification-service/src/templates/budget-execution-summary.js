// ── Budget execution of a business unit — D-20261015-04 ──
// Sent to the focal person and head of each business unit after an MIS
// import: balance first, then released / committed / spent and the rates,
// then the activities. Values escaped (CSP-04).

const { esc, appUrl, itemBlock, kvRow, kvList } = require('./_helpers');

const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? `$${Math.round(n).toLocaleString('en-US')}` : '-';
};
const rate = (v) => (v === null || v === undefined || v === '' ? '-' : `${v}%`);

/** Activities as stacked blocks (a multi-column table overflows on phones). */
function activityBlocks(activities) {
  return activities.map((a) => itemBlock({
    code: a.code,
    title: a.title,
    meta: [`Balance ${money(a.balance)}`, `Execution ${rate(a.executionPct)}`],
  })).join('');
}

/**
 * Email template — budget balance and execution of a business unit.
 *
 * @param {object} data - outbox payload
 * @param {object} data.metadata - division, asOf, fiscalYear, released, committed, spent,
 *   balance, executionPct, spendPct, activities [{ code, title, balance, executionPct }], moreActivities, url
 * @returns {string} HTML email body
 * @example budgetExecutionSummaryTemplate({ metadata: { division: 'EPR', balance: 1000 } });
 */
function budgetExecutionSummaryTemplate(data) {
  const m = (data && data.metadata) || {};
  const activities = Array.isArray(m.activities) ? m.activities : [];
  const more = Number(m.moreActivities) > 0 ? `<p style="color:#666; font-size:12px; margin:8px 0 0;">And ${Number(m.moreActivities)} more activities on the platform.</p>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:#1A5632; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">Budget execution: ${esc(m.division)}</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Figures as at ${esc(m.asOf)} · fiscal year ${esc(m.fiscalYear)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 15px;">
          The budget execution of your business unit was updated. Your available balance is <strong>${money(m.balance)}</strong>.
        </p>
        <div style="border:1px solid #1A5632; padding:14px; text-align:center; margin:0 0 12px;">
          <div style="font-size:11px; color:#4a5568; text-transform:uppercase;">Available balance</div>
          <div style="font-size:24px; font-weight:700; color:#1A5632; margin-top:4px;">${money(m.balance)}</div>
          <div style="font-size:11px; color:#718096; margin-top:4px;">Released − committed − spent</div>
        </div>
        ${kvList(`
${kvRow('Released', money(m.released))}
${kvRow('Committed', money(m.committed))}
${kvRow('Spent', money(m.spent))}
${kvRow('Execution (committed + spent)', rate(m.executionPct))}
${kvRow('Spent only', rate(m.spendPct))}`)}
        <p style="color:#4a5568; font-size:12px; font-weight:600; margin:18px 0 6px;">Your activities</p>
        ${activityBlocks(activities)}
        ${more}
        <p style="text-align:center; margin:25px 0;">
          <a href="${appUrl(m.url)}" style="display:inline-block; padding:10px 24px; background:#1A5632; color:white; text-decoration:none; font-size:13px; font-weight:600;">
            See the detail by budget line
          </a>
        </p>
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

/** Subject, e.g. "Budget execution of EPR as at 2026-10-13". */
budgetExecutionSummaryTemplate.subject = (data) => {
  const m = (data && data.metadata) || {};
  return `Budget execution of ${m.division || 'your business unit'} as at ${m.asOf || ''}`.trim();
};

module.exports = budgetExecutionSummaryTemplate;
