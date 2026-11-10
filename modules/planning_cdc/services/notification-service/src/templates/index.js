/**
 * Template registry — maps template_keys to render functions.
 *
 * History:
 *  - Originally keyed by NOTIFICATION_TYPES (kebab-case enum values) for the
 *    legacy `notify(type, ...)` path.
 *  - The notification wizard (D-20260417-01 / task #24) introduced a
 *    `template_key` column on `notification_subscriptions` and
 *    `notification_templates`. Subscriptions reference templates by that
 *    column, and the outbox payload carries `payload.template_key`.
 *
 * Both lookup paths are supported here:
 *   getTemplate(eventKey)        — legacy / row.event_key fallback.
 *   getTemplateByKey(templateKey)— new wizard path; preferred.
 *
 * The worker calls `resolveTemplate(row)` which prefers payload.template_key
 * and falls back to the legacy event_key registry, so old and new outbox
 * rows render side by side without breaking either.
 */

const { NOTIFICATION_TYPES } = require('@rbm/lib/enums');

const activityUpdated         = require('./activity-updated');
const reportSubmitted         = require('./report-submitted');
const reportReviewed          = require('./report-reviewed');
const contribStep1Pending     = require('./contrib-step1-pending');
const contribStep2Pending     = require('./contrib-step2-pending');
const contribStep3Pending     = require('./contrib-step3-pending');
const contribApprovedFinal    = require('./contrib-approved-final');
const contribRejected         = require('./contrib-rejected');
const approvalBlockedMissing  = require('./approval-blocked-missing-hod');
const approvalStepCreated     = require('./approval-step-created');
const approvalStepDecided     = require('./approval-step-decided');
const reportDraftReminder     = require('./report-draft-reminder');
const reportDeadlineReminder  = require('./report-deadline-reminder');
const systemServerError       = require('./system-server-error');
const reportSubmittedDetails  = require('./report-submitted-details');
const reportPreparerChanged   = require('./report-preparer-changed');
const reviewPendingReminder   = require('./review-pending-reminder');
const budgetExecutionSummary  = require('./budget-execution-summary');
const budgetImportStatus      = require('./budget-import-status');
const orgSetupIncomplete      = require('./org-setup-incomplete');
const reportRemoved           = require('./report-removed');
const automationNotice        = require('./automation-notice');

/**
 * @typedef {object} TemplateEntry
 * @property {(data: object) => string} render — produce the HTML body.
 * @property {string} [subject] — default subject (override via `data.subject`).
 */

const entry = (fn, subject) => ({ render: fn, subject: subject || fn.subject });

// ── Registry by template_key (notification wizard path) ────────────────
/** @type {Record<string, TemplateEntry>} */
const TEMPLATES_BY_KEY = Object.freeze({
  // Legacy 4 templates — kept reachable via template_key for new subscriptions.
  'activity-updated':           entry(activityUpdated, 'Activity status updated'),
  'report-submitted':           entry(reportSubmitted),
  'report-reviewed':            entry(reportReviewed),
  // Contributor approval chain (feature-contributor-approval-chain).
  'report-contrib-submitted':       entry(contribStep1Pending),
  'report-contrib-step1-decided':   entry(contribStep2Pending), // step1 done → step2 pending
  'report-contrib-step2-decided':   entry(contribStep3Pending), // step2 done → step3 pending
  'report-contrib-step3-decided':   entry(contribApprovedFinal),
  'report-contrib-rejected':        entry(contribRejected),
  'report-contrib-admin-bypass':    entry(contribApprovedFinal, '[RBM] Admin-bypass approval'),
  'report-contrib-blocked':         entry(approvalBlockedMissing),
  // Generic approval step.
  'approval-step-created':          entry(approvalStepCreated),
  'approval-step-decided':          entry(approvalStepDecided),
  // Admin-triggered draft reminder (D-20260420-38).
  'report-draft-reminder':          entry(reportDraftReminder),
  // Approver-facing quarter-deadline reminder (cron 7/3/1 days + admin trigger).
  'report-deadline-reminder':       entry(reportDeadlineReminder),
  // Live server-error alert to TECH_ALERTS holders (D-20261009-04).
  'system-server-error':            entry(systemServerError),
  // Report content for the business unit's responsible person, and the
  // preparer-change notice (D-20261013-07).
  'report-submitted-details':       entry(reportSubmittedDetails),
  'report-preparer-changed':        entry(reportPreparerChanged),
  // Weekday pending-review reminder and removal notices (D-20261015-01).
  'review-pending-reminder':        entry(reviewPendingReminder),
  'budget-execution-summary':       entry(budgetExecutionSummary),
  'budget-import-status':           entry(budgetImportStatus),
  'org-setup-incomplete':           entry(orgSetupIncomplete),
  'report-removed':                 entry(reportRemoved),
  // Scheduled alerts of the automation roadmap (escalation, overdue, data health…).
  'automation-notice':              entry(automationNotice),
});

