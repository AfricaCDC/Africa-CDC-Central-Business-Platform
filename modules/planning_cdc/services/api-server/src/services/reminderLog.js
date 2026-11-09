// ── Reminder log (automation roadmap, lot 0) ──
//
// One row per reminder already sent: (kind, entity, recipient, period). A
// job claims the row before emitting; the unique key makes the claim fail
// the second time, after a restart or on a second api-server instance, so
// nobody receives the same reminder twice for the same period.

'use strict';

const db = require('../config/db');

/**
 * Claim a reminder; true the first time only.
 *
 * @param {{ kind: string, entityType: string, entityId: number|string, recipientId: number, period: string }} r
 * @returns {Promise<boolean>} false when the reminder was already sent for that period
 * @throws {Error} on any DB error other than the duplicate key
 * @example if (await claim({ kind: 'activity_report.overdue', entityType: 'PLAN_NODE', entityId: 42, recipientId: 7, period: '2026-W45' })) send();
 */
async function claim({ kind, entityType, entityId, recipientId, period }) {
  try {
    await db('reminder_log').insert({
      kind,
      entity_type: entityType,
      entity_id: Number(entityId) || 0,
      recipient_user_id: Number(recipientId) || 0,
      period_key: String(period),
    });
    return true;
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return false;
    throw err;
  }
}

module.exports = { claim };
