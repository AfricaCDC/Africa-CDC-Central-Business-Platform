/**
 * Budget execution from the MIS export (D-20261015-04).
 *
 * Mounted at /api/budget-execution (nginx and the Vite proxy route /api/*
 * as a whole). RBAC module `budget_execution`:
 *   · read (scope-filtered: a BU sees its activities, a director the
 *     directorate, M&E / admins everything);
 *   · import an export, link a fund center, delete an import: create /
 *     update / delete at scope `all`.
 */

'use strict';

const router = require('express').Router();
const multer = require('multer');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/rbacMiddleware');
const { audit } = require('../middleware/auditLog');
const rbacService = require('../services/rbacService');
const { RBAC_MODULES, RBAC_ACTIONS, RBAC_SCOPES } = require('@rbm/lib/rbac');
const { ForbiddenError, NotFoundError, ValidationError } = require('@rbm/lib/errors');
const query = require('../services/budgetExecution/budgetExecutionQuery');
const imports = require('../services/budgetExecution/budgetExecutionImports');
const links = require('../services/budgetExecution/budgetExecutionLinks');
const { allowedDivisions, effectiveDivisions } = require('../services/budgetExecution/budgetExecutionScope');
const { readQuery, uploadBody, linkBody, idParam } = require('./_budgetExecutionSchemas');
const { notifyDivisions } = require('../services/budgetExecution/budgetExecutionNotices');
const variance = require('../services/budgetExecution/budgetVariance');
const { importStatus, notifyImportDone } = require('../services/budgetExecution/budgetImportReminder');

const MODULE = RBAC_MODULES.BUDGET_EXECUTION;
const XLSX_TYPES = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'];
const MAX_BYTES = 15 * 1024 * 1024;

router.use(authenticateToken);

const canRead = authorize({ module: MODULE, action: RBAC_ACTIONS.READ });
/** Managing imports and links is institution-wide: the action must be granted at scope `all`. */
const requireManage = (action) => asyncHandler(async (req, _res, next) => {
  const { allowed, scope } = await rbacService.checkPermission(req.user.id, MODULE, action);
  if (!allowed || scope !== RBAC_SCOPES.ALL) throw new ForbiddenError('You do not have permission to manage budget execution');
  next();
});


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, XLSX_TYPES.includes(file.mimetype) && /\.xlsx$/i.test(file.originalname)),
});
const receiveFile = (req, res) => new Promise((resolve, reject) => {
  upload.single('file')(req, res, (err) => {
    if (err) reject(new ValidationError(err.code === 'LIMIT_FILE_SIZE' ? 'The file is larger than 15 MB' : 'The file could not be uploaded'));
    else resolve();
  });
});

const parse = (schema, value) => {
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(r.error.issues[0]?.message || 'Invalid request');
  return r.data;
};

/** Year, import and division filter of a read request. `import` is null when nothing was imported yet. */
async function readContext(req) {
  const q = parse(readQuery, req.query);
  const fiscalYear = q.fiscal_year || String(new Date().getUTCFullYear());
  const importRow = await query.resolveImport(fiscalYear, q.import_id);
  const divisions = await effectiveDivisions(q.division, await allowedDivisions(req.user, req.rbac.scope));
  return { fiscalYear, importRow: importRow && importRow.fiscal_year === fiscalYear ? importRow : null, divisions };
}

const emptyTotals = () => query.totals([]);

/**
 * @name GET /api/budget-execution/summary
 * @returns 200 `{ success, data: { fiscal_year, import, totals, divisions } }` — the user's scope only
 * @example GET /api/budget-execution/summary?fiscal_year=2026
 */
router.get('/summary', canRead, asyncHandler(async (req, res) => {
  const { fiscalYear, importRow, divisions } = await readContext(req);
  if (!importRow) return res.json({ success: true, data: { fiscal_year: fiscalYear, import: null, totals: emptyTotals(), divisions: [] } });
  const activities = await query.activityExecution({ importId: importRow.id, fiscalYear, divisions });
  return res.json({ success: true, data: {
    fiscal_year: fiscalYear, import: importRow, totals: query.totals(activities), divisions: query.divisionExecution(activities),
  } });
}));

/**
 * @name GET /api/budget-execution/activities
 * @returns 200 `{ success, data: { fiscal_year, import, items } }`
 * @example GET /api/budget-execution/activities?fiscal_year=2026&division=EPR
 */
router.get('/activities', canRead, asyncHandler(async (req, res) => {
  const { fiscalYear, importRow, divisions } = await readContext(req);
  const items = importRow ? await query.activityExecution({ importId: importRow.id, fiscalYear, divisions }) : [];
  // Over budget / slow execution flag per activity (D-20261105-13).
  const flagged = importRow ? variance.withVariance(items, await variance.varianceRules(importRow.as_of_date)) : [];
  res.json({ success: true, data: { fiscal_year: fiscalYear, import: importRow, items: flagged } });
}));

