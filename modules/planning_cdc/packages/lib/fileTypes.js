/**
 * @rbm/lib/fileTypes — centralized allow-list of MIME types, extensions,
 * and size caps for evidence uploads. Canonical source of truth used by
 * `services/api-server/src/routes/evidenceRoutes.js` and any future upload
 * endpoint. Keep in sync with multer `fileFilter` + `limits`.
 */

/**
 * Maximum accepted upload size, in bytes. 50 MB.
 */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * Allowed MIME types. Paired with {@link ALLOWED_EXTENSIONS} — both must
 * match for an upload to be accepted.
 */
const ALLOWED_MIME_TYPES = Object.freeze([
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Images
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  // Plain text
  'text/csv',
  'text/plain',
]);

/**
 * Allowed file extensions (lowercase, with leading dot).
 */
const ALLOWED_EXTENSIONS = Object.freeze([
  '.pdf',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.ppt', '.pptx',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.csv', '.txt',
]);

/**
 * MIME → canonical extension map (first match wins). Used to sanity-check
 * that the reported extension is compatible with the MIME.
 */
const MIME_TO_EXT = Object.freeze({
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'text/csv': ['.csv'],
  'text/plain': ['.txt'],
});

/**
 * Normalize a filename extension to lowercase, with leading dot.
 *
 * @param {string} nameOrExt — `"Foo.PDF"` | `".pdf"` | `"pdf"`.
 * @returns {string} — `".pdf"` or `""` if none.
 */
function normalizeExt(nameOrExt) {
  if (!nameOrExt || typeof nameOrExt !== 'string') return '';
  const trimmed = nameOrExt.trim().toLowerCase();
  const dotIdx = trimmed.lastIndexOf('.');
  if (dotIdx < 0) return trimmed ? `.${trimmed}` : '';
  return trimmed.slice(dotIdx);
}

/**
 * Check that `mime` is whitelisted AND its extension is consistent.
 *
 * @param {string} mime — reported MIME type.
 * @param {string} [ext] — reported extension or filename. Optional — when
 *   absent, only the MIME is validated.
 * @returns {boolean} — `true` if accepted.
 * @example
 *   isAllowed('application/pdf', 'report.PDF') // => true
 *   isAllowed('image/svg+xml')                 // => false
 */
function isAllowed(mime, ext) {
  if (!mime || typeof mime !== 'string') return false;
  if (!ALLOWED_MIME_TYPES.includes(mime)) return false;
  if (!ext) return true;
  const normalized = normalizeExt(ext);
  if (!ALLOWED_EXTENSIONS.includes(normalized)) return false;
  const expected = MIME_TO_EXT[mime];
  return expected ? expected.includes(normalized) : true;
}

module.exports = {
  MAX_FILE_BYTES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MIME_TO_EXT,
  isAllowed,
  normalizeExt,
};
