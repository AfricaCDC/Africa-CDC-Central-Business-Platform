/**
 * Local error codes for file-generator-service (spec §6).
 *
 * Kept local per team-lead (D-20260415-15 §12 #3 — YAGNI). Hoist to
 * `@rbm/lib/errors` only when a second service needs the same code.
 *
 * Canonical envelope (FLAT) is enforced by `@rbm/lib/errors.errorHandler`.
 */

const { ApiError } = require('@rbm/lib/errors');

class TemplateNotFoundError extends ApiError {
  constructor(message) {
    super('TEMPLATE_NOT_FOUND', message || 'Template not found', 404);
  }
}

class TemplateForbiddenError extends ApiError {
  constructor(message) {
    super('TEMPLATE_FORBIDDEN', message || 'Caller not authorized for template', 403);
  }
}

class GenerationFailedError extends ApiError {
  constructor(message) {
    super('GENERATION_FAILED', message || 'Generation failed', 422);
  }
}

class PayloadTooLargeError extends ApiError {
  constructor(message) {
    super('PAYLOAD_TOO_LARGE', message || 'Payload exceeds allowed shape limits', 413);
  }
}

class ZipTooManyMembersError extends ApiError {
  constructor(message) {
    super('ZIP_TOO_MANY_MEMBERS', message || 'ZIP members exceed ZIP_MAX_MEMBERS', 413);
  }
}

class InvalidSignatureError extends ApiError {
  constructor(message) {
    super('INVALID_SIGNATURE', message || 'Signed URL signature is invalid', 400);
  }
}

class LinkExpiredError extends ApiError {
  constructor(message) {
    super('LINK_EXPIRED', message || 'Signed URL has expired', 410);
  }
}

class FileNotFoundError extends ApiError {
  constructor(message) {
    super('FILE_NOT_FOUND', message || 'File not found', 404);
  }
}

module.exports = {
  TemplateNotFoundError,
  TemplateForbiddenError,
  GenerationFailedError,
  PayloadTooLargeError,
  ZipTooManyMembersError,
  InvalidSignatureError,
  LinkExpiredError,
  FileNotFoundError,
};
