/**
 * Monthly, on day `digest.monthly.day` from `digest.monthly.hour_utc`: email
 * each director the digest of their directorate (D-20261105-15). Switch:
 * `digest.monthly.enabled`. Only on that day, so a deployment later in the
 * month sends nothing; reminder_log keeps one email per month and
 * directorate.
 */
'use strict';

const settings = require('../services/settingsService');
const { sendMonthlyDigests } = require('../services/digest/directorDigest');
const { defineJob } = require('./scheduler');

async function tick(now = new Date()) {
  if (!(await settings.getBool('digest.monthly.enabled', true))) return null;
  if (now.getUTCDate() !== (await settings.getInt('digest.monthly.day', 1))) return null;
  if (now.getUTCHours() < (await settings.getInt('digest.monthly.hour_utc', 6))) return null;
  return sendMonthlyDigests(now);
}

module.exports = defineJob({ name: 'monthlyDigestJob', tick });
