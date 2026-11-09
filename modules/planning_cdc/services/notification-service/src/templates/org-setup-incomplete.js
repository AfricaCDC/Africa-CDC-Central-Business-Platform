// ── Org structure set-up reminder — D-20261015-07 ──
// Weekly email to the system and RBM administrators: the business units
// without a responsible person, an M&E officer or a focal person, and what
// each gap does to the approvals. Values escaped (CSP-04).

const { esc, appUrl, itemBlock, kvRow, kvList } = require('./_helpers');

/**
 * Email template — business units to complete in the org structure.
 *
 * @param {object} data - outbox payload
 * @param {object} data.metadata - fiscalYear, url, units [{ code, name, missing[] }], counts [{ label, count }]
 * @returns {string} HTML email body
 * @example orgSetupIncompleteTemplate({ metadata: { units: [{ code: 'EPR', name: 'EPR', missing: ['M&E officer'] }] } });
 */
function orgSetupIncompleteTemplate(data) {
  const m = (data && data.metadata) || {};
  const units = Array.isArray(m.units) ? m.units : [];
  const counts = Array.isArray(m.counts) ? m.counts : [];
  const list = units
    .map((u) => itemBlock({ code: u.code, title: u.name, meta: [`Missing: ${(u.missing || []).join(', ')}`] }))
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:#B45309; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">Org structure to complete</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">${esc(units.length)} business units · ${esc(m.fiscalYear)} · Africa CDC · RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 12px;">
          These business units own workplan items this year but miss a responsible person, an M&amp;E officer or a focal person.
          Please set them in the org structure.
        </p>
        <ul style="color:#333; font-size:13px; margin:0 0 15px; padding-left:18px;">
          <li><strong>Responsible person</strong>: approves the unit's reports. Without one, the responsible person of the level above approves (for a division, the one of its directorate).</li>
          <li><strong>M&amp;E officer</strong>: signs off the unit's reports. Without one, the reports go to the pool and every M&amp;E officer is reminded.</li>
          <li><strong>Focal person</strong>: receives the unit's reminders and decisions. Without one, nobody in the unit receives them.</li>
        </ul>
        ${kvList(counts.map((c) => kvRow(esc(`Without ${c.label}`), esc(c.count, '0'))).join(''))}
        ${list}
        <p style="text-align:center; margin:25px 0;">
          <a href="${appUrl(m.url)}" style="display:inline-block; padding:10px 24px; background:#1A5632; color:white; text-decoration:none; font-size:13px; font-weight:600;">
            Open the org structure
          </a>
        </p>
        <p style="color:#666; font-size:12px; margin:0;">This reminder is sent every week until every business unit is complete.</p>
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

/** Subject, e.g. "Org structure: 35 business units to complete". */
orgSetupIncompleteTemplate.subject = (data) => {
  const units = (data && data.metadata && data.metadata.units) || [];
  return `Org structure: ${units.length} business units to complete`;
};

module.exports = orgSetupIncompleteTemplate;
