/**
 * Working days, from `approvals.escalation.hour_utc`: escalate the approval
 * steps that waited longer than `approvals.escalation.days` (D-20261105-09).
 * Switch: `approvals.escalation.enabled`. Each step is escalated once
 * (`approval_steps.escalated_at`), so running every 15 minutes is safe.
 */
'use strict';

const settings = require('../services/settingsService');
const { escalateDueSteps } = require('../services/approvals/escalationService');
const { defineJob, isDue } = require('./scheduler');

async function tick(now = new Date()) {
  if (!(await settings.getBool('approvals.escalation.enabled', true))) return null;
  if (!isDue(now, { hour: await settings.getInt('approvals.escalation.hour_utc', 6) })) return null;
  return escalateDueSteps(now);
}

module.exports = defineJob({ name: 'approvalEscalationJob', tick });
