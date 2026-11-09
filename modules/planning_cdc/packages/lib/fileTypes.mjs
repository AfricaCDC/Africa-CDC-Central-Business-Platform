/**
 * @rbm/lib/fileTypes — ESM mirror of ./fileTypes.js. See that file for docs.
 */

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = Object.freeze([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/csv',
  'text/plain',
]);

export const ALLOWED_EXTENSIONS = Object.freeze([
  '.pdf',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.ppt', '.pptx',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.csv', '.txt',
]);

export const MIME_TO_EXT = Object.freeze({
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

/** @see fileTypes.js#normalizeExt */
export function normalizeExt(nameOrExt) {
  if (!nameOrExt || typeof nameOrExt !== 'string') return '';
  const trimmed = nameOrExt.trim().toLowerCase();
  const dotIdx = trimmed.lastIndexOf('.');
  if (dotIdx < 0) return trimmed ? `.${trimmed}` : '';
  return trimmed.slice(dotIdx);
}

/** @see fileTypes.js#isAllowed */
export function isAllowed(mime, ext) {
  if (!mime || typeof mime !== 'string') return false;
  if (!ALLOWED_MIME_TYPES.includes(mime)) return false;
  if (!ext) return true;
  const normalized = normalizeExt(ext);
  if (!ALLOWED_EXTENSIONS.includes(normalized)) return false;
  const expected = MIME_TO_EXT[mime];
  return expected ? expected.includes(normalized) : true;
}

export default { MAX_FILE_BYTES, ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS, MIME_TO_EXT, isAllowed, normalizeExt };
