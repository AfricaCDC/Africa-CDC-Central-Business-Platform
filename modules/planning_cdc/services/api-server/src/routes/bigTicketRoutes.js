/**
 * Big Tickets — leadership priorities tracked quarterly (D-20261015-02).
 *
 * Mounted at /api/big-tickets (nginx and the Vite proxy route /api/* as a whole).
 * RBAC module `big_ticket`: read for the list and detail; managing a ticket
 * (create / update) needs scope `all`, delete needs `delete`.
 */

'use strict';

const router = require('express').Router();
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const { validate } = require('../middleware/validate');
const { audit } = require('../middleware/auditLog');
const rbacService = require('../services/rbacService');
const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
const { ForbiddenError, NotFoundError } = require('@rbm/lib/errors');
const query = require('../services/bigTickets/bigTicketsQuery');
const write = require('../services/bigTickets/bigTicketsWrite');
const { bigTicketsExport, defaultQuarter } = require('../services/bigTickets/bigTicketsExport');
const { sendExport } = require('./reporting/_exportHelpers');
const { ticketSchema, listQuerySchema, idParamSchema, indicatorQuerySchema, exportQuerySchema } = require('./_bigTicketSchemas');

const MODULE = RBAC_MODULES.BIG_TICKET;
const ALL = 'all';

router.use(authenticateToken);

const canRead = authorize({ module: MODULE, action: RBAC_ACTIONS.READ });

/** Managing tickets is institution-wide: the action must be granted at scope `all`. */
const requireManage = (action) => asyncHandler(async (req, _res, next) => {
  const { allowed, scope } = await rbacService.checkPermission(req.user.id, MODULE, action);
  if (!allowed || scope !== ALL) throw new ForbiddenError('You do not have permission to manage Big Tickets');
  next();
});

const currentYear = () => String(new Date().getUTCFullYear());

/**
 * @name GET /api/big-tickets
 * @returns 200 `{ success, data: { fiscal_year, quarter, items } }`
 * @example GET /api/big-tickets?fiscal_year=2026&quarter=Q2&pillar_id=2
 */
router.get('/', canRead, validate(listQuerySchema, 'query'), asyncHandler(async (req, res) => {
  // req.query is read-only in Express 5: validate() checked it, parse again for the coerced values.
  const f = listQuerySchema.parse(req.query);
  const fiscalYear = f.fiscal_year || currentYear();
  const quarter = f.quarter || await defaultQuarter(fiscalYear);
  const items = await query.listTickets({ fiscalYear, quarter, pillarId: f.pillar_id, lead: f.lead, progress: f.progress, q: f.q });
  res.json({ success: true, data: { fiscal_year: fiscalYear, quarter, items } });
}));

/**
 * @name GET /api/big-tickets/indicator-options
 * @returns 200 `{ success, data: [{ id, code, title, node_type }] }`
 * @example GET /api/big-tickets/indicator-options?fiscal_year=2026&q=KM.10
 */
/**
 * Excel (or CSV) of every ticket of the year, one row per indicator line, in
 * the shape of PR&A's consolidation; `quarter` (default: latest with reports)
 * gives the performance, status and narration columns. RBAC `big_ticket:export`.
 *
 * @name GET /api/big-tickets/export
 * @returns 200 xlsx/csv attachment · 400 · 403
 * @example GET /api/big-tickets/export?fiscal_year=2026&quarter=Q3
 */
router.get('/export', authorize({ module: MODULE, action: RBAC_ACTIONS.EXPORT }), validate(exportQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const f = exportQuerySchema.parse(req.query);
    const fiscalYear = f.fiscal_year || currentYear();
    const quarter = f.quarter || await defaultQuarter(fiscalYear);
    // Tickets are read by everyone (read at scope all); a business unit's drafts only go to an institution-wide export scope.
    const { headers, rows } = await bigTicketsExport({ fiscalYear, quarter, includeDrafts: req.rbac?.scope === ALL });
    await audit(req, 'BIG_TICKETS_EXPORTED', 'big_ticket', null, { fiscal_year: fiscalYear, quarter, format: f.format });
    return sendExport(res, {
      format: f.format, rows, headers, baseName: `big-tickets-${fiscalYear}-${quarter}`, sheetName: `Big Tickets ${quarter} ${fiscalYear}`,
    });
  }));

router.get('/indicator-options', canRead, validate(indicatorQuerySchema, 'query'), asyncHandler(async (req, res) => {
  const f = indicatorQuerySchema.parse(req.query);
  res.json({ success: true, data: await query.searchIndicators({ fiscalYear: f.fiscal_year, q: f.q }) });
}));

/**
 * @name GET /api/big-tickets/:id
 * @returns 200 `{ success, data: ticket }` · 404 when unknown
 * @example GET /api/big-tickets/12?fiscal_year=2026
 */
router.get('/:id', canRead, validate(idParamSchema, 'params'), asyncHandler(async (req, res) => {
  const fiscalYear = /^\d{4}$/.test(req.query.fiscal_year || '') ? req.query.fiscal_year : currentYear();
  const ticket = await query.getTicket(req.params.id, fiscalYear);
  if (!ticket) throw new NotFoundError('Big Ticket not found');
  res.json({ success: true, data: ticket });
}));

/**
 * @name POST /api/big-tickets
 * @returns 201 `{ success, data: { id } }` · 400 invalid · 403 · 409 code taken
 */
router.post('/', requireManage(RBAC_ACTIONS.CREATE), validate(ticketSchema), asyncHandler(async (req, res) => {
  const id = await write.createTicket(req.body, req.user.id);
  await audit(req, 'BIG_TICKET_CREATED', 'big_ticket', id, { code: req.body.code });
  res.status(201).json({ success: true, data: { id } });
}));

/**
 * @name PUT /api/big-tickets/:id
 * @returns 200 `{ success, data: { id } }` · 400 · 403 · 404 · 409
 */
router.put('/:id', requireManage(RBAC_ACTIONS.UPDATE), validate(idParamSchema, 'params'), validate(ticketSchema),
  asyncHandler(async (req, res) => {
    await write.updateTicket(req.params.id, req.body, req.user.id);
    await audit(req, 'BIG_TICKET_UPDATED', 'big_ticket', req.params.id, { code: req.body.code, fiscal_year: req.body.fiscal_year });
    res.json({ success: true, data: { id: req.params.id } });
  }));

/**
 * @name DELETE /api/big-tickets/:id
 * @returns 200 `{ success, data: { id } }` · 403 · 404
 */
router.delete('/:id', requireManage(RBAC_ACTIONS.DELETE), validate(idParamSchema, 'params'), asyncHandler(async (req, res) => {
  const removed = await write.deleteTicket(req.params.id);
  await audit(req, 'BIG_TICKET_DELETED', 'big_ticket', removed.id, { code: removed.code });
  res.json({ success: true, data: { id: removed.id } });
}));

module.exports = router;
