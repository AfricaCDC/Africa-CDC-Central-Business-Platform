/* eslint-disable complexity, max-lines --
 * Extracted from reportingRoutes.js (task #27 commit 9/N). `complexity`
 * stays for the upload-verification handler which orchestrates base64 → PA
 * → evidence-file INSERT in one asyncHandler. The `no-console` exemption is
 * gone: D-20260818-02 migrated the Power-Automate log lines to the shared
 * structured logger.
 */
// ── Evidence + Power-Automate Upload Routes ──
//
// Extracted from `services/api-server/src/routes/reportingRoutes.js`
// as the sixth and final routes-layer commit of the task #27 split
// (commit 9/N). Two routes: `POST /upload-verification` (base64 file
// → MS Power Automate webhook → evidence_files INSERT) and
// `GET /evidence/:parentType/:parentId` (list evidence for a report).
// Mounted at `/api/reporting` via the parent aggregator — URL paths
// identical to pre-split.

const router = require('express').Router();
const asyncHandler = require('../../middleware/asyncHandler');
const { authenticateToken } = require('../../middleware/authMiddleware');
const { ValidationError, ForbiddenError } = require('@rbm/lib/errors');
const { ALLOWED_EXTENSIONS, MIME_TO_EXT, normalizeExt } = require('@rbm/lib/fileTypes');
const { canWriteEvidence, EVIDENCE_PARENTS } = require('../../services/reporting/reportAccess');
const { ROLES } = require('@rbm/lib/roles');
const { createLogger } = require('@rbm/lib/logger');
const db = require('../../config/db');

const logger = createLogger('evidence-routes');

const DELETE_DIVISION_ROLES = [ROLES.FOCAL_PERSON, ROLES.HEAD_OF_DIVISION, ROLES.DIRECTOR];

