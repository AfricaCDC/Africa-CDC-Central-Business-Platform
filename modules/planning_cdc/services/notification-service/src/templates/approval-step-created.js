// ── Generic Approval Step — Created Email ──
// Sent when a workflow approval step is created (any entity) and a user is
// the designated approver. Used by the notification wizard for events like
// `approval_step.created` and `plan_node.submitted`.
//
// Interpolated fields escaped via @rbm/lib/html (CSP-04).

const { esc, when, appUrl, firstOf, kvRow, kvList, decideButtons } = require('./_helpers');

function prepare(data) {
  const entity = (data && data.entity) || {};
  const meta   = (data && data.metadata) || {};
  const actor  = (data && data.actor) || {};
  return {
    entityType:    esc(firstOf(meta.entity_label, entity.entity_type), 'Item'),
    code:          esc(firstOf(entity.code, meta.code)),
    title:         esc(firstOf(entity.title, entity.name, meta.title), 'Untitled'),
    submittedBy:   esc(firstOf(meta.actor_name, actor.email)),
    stepLabel:     esc(meta.step_label, 'Approval needed'),
    note:          esc(meta.note),
    reviewUrl:     appUrl(firstOf(meta.reviewUrl, meta.review_url)),
    decide:        decideButtons(meta.decideUrl),
  };
}

/**
 * Email template — generic "approval step created" notification.
 * Sent to the approver when a workflow step is opened.
 *
 * @param {object} data — bus payload (entity / actor / metadata).
 * @returns {string} HTML body.
 *
 * @example
 *   approvalStepCreatedTemplate({
 *     entity: { entity_type: 'plan_node', code: 'A.1', title: 'Foo' },
 *     metadata: { actor_name: 'Jane', step_label: 'HoD review' },
 *   });
 */
function approvalStepCreatedTemplate(data) {
  const f = prepare(data);
  const codeLine = when(f.code, (c) => `<strong>${c}</strong> — `) + f.title;
  const noteRow = when(f.note, (n) => kvRow('Note', n));

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="word-break:break-word;overflow-wrap:anywhere;margin:0; padding:0; background:#f7fafc; font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:white;">
    <tr>
      <td style="background:#1A5632; padding:20px 30px; color:white;">
        <h1 style="margin:0; font-size:18px;">${f.stepLabel}</h1>
        <p style="margin:4px 0 0; font-size:12px; opacity:0.9;">Africa CDC — RBM Platform</p>
      </td>
    </tr>
    <tr>
      <td style="padding:25px 30px;">
        <p style="color:#333; font-size:14px; margin:0 0 15px;">
          A new approval step is awaiting your review.
        </p>
        ${kvList(`
${kvRow('${f.entityType}', codeLine)}
${kvRow('Submitted by', f.submittedBy)}
${noteRow}`)}
        ${f.decide}
        <p style="text-align:center; margin:25px 0;">
          <a href="${f.reviewUrl}" style="display:inline-block; padding:10px 24px; background:#1A5632; color:white; text-decoration:none; font-size:13px; font-weight:600;">
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

approvalStepCreatedTemplate.subject = 'Approval needed';
module.exports = approvalStepCreatedTemplate;
