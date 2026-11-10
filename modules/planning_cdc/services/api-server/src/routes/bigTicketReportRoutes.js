/**
 * Big Tickets — quarterly reports of the lead business unit (D-20261015-05).
 *
 * Mounted at /api/big-tickets next to bigTicketRoutes (nginx and the Vite
 * proxy route /api/* as a whole). RBAC module `big_ticket`:
 *   · read the report form: `read`;
 *   · save / submit: `submit` at scope `all` (M&E on behalf of the BUs) or
 *     covering the lead or a contributing BU;
 *   · approve / reject: `approve` at scope `all` (M&E / PR&A).
 */

'use strict';

const router = require('express').Router();
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const { validate } = require('../middleware/validate');
const { audit } = require('../middleware/auditLog');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const { STATUSES } = require('@rbm/lib/enums');
const { ForbiddenError, NotFoundError, ValidationError } = require('@rbm/lib/errors');
const reportingWindow = require('../services/reportingWindowService');
const query = require('../services/bigTickets/bigTicketsQuery');
const reports = require('../services/bigTickets/bigTicketReports');
const notices = require('../services/bigTickets/bigTicketReportNotices');
const { reportParamsSchema, reportSchema, decisionSchema, reportQuerySchema } = require('./_bigTicketSchemas');

router.use(authenticateToken);

const canRead = authorize({ module: RBAC_MODULES.BIG_TICKET, action: RBAC_ACTIONS.READ });
const PATH = '/:id/reports/:quarter';

async function loadTicket(id, fiscalYear) {
  const ticket = await query.getTicket(id, fiscalYear);
  if (!ticket) throw new NotFoundError('Big Ticket not found');
  return ticket;
}

const reportOf = (ticket, quarter) => ticket.reports.find((r) => r.quarter === quarter) || null;

/**
 * @name GET /api/big-tickets/:id/reports/:quarter
 * @returns 200 `{ success, data: { ticket, report, prefill, can_edit, can_review } }` · 404
 * @example GET /api/big-tickets/5/reports/Q3?fiscal_year=2026
 */
router.get(PATH, canRead, validate(reportParamsSchema, 'params'), validate(reportQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { id, quarter } = reportParamsSchema.parse(req.params);
    const fiscalYear = req.query.fiscal_year;
    const ticket = await loadTicket(id, fiscalYear);
    const [prefill, canEdit, canReview] = await Promise.all([
      reports.prefill(ticket.lines, fiscalYear, quarter),
      reports.canReport(req.user, ticket),
      reports.canReview(req.user.id),
    ]);
    res.json({ success: true, data: { ticket, quarter, report: reportOf(ticket, quarter), prefill, can_edit: canEdit, can_review: canReview } });
  }));

/**
 * @name PUT /api/big-tickets/:id/reports/:quarter
 * Save the draft, or submit it with `submit: true`.
 * @returns 200 `{ success, data: { id, status } }` · 400 · 403 · 404 · 409 already submitted
 */
router.put(PATH, validate(reportParamsSchema, 'params'), validate(reportSchema), asyncHandler(async (req, res) => {
  const { id, quarter } = reportParamsSchema.parse(req.params);
  const { fiscal_year: fiscalYear, submit } = req.body;
  reportingWindow.assertReportableYear(fiscalYear);
  const ticket = await loadTicket(id, fiscalYear);
  if (!(await reports.canReport(req.user, ticket))) {
    throw new ForbiddenError("Only the ticket's business units or M&E can report on this Big Ticket");
  }
  const canEditAny = await reports.canReview(req.user.id);
  const saved = await reports.saveReport({ ticket, fiscalYear, quarter, body: req.body, userId: req.user.id, submit, canEditAny });
  await audit(req, submit ? 'BIG_TICKET_REPORT_SUBMITTED' : 'BIG_TICKET_REPORT_SAVED', 'big_ticket_report', saved.id,
    { code: ticket.code, quarter, fiscal_year: fiscalYear });
  if (submit && saved.status === STATUSES.SUBMITTED) {
    const fresh = reportOf(await loadTicket(id, fiscalYear), quarter);
    await notices.notifySubmitted({ ticket, report: fresh, actor: req.user });
  }
  res.json({ success: true, data: saved });
}));

/** POST approve / reject: M&E decision on a SUBMITTED report. */
const decide = (approve) => asyncHandler(async (req, res) => {
  const { id, quarter } = reportParamsSchema.parse(req.params);
  const { fiscal_year: fiscalYear, reason } = req.body;
  if (!(await reports.canReview(req.user.id))) throw new ForbiddenError('Only M&E can review Big Ticket reports');
  if (!approve && !reason) throw new ValidationError('Give the reason for returning the report');
  const ticket = await loadTicket(id, fiscalYear);
  const report = await reports.decideReport({ ticketId: ticket.id, fiscalYear, quarter, approve, reason, userId: req.user.id });
  await audit(req, approve ? 'BIG_TICKET_REPORT_APPROVED' : 'BIG_TICKET_REPORT_REJECTED', 'big_ticket_report', report.id,
    { code: ticket.code, quarter, fiscal_year: fiscalYear, reason: reason || null });
  await notices.notifyDecision({ ticket, report, actor: req.user });
  res.json({ success: true, data: { id: report.id, status: report.status } });
});

/**
 * @name POST /api/big-tickets/:id/reports/:quarter/approve
 * @returns 200 `{ success, data: { id, status } }` · 403 · 404 · 409 nothing submitted
 */
router.post(`${PATH}/approve`, validate(reportParamsSchema, 'params'), validate(decisionSchema), decide(true));

/**
 * @name POST /api/big-tickets/:id/reports/:quarter/reject
 * @returns 200 `{ success, data: { id, status } }` · 400 no reason · 403 · 404 · 409
 */
router.post(`${PATH}/reject`, validate(reportParamsSchema, 'params'), validate(decisionSchema), decide(false));

module.exports = router;