/**
 * @name GET /api/budget-execution/activities/:id
 * @returns 200 `{ success, data: { fiscal_year, import, activity } }` with the GL detail · 404 outside the user's scope
 * @example GET /api/budget-execution/activities/68?fiscal_year=2026
 */
router.get('/activities/:id', canRead, asyncHandler(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { fiscalYear, importRow, divisions } = await readContext(req);
  if (!importRow) throw new NotFoundError('No budget execution imported for this year yet');
  const activity = (await query.activityExecution({ importId: importRow.id, fiscalYear, divisions })).find((a) => a.id === id);
  if (!activity) throw new NotFoundError('No budget execution for this activity');
  res.json({ success: true, data: { fiscal_year: fiscalYear, import: importRow, activity: await query.activityDetail({ importId: importRow.id, activity }) } });
}));

/**
 * @name GET /api/budget-execution/import-status
 * @returns 200 `{ success, data: { week_start, done, last_import } }` — was the MIS export imported this week
 */
router.get('/import-status', canRead, asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await importStatus() });
}));

/**
 * @name GET /api/budget-execution/imports
 * @returns 200 `{ success, data: imports[] }` with their institution-wide totals — managers only · 403
 */
router.get('/imports', requireManage(RBAC_ACTIONS.CREATE), asyncHandler(async (req, res) => {
  const { fiscal_year: fy } = parse(readQuery, req.query);
  res.json({ success: true, data: await imports.listImports(fy || String(new Date().getUTCFullYear())) });
}));

/**
 * @name POST /api/budget-execution/imports — multipart: file (.xlsx), fiscal_year, as_of_date, notify ('1' emails the BUs)
 * @returns 201 `{ success, data: { id, fund_center_count, line_count, notified_divisions } }` · 400 invalid export · 403
 */
router.post('/imports', requireManage(RBAC_ACTIONS.CREATE), asyncHandler(async (req, res) => {
  await receiveFile(req, res);
  if (!req.file) throw new ValidationError('Choose the budget execution export (.xlsx)');
  const body = parse(uploadBody, req.body);
  const created = await imports.importExport({
    buffer: req.file.buffer, fileName: req.file.originalname, fiscalYear: body.fiscal_year, asOfDate: body.as_of_date, userId: req.user.id,
  });
  await audit(req, 'BUDGET_EXECUTION_IMPORTED', 'budget_execution_import', created.id,
    { fiscal_year: body.fiscal_year, as_of_date: body.as_of_date, lines: created.line_count });
  const importRow = await query.resolveImport(body.fiscal_year, created.id);
  const notified = body.notify === '1' ? (await notifyDivisions({ importRow, actor: req.user })).divisions : 0;
  if (notified) await variance.alertVariance({ importRow, actor: req.user });
  await notifyImportDone({ importRow, created, notifiedDivisions: notified, actor: req.user });
  res.status(201).json({ success: true, data: { ...created, notified_divisions: notified } });
}));

/**
 * @name DELETE /api/budget-execution/imports/:id
 * @returns 200 `{ success, data: { id } }` · 403 · 404
 */
router.delete('/imports/:id', requireManage(RBAC_ACTIONS.DELETE), asyncHandler(async (req, res) => {
  const { id } = parse(idParam, req.params);
  const removed = await imports.deleteImport(id);
  await audit(req, 'BUDGET_EXECUTION_IMPORT_DELETED', 'budget_execution_import', id, { as_of_date: removed.as_of_date });
  res.json({ success: true, data: { id } });
}));

/**
 * @name GET /api/budget-execution/unlinked
 * @returns 200 `{ success, data: { fiscal_year, import, items } }` — fund centers with no activity, with a suggestion
 */
router.get('/unlinked', requireManage(RBAC_ACTIONS.UPDATE), canRead, asyncHandler(async (req, res) => {
  const { fiscalYear, importRow } = await readContext(req);
  const items = importRow ? await links.unlinkedFundCenters({ importId: importRow.id, fiscalYear }) : [];
  res.json({ success: true, data: { fiscal_year: fiscalYear, import: importRow, items } });
}));

/**
 * @name POST /api/budget-execution/links
 * @returns 201 `{ success, data: { id } }` · 400 not a broad activity of the year · 403 · 409 already linked
 */
router.post('/links', requireManage(RBAC_ACTIONS.UPDATE), asyncHandler(async (req, res) => {
  const body = parse(linkBody, req.body);
  const created = await links.linkFundCenter({
    fundCenter: body.fund_center, planNodeId: body.plan_node_id, fiscalYear: body.fiscal_year, importId: body.import_id,
  });
  await audit(req, 'BUDGET_CODE_LINKED', 'budget_code', created.id, { fund_center: body.fund_center, plan_node_id: body.plan_node_id });
  res.status(201).json({ success: true, data: created });
}));

module.exports = router;
