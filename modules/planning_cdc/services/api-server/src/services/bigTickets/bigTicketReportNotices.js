// ── Big Tickets — report notifications (D-20261015-05) ──
//
// Events go through the notification wizard (subscriptions on
// /admin/notifications): submitted → M&E, approved / rejected → author,
// focal person and head of the lead business unit. Templates are the
// shared report-submitted-details and report-reviewed.

'use strict';

const { STATUSES } = require('@rbm/lib/enums');
const { createLogger } = require('@rbm/lib/logger');
const { emitEvent } = require('../eventBusService');
const { submitterName, outcomeRecipients, APP_URL } = require('../reporting/reportEmailDetails');

const log = createLogger('api-server').child({ module: 'bigTicketReportNotices' });
const REPORT_TYPE = 'Big Ticket report';

const reportUrl = (ticket, fiscalYear, quarter) =>
  `${APP_URL}/big-tickets/${ticket.id}/report/${encodeURIComponent(quarter)}?fy=${encodeURIComponent(fiscalYear)}`;

/** Entity routed by the wizard resolvers: author + lead business unit. */
const entityOf = (ticket, report) => ({
  id: report.id,
  title: `${ticket.code}: ${ticket.title}`,
  submitted_by: report.submitted_by,
  ...outcomeRecipients(report.submitted_by || report.created_by, ticket.lead_division_code),
});

function baseMetadata(ticket, report) {
  return {
    reportType: REPORT_TYPE,
    code: ticket.code,
    title: ticket.title,
    division: ticket.lead_division_name || ticket.lead_division_code,
    quarter: report.quarter,
    fiscalYear: report.fiscal_year,
    reportUrl: reportUrl(ticket, report.fiscal_year, report.quarter),
  };
}

/** Never let an email failure break the report write. */
async function safeEmit(payload) {
  try {
    await emitEvent(payload);
  } catch (err) {
    log.error({ err, eventKey: payload.eventKey }, 'Big Ticket report notification failed');
  }
}

/**
 * Notify M&E that the lead BU submitted its report.
 *
 * @param {{ ticket: object, report: object, actor: object }} p - report: the saved row
 * @returns {Promise<void>}
 * @throws {never} errors are logged
 * @example await notifySubmitted({ ticket, report, actor: req.user });
 */
async function notifySubmitted({ ticket, report, actor }) {
  const submittedBy = await submitterName(actor.id, actor);
  const lineLabel = (id) => {
    const line = ticket.lines.find((l) => l.id === id);
    return `Achieved${line?.label || line?.indicator_code ? ` (${line.label || line.indicator_code})` : ''}`;
  };
  await safeEmit({
    eventKey: 'big_ticket_report.submitted',
    entity: entityOf(ticket, report),
    actor,
    metadata: {
      ...baseMetadata(ticket, report),
      submittedBy,
      fields: [
        ['Progress status', report.progress_status],
        ...(report.values || []).map((v) => [lineLabel(v.line_id), v.achieved]),
        ['Progress', report.narrative],
        ['Challenges', report.challenges],
        ['Next steps', report.next_steps],
      ].filter(([, value]) => value).map(([label, value]) => ({ label, value: String(value) })),
      attachments: [],
    },
  });
}

/**
 * Notify the author and the lead BU of the M&E decision.
 *
 * @param {{ ticket: object, report: object, actor: object }} p - report: the decided row
 * @returns {Promise<void>}
 * @throws {never} errors are logged
 * @example await notifyDecision({ ticket, report, actor: req.user });
 */
async function notifyDecision({ ticket, report, actor }) {
  const approved = report.status === STATUSES.APPROVED;
  await safeEmit({
    eventKey: approved ? 'big_ticket_report.approved' : 'big_ticket_report.rejected',
    entity: entityOf(ticket, report),
    actor,
    metadata: {
      ...baseMetadata(ticket, report),
      decision: report.status,
      reviewedBy: await submitterName(actor.id, actor),
      reason: approved ? '' : report.rejection_reason,
    },
  });
}

module.exports = { notifySubmitted, notifyDecision, reportUrl };
