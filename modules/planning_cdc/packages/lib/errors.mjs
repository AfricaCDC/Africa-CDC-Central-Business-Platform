/* eslint-disable complexity -- error handler is a branching state machine by necessity. */
/**
 * @rbm/lib/errors — ESM mirror of ./errors.js. Keep both files in lockstep.
 * See errors.js for full docs; only surface re-exports are documented here.
 */

export const HTTP_STATUS = Object.freeze({
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
});

export const ERROR_CODES = Object.freeze({
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE',
  BAD_GATEWAY: 'BAD_GATEWAY',
  SSO_UNKNOWN_USER: 'SSO_UNKNOWN_USER',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_MISSING: 'TOKEN_MISSING',
  // Legacy aliases
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
});

export const ERROR_MESSAGES = Object.freeze({
  [ERROR_CODES.VALIDATION_FAILED]: 'Validation failed',
  [ERROR_CODES.UNAUTHORIZED]: 'Authentication required',
  [ERROR_CODES.FORBIDDEN]: 'Access denied',
  [ERROR_CODES.NOT_FOUND]: 'Resource not found',
  [ERROR_CODES.DUPLICATE_ENTRY]: 'Resource already exists',
  [ERROR_CODES.RATE_LIMITED]: 'Too many requests',
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 'Service unavailable',
  [ERROR_CODES.INTERNAL_ERROR]: 'Internal server error',
  [ERROR_CODES.UPSTREAM_UNAVAILABLE]: 'Upstream service unavailable',
  [ERROR_CODES.BAD_GATEWAY]: 'Bad gateway',
  [ERROR_CODES.SSO_UNKNOWN_USER]: 'User not provisioned in this application',
  [ERROR_CODES.TOKEN_EXPIRED]: 'Token expired',
  [ERROR_CODES.TOKEN_INVALID]: 'Invalid token',
  [ERROR_CODES.TOKEN_MISSING]: 'Missing or invalid Authorization header',
  [ERROR_CODES.BAD_REQUEST]: 'Bad request',
  [ERROR_CODES.VALIDATION_ERROR]: 'Validation error',
  [ERROR_CODES.CONFLICT]: 'Resource conflict',
  [ERROR_CODES.TOO_MANY_REQUESTS]: 'Too many requests',
});

/** @see errors.js#buildError */
export function buildError(code, message, statusCode) {
  const body = {
    success: false,
    message: message || ERROR_MESSAGES[code] || 'Request failed',
    code,
  };
  if (statusCode) Object.defineProperty(body, '_status', { value: statusCode, enumerable: false });
  return body;
}

/** @see errors.js#buildSuccess */
export function buildSuccess(data) {
  return { success: true, data: data == null ? null : data };
}

