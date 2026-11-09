// ── Generic Approval Step — Decided Email ──
// Sent when a workflow approval step is decided (approved / rejected) on
// any entity. Used by the wizard for events like `approval_step.decided`,
// `plan_node.approved`, `plan_node.rejected`, `budget_line.approved`.
//
// Interpolated fields escaped via @rbm/lib/html (CSP-04).

const { esc, when, appUrl, firstOf, kvRow, kvList } = require('./_helpers');

function decisionLabel(meta) {
  return (meta.decision || meta.status || 'decided').toString().toLowerCase();
}

function prepare(data) {
  const entity   = data?.entity || {};
  const meta     = data?.metadata || {};
  const decision = decisionLabel(meta);
  return {
    entityType:    esc(firstOf(meta.entity_label, entity.entity_type), 'Item'),
    code:          esc(firstOf(entity.code, meta.code)),
    title:         esc(firstOf(entity.title, entity.name, meta.title), 'Untitled'),
    decision:      esc(firstOf(meta.decision_label, decision)),
    decidedBy:     esc(firstOf(meta.actor_name, data?.actor?.email)),
    reason:        esc(firstOf(meta.reason, meta.comment)),
    isApproved:    decision.includes('approve'),
    reportUrl:     appUrl(firstOf(meta.reportUrl, meta.report_url)),
  };
}

/**
 * Email template — generic "approval step decided" notification.
 * Sent to the original requester (or owner) when an approval step closes.
 *
 * @param {object} data — bus payload (entity / actor / metadata).
 * @returns {string} HTML body.
 *
 * @example
 *   approvalStepDecidedTemplate({
 *     entity: { entity_type: 'plan_node', code: 'A.1' },
 *     metadata: { decision: 'approved', actor_name: 'Director' },
 *   });
 */
function approvalStepDecidedTemplate(data) {
  const f = prepare(data);
  const codeLine = when(f.code, (c) => `<strong>${c}</strong> — `) + f.title;
  const banner   = f.isApproved ? '#1A5632' : '#9b2c2c';
  const reasonRow = when(f.reason, (r) => kvRow('Reason', r));

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:${banner}; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px; text-transform:capitalize;">${f.entityType} ${f.decision}</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Africa CDC — RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 15px;">
          The approval step on your ${f.entityType.toLowerCase()} has been <strong>${f.decision}</strong>.
        </p>
        ${kvList(`
${kvRow('${f.entityType}', codeLine)}
${kvRow('Decided by', f.decidedBy)}
${reasonRow}`)}
        <p style="text-align:center; margin:25px 0;">
          <a href="${f.reportUrl}" style="display:inline-block; padding:10px 24px; background:${banner}; color:white; text-decoration:none; font-size:13px; font-weight:600;">
            Open in RBM
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

approvalStepDecidedTemplate.subject = 'Approval decision';
module.exports = approvalStepDecidedTemplate;
