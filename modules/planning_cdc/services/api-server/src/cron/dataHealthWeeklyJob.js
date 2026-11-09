/**
 * Weekly, on `reports.data_health.weekday` from `reports.data_health.hour_utc`:
 * email the data health checks that are not empty to the M&E officers and
 * RBM administrators (D-20261105-11). Switch: `reports.data_health.enabled`.
 * reminder_log keeps one email per ISO week, so running every 15 minutes
 * is safe.
 */
'use strict';

const settings = require('../services/settingsService');
const { sendWeeklyDataHealth } = require('../services/dataHealth/dataHealthReport');
const { defineJob, isDue } = require('./scheduler');

async function tick(now = new Date()) {
  if (!(await settings.getBool('reports.data_health.enabled', true))) return null;
  const weekday = await settings.getInt('reports.data_health.weekday', 1);
  if (!isDue(now, { hour: await settings.getInt('reports.data_health.hour_utc', 7), weekday })) return null;
  return sendWeeklyDataHealth(now);
}

module.exports = defineJob({ name: 'dataHealthWeeklyJob', tick });