/** @see errors.js#ApiError */
export class ApiError extends Error {
  constructor(code, message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, details) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    if (details) this.details = details;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

export class AppError extends ApiError {
  constructor(message, opts) {
    const o = opts || {};
    super(
      o.code || ERROR_CODES.INTERNAL_ERROR,
      message || ERROR_MESSAGES[o.code] || 'Internal server error',
      o.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR,
      o.details,
    );
  }
}

export class ValidationError extends ApiError {
  constructor(message, details) {
    super(ERROR_CODES.VALIDATION_FAILED, message || ERROR_MESSAGES[ERROR_CODES.VALIDATION_FAILED], HTTP_STATUS.BAD_REQUEST, details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message, code) {
    super(code || ERROR_CODES.UNAUTHORIZED, message || ERROR_MESSAGES[ERROR_CODES.UNAUTHORIZED], HTTP_STATUS.UNAUTHORIZED);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message) {
    super(ERROR_CODES.FORBIDDEN, message || ERROR_MESSAGES[ERROR_CODES.FORBIDDEN], HTTP_STATUS.FORBIDDEN);
  }
}

export class NotFoundError extends ApiError {
  constructor(message) {
    super(ERROR_CODES.NOT_FOUND, message || ERROR_MESSAGES[ERROR_CODES.NOT_FOUND], HTTP_STATUS.NOT_FOUND);
  }
}

export class ConflictError extends ApiError {
  constructor(message, details) {
    super(ERROR_CODES.DUPLICATE_ENTRY, message || ERROR_MESSAGES[ERROR_CODES.DUPLICATE_ENTRY], HTTP_STATUS.CONFLICT, details);
  }
}

export class RateLimitError extends ApiError {
  constructor(message) {
    super(ERROR_CODES.RATE_LIMITED, message || ERROR_MESSAGES[ERROR_CODES.RATE_LIMITED], HTTP_STATUS.TOO_MANY_REQUESTS);
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(message) {
    super(ERROR_CODES.SERVICE_UNAVAILABLE, message || ERROR_MESSAGES[ERROR_CODES.SERVICE_UNAVAILABLE], HTTP_STATUS.SERVICE_UNAVAILABLE);
  }
}

export class BadRequestError extends ApiError {
  constructor(message, details) {
    super(ERROR_CODES.BAD_REQUEST, message || ERROR_MESSAGES[ERROR_CODES.BAD_REQUEST], HTTP_STATUS.BAD_REQUEST, details);
  }
}

function isDatabaseError(err) {
  if (!err || !err.code) return false;
  if (err.errno != null) return true;
  const c = String(err.code);
  if (c.startsWith('ER_')) return true;
  if (c === 'SQLITE_ERROR') return true;
  if (/^\d{5}$/.test(c)) return true;
  return false;
}

function looksLikeInternalDetail(s) {
  if (!s || typeof s !== 'string') return false;
  if (s.length > 200) return true;
  return /\binsert\s+into\b|\bupdate\s+\w+\s+set\b|\bdelete\s+from\b|\bselect\s+.+\s+from\b|relation\s+"|column\s+"|constraint\b|violat(?:es|ion)|\bENUM\b|\bpg_\w+|node_modules|\.js:\d+/i.test(s);
}

/** @see errors.js#shouldExposeInternals */
function shouldExposeInternals() {
  if (process.env.HIDE_DB_ERRORS === '1') return false;
  if (process.env.DEBUG_ERRORS === '1') return true;
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' || env === 'test';
}

/** @see errors.js#errorHandler */
export function errorHandler(err, _req, res, _next) {
  try {
    const hide = !shouldExposeInternals();
    if (isDatabaseError(err)) {
      if (hide) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError(
          ERROR_CODES.INTERNAL_ERROR,
          'A database error occurred. Please contact support if this persists.',
        ));
      }
      const body = buildError(ERROR_CODES.INTERNAL_ERROR, err.sqlMessage || err.message || 'Database error');
      body.details = {
        code: err.code || null,
        errno: err.errno || null,
        sqlState: err.sqlState || null,
        sqlMessage: err.sqlMessage || null,
      };
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(body);
    }
    if (err instanceof ApiError) {
      const safeMessage = hide && looksLikeInternalDetail(err.message)
        ? ERROR_MESSAGES[err.code] || 'Request failed'
        : err.message;
      const body = buildError(err.code, safeMessage);
      if (err.details) body.details = err.details;
      return res.status(err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR).json(body);
    }
    if (err && err.name === 'TokenExpiredError') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json(buildError(ERROR_CODES.TOKEN_EXPIRED));
    }
    if (err && err.name === 'JsonWebTokenError') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json(buildError(ERROR_CODES.TOKEN_INVALID));
    }
    const raw = err && err.message ? err.message : undefined;
    const safe = hide ? (raw && !looksLikeInternalDetail(raw) ? raw : undefined) : raw;
    const body = buildError(ERROR_CODES.INTERNAL_ERROR, safe);
    if (err && err.stack && !hide) {
      body.details = { stack: String(err.stack).split('\n').slice(0, 8) };
    }
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(body);
  } catch {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError(ERROR_CODES.INTERNAL_ERROR));
  }
}

/** @see errors.js#asyncHandler */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** @deprecated @see errors.js#httpError */
export function httpError(code, message, extra) {
  const payload = { code, message: message || ERROR_MESSAGES[code] || 'Unknown error' };
  if (extra && typeof extra === 'object') Object.assign(payload, extra);
  return { success: false, error: payload };
}

/** @deprecated @see errors.js#httpSuccess */
export function httpSuccess(data, meta) {
  const envelope = { success: true, data: data == null ? null : data };
  if (meta && typeof meta === 'object') envelope.meta = meta;
  return envelope;
}

/** @deprecated @see errors.js#toErrorResponse */
export function toErrorResponse(err) {
  if (isDatabaseError(err)) {
    return {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      body: httpError(ERROR_CODES.INTERNAL_ERROR, 'A database error occurred. Please contact support if this persists.'),
    };
  }
  if (err instanceof ApiError) {
    const safeMessage = looksLikeInternalDetail(err.message)
      ? ERROR_MESSAGES[err.code] || 'Request failed'
      : err.message;
    return { status: err.statusCode, body: httpError(err.code, safeMessage, err.details ? { details: err.details } : undefined) };
  }
  if (err && err.name === 'TokenExpiredError') {
    return { status: HTTP_STATUS.UNAUTHORIZED, body: httpError(ERROR_CODES.TOKEN_EXPIRED) };
  }
  if (err && err.name === 'JsonWebTokenError') {
    return { status: HTTP_STATUS.UNAUTHORIZED, body: httpError(ERROR_CODES.TOKEN_INVALID) };
  }
  const raw = err && err.message ? err.message : undefined;
  const safe = raw && !looksLikeInternalDetail(raw) ? raw : undefined;
  return { status: HTTP_STATUS.INTERNAL_SERVER_ERROR, body: httpError(ERROR_CODES.INTERNAL_ERROR, safe) };
}

export default {
  HTTP_STATUS, ERROR_CODES, ERROR_MESSAGES,
  buildError, buildSuccess, errorHandler, asyncHandler,
  ApiError, AppError,
  ValidationError, UnauthorizedError, ForbiddenError, NotFoundError,
  ConflictError, RateLimitError, ServiceUnavailableError, BadRequestError,
  httpError, httpSuccess, toErrorResponse,
};
