/**
 * Working days, from `alerts.high_risk.hour_utc`: email the focal person and
 * the Responsible Person of each High-risk activity that starts within
 * `alerts.high_risk.days_before` days (D-20261105-11). Switch:
 * `alerts.high_risk.enabled`. reminder_log keeps one email per start date,
 * so running every 15 minutes is safe.
 */
'use strict';

const settings = require('../services/settingsService');
const { alertHighRiskSoon } = require('../services/alerts/highRiskSoon');
const { defineJob, isDue } = require('./scheduler');

async function tick(now = new Date()) {
  if (!(await settings.getBool('alerts.high_risk.enabled', true))) return null;
  if (!isDue(now, { hour: await settings.getInt('alerts.high_risk.hour_utc', 6) })) return null;
  return alertHighRiskSoon(now);
}

module.exports = defineJob({ name: 'highRiskAlertJob', tick });