// ── Registry by NOTIFICATION_TYPES (legacy `notify(type, …)` path) ─────
/** @type {Record<string, TemplateEntry>} */
const TEMPLATES = Object.freeze({
  [NOTIFICATION_TYPES.ACTIVITY_UPDATED]:   TEMPLATES_BY_KEY['activity-updated'],
  [NOTIFICATION_TYPES.REPORT_SUBMITTED]:   TEMPLATES_BY_KEY['report-submitted'],
  [NOTIFICATION_TYPES.REPORT_REVIEWED]:    TEMPLATES_BY_KEY['report-reviewed'],
  [NOTIFICATION_TYPES.OWNERSHIP_DISPUTE]: { render: activityUpdated, subject: 'Indicator ownership dispute' },
});

/**
 * Legacy lookup — by NOTIFICATION_TYPES value. Throws on unknown key.
 *
 * @param {string} eventKey — canonical {@link NOTIFICATION_TYPES} value.
 * @returns {TemplateEntry}
 * @throws {Error} when `eventKey` is unknown.
 *
 * @example
 *   getTemplate(NOTIFICATION_TYPES.REPORT_SUBMITTED).render(data);
 */
function getTemplate(eventKey) {
  const t = TEMPLATES[eventKey];
  if (!t) throw new Error(`No template registered for event_key '${eventKey}'`);
  return t;
}

/**
 * New lookup — by `notification_subscriptions.template_key` /
 * `notification_templates.template_key`.
 *
 * @param {string} templateKey
 * @returns {TemplateEntry}
 * @throws {Error} when `templateKey` is unknown.
 *
 * @example
 *   getTemplateByKey('report-contrib-submitted').render(data);
 */
function getTemplateByKey(templateKey) {
  const t = TEMPLATES_BY_KEY[templateKey];
  if (!t) throw new Error(`No template registered for template_key '${templateKey}'`);
  return t;
}

/**
 * Worker-facing resolver. Prefers wizard payload.template_key (new path),
 * falls back to legacy row.event_key registry. Centralizes the dual-path
 * logic so worker.sendRow stays simple.
 *
 * @param {object} row — outbox row (with `event_key` and `payload`).
 * @returns {{ entry: TemplateEntry, lookup: 'template_key'|'event_key' }}
 * @throws {Error} when neither path resolves a template.
 */
function lookupByTemplateKey(tk) {
  if (!tk) return null;
  return TEMPLATES_BY_KEY[tk] || null;
}

function lookupByEventKey(ek) {
  if (!ek) return null;
  // Newer events (draft and deadline reminders) are registered only by
  // template key, and their emitters send no payload.template_key: without
  // the second lookup every one of them failed with "No template".
  return TEMPLATES[ek] || TEMPLATES_BY_KEY[ek] || null;
}

function resolveTemplate(row) {
  const payload = parsePayload(row && row.payload);
  const tk = payload && payload.template_key;
  const byKey = lookupByTemplateKey(tk);
  if (byKey) return { entry: byKey, lookup: 'template_key' };
  const byEventKey = lookupByEventKey(row && row.event_key);
  if (byEventKey) return { entry: byEventKey, lookup: 'event_key' };
  const id = row && row.id;
  const ek = (row && row.event_key) || '';
  throw new Error(`No template for outbox row id=${id} (template_key='${tk || ''}', event_key='${ek}')`);
}

function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw !== 'string') return raw || {};
  try { return JSON.parse(raw); } catch { return {}; }
}

module.exports = {
  TEMPLATES,
  TEMPLATES_BY_KEY,
  getTemplate,
  getTemplateByKey,
  resolveTemplate,
};