// SharePoint forbids  " * : < > ? / \ |  and trips on leading/trailing
// spaces, trailing dots, control chars, and tabs/newlines — any of
// these cause the `CreateNewFolder` action to 502 BadGateway silently.
// Collapse whitespace, strip illegal chars, trim edges, cap length.
const sanitizeSegment = (raw, fallback = 'untitled') => {
  if (raw === null || raw === undefined) return fallback;
  let s = String(raw)
    .replace(/[\u0000-\u001F\u007F]/g, '') // eslint-disable-line no-control-regex -- stripping control chars is the point
    .replace(/[\\/:*?"<>|]/g, '-')                // illegal SP chars
    .replace(/\s+/g, ' ')                         // collapse whitespace
    .trim()
    .replace(/\.+$/, '')                          // no trailing dots
    .slice(0, 120);                               // keep each segment short
  return s || fallback;
};

router.use(authenticateToken);

// Power Automate webhook for means-of-verification upload.
// The flow builds the SharePoint folder tree from the fields below.
//
// SECURITY (D-20260818-02): the URL carries a SAS `sig` token that grants
// arbitrary writes into the Africa CDC SharePoint — it is a SECRET and must
// never be committed. It now comes from POWER_AUTOMATE_URL in .env; when the
// variable is missing the upload degrades to the local-only fallback below
// instead of reaching SharePoint.
const POWER_AUTOMATE_URL = process.env.POWER_AUTOMATE_URL || '';

/**
 * Upload a means-of-verification file: posts base64 payload to Power
 * Automate, stores a reference in evidence_files, returns the new id.
 * @name POST /api/reporting/upload-verification
 * @param {express.Request} req — body `{ file_base64, file_name, mime_type, file_size, parent_type, parent_id, activity_code, division_name, fiscal_year, activity_name, report_type }`
 * @param {express.Response} res — 200 JSON `{ success, data: { file_id, filename, document_id, sharepoint_url } }`
 * @returns {Promise<void>}
 * @throws {ValidationError} when file_base64 or file_name is missing
 * @example POST /api/reporting/upload-verification { file_base64, file_name: 'mov.pdf' }
 */
router.post('/upload-verification', asyncHandler(async (req, res) => {
  const { file_base64, file_name, file_size, parent_type, parent_id, activity_code, division_name, fiscal_year } = req.body;

  if (!file_base64 || !file_name) {
    throw new ValidationError('file_base64 and file_name are required');
  }
  // Documents and images only, judged on the extension: the browser's MIME
  // type is unreliable (a .csv arrives as an Excel type on Windows), so the
  // stored type is derived from the extension, never taken from the client.
  const ext = normalizeExt(file_name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new ValidationError(`File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }
  const storedMime = Object.keys(MIME_TO_EXT).find((m) => MIME_TO_EXT[m].includes(ext));
  // Only the author (or an admin) of the report, or its division, attaches files (D-20261108-02).
  const parentType = parent_type || EVIDENCE_PARENTS.ACTIVITY_REPORT;
  const parentId = parseInt(parent_id, 10) || 0;
  if (!(await canWriteEvidence(req.user.id, parentType, parentId))) {
    throw new ForbiddenError('You cannot add files to this report');
  }

  const userId = req.user.id;
  // Every segment that ends up in the SharePoint path must be
  // sanitized — unsanitized values (trailing spaces, slashes, long
  // names) caused CreateNewFolder to 502 BadGateway in PA.
  const year = sanitizeSegment(fiscal_year || new Date().getFullYear().toString(), String(new Date().getFullYear()));
  const divFolder = sanitizeSegment(division_name, 'Unknown Division');
  const actFolder = sanitizeSegment(activity_code, 'general');
  const activityName = sanitizeSegment(req.body.activity_name || actFolder, actFolder);
  const reportType = sanitizeSegment(req.body.report_type, 'Specific Activities');
  const cleanFileName = sanitizeSegment(file_name, 'file');
  // Full path kept for local reference in evidence_files
  const storedPath = `${year}/${divFolder}/${reportType}/${activityName}/${cleanFileName}`;
  const documentId = `${parentType}-${parentId}-${Date.now()}`;

  // 1. Post to Power Automate. Uses the Node 18+ global `fetch` — the
  //    `node-fetch` dynamic import was silently ER_MODULE_NOT_FOUND'ing
  //    in staging/prod (the package is not in package.json) so every
  //    upload fell through to the local-only fallback and the file
  //    never reached SharePoint.
  let sharepointUrl = null;
  let paStatus = null;
  let paError = null;
  if (!POWER_AUTOMATE_URL) {
    logger.error('evidence.pa_url_missing', { documentId });
    return res.status(503).json({
      success: false,
      message: 'File storage is not configured. Please contact support.',
      code: 'SHAREPOINT_NOT_CONFIGURED',
    });
  }
  try {
    logger.info('evidence.pa_post', {
      documentId, filename: cleanFileName, year, department: divFolder, report_type: reportType,
    });
    const paRes = await fetch(POWER_AUTOMATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId,
        filename: cleanFileName,
        pdfBase64: file_base64,
        year,
        department: divFolder,
        report_type: reportType,
        activity_name: activityName,
      }),
    });
    paStatus = paRes.status;
    const paBody = await paRes.text().catch(() => '');
    logger.info('evidence.pa_response', { documentId, status: paRes.status });
    if (paRes.ok && paBody) {
      sharepointUrl = paBody.trim();
    } else {
      paError = `PA HTTP ${paRes.status}`;
      logger.error('evidence.pa_error', { documentId, status: paRes.status, body: paBody.slice(0, 200) });
    }
  } catch (err) {
    paError = err && err.message ? err.message : 'unknown upload error';
    logger.error('evidence.pa_threw', { documentId, error: paError });
  }

  // If SharePoint didn't actually get the file, don't write a ghost row
  // into evidence_files — there's no local storage behind it, so the
  // reference would point at nothing. Fail loud and let the UI retry.
  if (!sharepointUrl) {
    // The upstream status/error stays in the logs (evidence.pa_error above);
    // the client gets a generic message — no internal detail leakage.
    logger.warn('evidence.upload_failed', { documentId, pa_status: paStatus, pa_error: paError });
    return res.status(502).json({
      success: false,
      message: 'The file could not be stored. Please try again or contact support.',
      code: 'SHAREPOINT_UPLOAD_FAILED',
    });
  }

  // 2. Save reference in evidence_files (only when SharePoint has the file)
  const fileId = require('crypto').randomUUID();
  await db('evidence_files').insert({
    file_id: fileId,
    original_name: file_name,
    stored_name: storedPath,
    mime_type: storedMime,
    file_size: file_size || 0,
    file_url: sharepointUrl,
    parent_type: parentType,
    parent_id: parentId,
    uploaded_by: userId,
  });

  res.json({
    success: true,
    data: {
      file_id: fileId,
      filename: storedPath,
      document_id: documentId,
      sharepoint_url: sharepointUrl,
      uploaded_to_sharepoint: true,
    },
  });
}));

/**
 * List evidence files attached to a parent entity (activity_report, etc.).
 * @name GET /api/reporting/evidence/:parentType/:parentId
 * @param {express.Request} req
 * @param {express.Response} res — 200 JSON array of evidence rows
 * @returns {Promise<void>}
 * @throws {Error} 500 on DB failure
 * @example GET /api/reporting/evidence/activity_report/5
 */
router.get('/evidence/:parentType/:parentId', asyncHandler(async (req, res) => {
  const files = await db('evidence_files')
    .where({ parent_type: req.params.parentType, parent_id: parseInt(req.params.parentId) })
    .orderBy('created_at', 'desc');
  res.json(files);
}));

/**
 * Delete an evidence file attachment.
 *
 * Auth rule: the user must be either
 *   - the uploader (uploaded_by = user.id), OR
 *   - hold system-wide approve rights (SYSTEM_ADMIN / ME_OFFICER), OR
 *   - be focal/HOD/director on the report's division (for
 *     indicator_report parents).
 *
 * @name DELETE /api/reporting/evidence/:fileId
 */
router.delete('/evidence/:fileId', asyncHandler(async (req, res) => {
  const fileId = parseInt(req.params.fileId, 10);
  const row = await db('evidence_files').where('id', fileId).first();
  if (!row) throw new ValidationError('File not found');

  let authorised = row.uploaded_by === req.user.id;
  if (!authorised) {
    try {
      const rbacService = require('../../services/rbacService');
      const { RBAC_MODULES, RBAC_ACTIONS } = require('@rbm/lib/rbac');
      const { allowed, scope } = await rbacService.checkPermission(
        req.user.id, RBAC_MODULES.QUARTERLY_REPORT, RBAC_ACTIONS.APPROVE,
      );
      if (allowed && scope === 'all') authorised = true;
    } catch { /* ignore */ }
  }
  if (!authorised && row.parent_type === 'indicator_report' && row.parent_id) {
    const report = await db('indicator_division_reports').where('id', row.parent_id).first();
    if (report) {
      const member = await db('user_divisions')
        .where({ user_id: req.user.id, division_code: report.division_code })
        .whereIn('role', DELETE_DIVISION_ROLES)
        .first();
      if (member) authorised = true;
    }
  }
  if (!authorised) {
    res.status(403).json({ success: false, message: 'You cannot delete this file', code: 'FORBIDDEN' });
    return;
  }

  await db('evidence_files').where('id', fileId).delete();
  res.json({ success: true, data: { deleted_id: fileId } });
}));

module.exports = router;
