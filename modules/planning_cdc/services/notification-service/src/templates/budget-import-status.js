// ── Weekly MIS import — reminder or confirmation — D-20261015-04 ──
// `status: 'due'` → nothing imported yet this week, please import.
// `status: 'done'` → the export of the week was imported (by whom, as at when).
// Sent to the finance unit and the system administrators. Values escaped (CSP-04).

const { esc, appUrl, kvRow, kvList } = require('./_helpers');

const DONE = 'done';

function doneBody(m) {
  return `
        <p style="color:#333; font-size:14px; margin:0 0 15px;">
          The budget execution export of this week has been imported. Business units now see their updated balance.
        </p>
        ${kvList(`
${kvRow('Figures as at', esc(m.asOf))}
${kvRow('Fiscal year', esc(m.fiscalYear))}
${kvRow('Imported by', esc(m.importedBy))}
${kvRow('Fund centers', esc(m.fundCenters))}
${kvRow('Business units emailed', esc(m.notifiedDivisions, '0'))}`)}`;
}

function dueBody(m) {
  const last = m.lastAsOf
    ? `The last import holds figures as at <strong>${esc(m.lastAsOf)}</strong>${m.lastImportedBy ? ` (imported by ${esc(m.lastImportedBy)})` : ''}.`
    : 'No budget execution export has been imported yet.';
  return `
        <p style="color:#333; font-size:14px; margin:0 0 12px;">
          The budget execution export has not been imported yet this week: ${esc(m.weekLabel || `week of ${m.weekStart}`)}.
          Business units rely on it to know their balance.
        </p>
        <p style="color:#333; font-size:14px; margin:0 0 12px;">${last}</p>
        <p style="color:#333; font-size:14px; margin:0 0 12px;">Please export the budget execution report (.xlsx) and import it here: <a href="${appUrl(m.url)}" style="color:#1A5632;">${appUrl(m.url)}</a></p>
        <p style="color:#666; font-size:12px; margin:0;">This reminder is sent every working day until the export of the week is imported.</p>`;
}

/**
 * Email template — weekly MIS import reminder, or confirmation that it was done.
 *
 * @param {object} data - outbox payload
 * @param {object} data.metadata - status ('due' | 'done'), weekStart, weekLabel ("Week 43 (19 Oct – 25 Oct 2026)"), url; due: lastAsOf, lastImportedBy;
 *   done: asOf, fiscalYear, importedBy, fundCenters, notifiedDivisions
 * @returns {string} HTML email body
 * @example budgetImportStatusTemplate({ metadata: { status: 'due', weekStart: '2026-10-12' } });
 */
function budgetImportStatusTemplate(data) {
  const m = (data && data.metadata) || {};
  const isDone = m.status === DONE;
  const heading = isDone ? 'Budget execution imported' : 'Budget execution import due';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:${isDone ? '#1A5632' : '#B45309'}; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">${heading}</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">${esc(m.weekLabel || `Week of ${m.weekStart}`)} · Africa CDC · RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        ${isDone ? doneBody(m) : dueBody(m)}
        <p style="text-align:center; margin:25px 0;">
          <a href="${appUrl(m.url)}" style="display:inline-block; padding:10px 24px; background:#1A5632; color:white; text-decoration:none; font-size:13px; font-weight:600;">
            ${isDone ? 'Open budget execution' : 'Import the budget execution'}
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

/** Subject: "Budget execution import due: week of 2026-10-12" or "… imported: figures as at 2026-10-13". */
budgetImportStatusTemplate.subject = (data) => {
  const m = (data && data.metadata) || {};
  return m.status === DONE
    ? `Budget execution imported: figures as at ${m.asOf || ''}`.trim()
    : `Budget execution import due: ${m.weekLabel || `week of ${m.weekStart || ''}`}`.trim();
};

module.exports = budgetImportStatusTemplate;
