// ── Activity Updated Email Template ──
// Every interpolated field is escaped via `@rbm/lib/html` (CSP-04). Status
// colors reference `STATUS_COLORS` from `@rbm/lib/enums` so we don't
// duplicate the palette here (was F-017 inline `STATUS_COLORS`).

const { escape } = require('@rbm/lib/html');
const { STATUS_COLORS } = require('@rbm/lib/enums');
const { esc, when, firstOf, kvRow, kvList } = require('./_helpers');

const FALLBACK_COLOR = '#4a5568';

function colorFor(statusKey) {
  const entry = STATUS_COLORS[statusKey];
  return entry && entry.text ? entry.text : FALLBACK_COLOR;
}

function prepare(data) {
  return {
    activityName:   esc(data.activityName, 'Unknown Activity'),
    activityCode:   esc(data.activityCode),
    previousStatus: firstOf(data.previousStatus, ''),
    newStatus:      firstOf(data.newStatus, ''),
    updatedBy:      esc(data.updatedBy),
    updatedAt:      esc(data.updatedAt, new Date().toISOString().split('T')[0]),
    projectName:    esc(data.projectName, 'your project'),
    comments:       esc(data.comments),
    dashboardUrl:   escape(firstOf(data.dashboardUrl, process.env.APP_URL, 'http://localhost:5173')),
  };
}

/**
 * Renders the "activity status updated" email body as an HTML string.
 *
 * @param {object} data — template inputs (all optional; sensible defaults).
 * @param {string} [data.activityName]
 * @param {string} [data.activityCode]
 * @param {string} [data.previousStatus]
 * @param {string} [data.newStatus]
 * @param {string} [data.updatedBy]
 * @param {string} [data.updatedAt]
 * @param {string} [data.projectName]
 * @param {string} [data.comments]
 * @param {string} [data.dashboardUrl] — defaults to `APP_URL`.
 * @returns {string} Complete HTML document.
 * @example
 * const html = activityUpdatedTemplate({
 *   activityName: 'Vaccine rollout Q2',
 *   newStatus: STATUSES.IN_PROGRESS,
 *   projectName: 'Immunization 2026',
 * });
 */
function activityUpdatedTemplate(data) {
  const f = prepare(data);
  const prevColor = colorFor(f.previousStatus);
  const newColor  = colorFor(f.newStatus);
  const activityCell = when(f.activityCode, (c) => `[${c}] `) + f.activityName;
  // eslint-disable-next-line no-restricted-syntax -- 'Activity' is the row label printed in the email, not an ENTITY_TYPES identifier
  const activityRow = kvRow('Activity', activityCell);
  const commentsRow = when(f.comments, (c) => kvRow('Comments', c));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:#1A5632; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">Activity Status Updated</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Africa CDC — RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 15px;">
          An activity has been updated in ${f.projectName}:
        </p>

        ${kvList(`
${activityRow}
${kvRow('Previous Status', `<span style="display:inline-block; padding:3px 10px; font-size:11px; font-weight:600; color:${prevColor};"> ${escape(f.previousStatus || 'N/A')} </span>`)}
${kvRow('New Status', `<span style="display:inline-block; padding:3px 10px; font-size:11px; font-weight:600; color:${newColor};"> ${escape(f.newStatus || 'N/A')} </span>`)}
${kvRow('Updated By', f.updatedBy)}
${kvRow('Date', f.updatedAt)}
${commentsRow}`)}

        <p style="text-align:center; margin:25px 0;">
          <a href="${f.dashboardUrl}" style="display:inline-block; padding:10px 24px; background:#1A5632; color:white; text-decoration:none; font-size:13px; font-weight:600;">
            View in Dashboard
          </a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:15px 30px; background:#f7fafc; border-top:1px solid #e2e8f0; text-align:center;">
        <p style="margin:0; font-size:11px; color:#a0aec0;">
          Africa CDC — RBM Platform | Automated notification
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = activityUpdatedTemplate;
