// ── Notices when a report is taken out of reporting (D-20261015-01) ──
//
// Through the notification wizard, template `report-removed`:
//   · indicator_report.not_applicable — the main division marked an indicator
//     not applicable for a quarter: its focal person and head, and the heads
//     of the contributing divisions (nobody reports on it any more).
//   · activity_report.draft_deleted — a draft activity report was deleted:
//     its author (when someone else deleted it), the focal person and head
//     of the business unit.
// Fire-and-forget: a notification failure never fails the action.

'use strict';

const db = require('../../config/db');
const { createLogger } = require('@rbm/lib/logger');
const { emitEvent } = require('../eventBusService');
const { APP_URL, indicatorReportUrl, submitterName, text } = require('./reportEmailDetails');

const log = createLogger('api-server').child({ module: 'reportRemovalNotices' });

const NOT_APPLICABLE_EVENT = 'indicator_report.not_applicable';
const DRAFT_DELETED_EVENT = 'activity_report.draft_deleted';

/** Metadata shared by both notices (template `report-removed`). */
async function removalMetadata({ node, period, division, actor, ...rest }) {
  return {
    template_key: 'report-removed',
    code: text(node.code),
    title: text(node.title),
    division: text(division),
    quarter: text(period.quarter),
    fiscalYear: text(period.fiscal_year),
    by: await submitterName(actor?.id, actor),
    ...rest,
  };
}

/**
 * Tell the business unit and the contributors that an indicator was marked
 * not applicable by its main division.
 *
 * @param {{ report: object, node: object, actor: object, reason: string }} p
 * @returns {Promise<void>}
 * @throws {never} failures are logged
 * @example await notifyNotApplicable({ report, node, actor: req.user, reason });
 */
async function notifyNotApplicable({ report, node, actor, reason }) {
  try {
    await emitEvent({
      eventKey: NOT_APPLICABLE_EVENT,
      entity: {
        id: report.id,
        main_division_code: report.division_code,
        contributing_divisions: node.contributing_divisions,
      },
      actor,
      metadata: await removalMetadata({
        node, period: report, division: report.division_code, actor,
        heading: 'Indicator marked not applicable',
        message: `The main division marked this indicator not applicable for ${report.quarter} ${report.fiscal_year}. It is out of the count and nobody reports on it for this quarter.`,
        reportType: 'Indicator report',
        reason,
        reportUrl: indicatorReportUrl(report),
      }),
      knex: db,
    });
  } catch (err) {
    log.error({ err: err && err.message, reportId: report && report.id }, 'not-applicable notice failed');
  }
}

/**
 * Tell the author and the business unit that a draft activity report was deleted.
 *
 * @param {{ removed: { id: number, plan_node_id: number, user_id: number, quarter: string, fiscal_year: string },
 *   actor: object }} p
 * @returns {Promise<void>}
 * @throws {never} failures are logged
 * @example await notifyDraftDeleted({ removed, actor: req.user });
 */
async function notifyDraftDeleted({ removed, actor }) {
  try {
    const node = (await db('plan_nodes').where('id', removed.plan_node_id).first()) || { id: removed.plan_node_id };
    const division = node.responsible_division_code || null;
    await emitEvent({
      eventKey: DRAFT_DELETED_EVENT,
      entity: {
        id: removed.id,
        // The author hears about it only when someone else deleted the draft.
        owner_user_id: removed.user_id === actor?.id ? null : removed.user_id,
        main_division_code: division,
      },
      actor,
      metadata: await removalMetadata({
        node, period: removed, division, actor,
        heading: 'Activity report draft deleted',
        message: 'This draft activity report was deleted. It no longer appears in the reports of the business unit.',
        reportType: 'Activity report',
        reportUrl: `${APP_URL}/activity-report/${node.id}`,
      }),
      knex: db,
    });
  } catch (err) {
    log.error({ err: err && err.message, reportId: removed && removed.id }, 'draft-deleted notice failed');
  }
}

module.exports = { notifyNotApplicable, notifyDraftDeleted, NOT_APPLICABLE_EVENT, DRAFT_DELETED_EVENT };
