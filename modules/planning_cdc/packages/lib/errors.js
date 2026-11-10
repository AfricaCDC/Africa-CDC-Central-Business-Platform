/* eslint-disable complexity, no-unused-vars -- error handler is a branching state machine by necessity. */
/**
 * @rbm/lib/errors — Canonical HTTP error/success envelope, typed error
 * classes, global Express error handler, and async handler wrapper.
 *
 * Canonical success envelope:
 *   { success: true, data }
 *
 * Canonical error envelope (FLAT — no nested `error` object):
 *   { success: false, message, code }
 *
 * Per CHARTER.md, the nested `{ success: false, error: { code, message } }`
 * shape is deprecated. Legacy helpers (`httpError`, `httpSuccess`,
 * `toErrorResponse`) remain exported until Sprint 1 finishes migrating every
 * caller. New code MUST use `buildError`, `buildSuccess`, `errorHandler`,
 * `asyncHandler`, and the typed `ApiError` subclasses.
 */

const HTTP_STATUS = Object.freeze({
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

const ERROR_CODES = Object.freeze({
  // Canonical codes (per master-plan §4.1)
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

  // Auth detail codes
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_MISSING: 'TOKEN_MISSING',

  // Legacy aliases kept for Sprint-1 migration. Do NOT introduce new
  // references to these — use the canonical codes above.
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
});

const ERROR_MESSAGES = Object.freeze({
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

  // Legacy
  [ERROR_CODES.BAD_REQUEST]: 'Bad request',
  [ERROR_CODES.VALIDATION_ERROR]: 'Validation error',
  [ERROR_CODES.CONFLICT]: 'Resource conflict',
  [ERROR_CODES.TOO_MANY_REQUESTS]: 'Too many requests',
});

// ─────────────────────────────────────────────────────────────────────────────
// Canonical (flat) envelope — new code MUST use these.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a canonical error body. FLAT shape — no nested `error` object.
 *
 * @param {string} code — machine-readable code from {@link ERROR_CODES}.
 * @param {string} [message] — optional human-readable override.
 * @param {number} [statusCode] — optional HTTP status echoed as `_status` for
 *   the error handler. Not serialized in the JSON body.
 * @returns {{ success: false, message: string, code: string, _status?: number }}
 * @example
 *   res.status(404).json(buildError('NOT_FOUND', 'Workplan not found'));
 */
function buildError(code, message, statusCode) {
  const body = {
    success: false,
    message: message || ERROR_MESSAGES[code] || 'Request failed',
    code,
  };
  if (statusCode) Object.defineProperty(body, '_status', { value: statusCode, enumerable: false });
  return body;
}

/**
 * Build a canonical success body.
 *
 * @template T
 * @param {T} data
 * @returns {{ success: true, data: T }}
 * @example
 *   res.json(buildSuccess({ id: 42 }));
 */
function buildSuccess(data) {
  return { success: true, data: data == null ? null : data };
}

/**
 * Base typed API error. Carries `{ code, message, statusCode }` and (optionally)
 * structured `details`. Global {@link errorHandler} translates instances of
 * this class into the canonical error envelope. Route handlers should throw
 * these rather than calling `res.json()` directly.
 *
 * @example
 *   throw new ApiError('WORKPLAN_LOCKED', 'Workplan is locked', 409);
 */
class ApiError extends Error {
  /**
   * @param {string} code — machine-readable code.
   * @param {string} message — human-readable message safe to ship to clients.
   * @param {number} [statusCode=500] — HTTP status.
   * @param {object} [details] — optional structured details (e.g. Zod issues).
   */
  constructor(code, message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, details) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    if (details) this.details = details;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Legacy alias of {@link ApiError}. Kept so existing `instanceof AppError`
 * checks in services keep working during Sprint 1 migration.
 */
class AppError extends ApiError {
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

/**
 * 400 / VALIDATION_FAILED — input validation failed. `details` is a
 * structured object (e.g. `ZodError.flatten()`).
 *
 * @example
 *   throw new ValidationError('Missing required field', { fieldErrors: {...} });
 */
class ValidationError extends ApiError {
  constructor(message, details) {
    super(
      ERROR_CODES.VALIDATION_FAILED,
      message || ERROR_MESSAGES[ERROR_CODES.VALIDATION_FAILED],
      HTTP_STATUS.BAD_REQUEST,
      details,
    );
  }
}

/**
 * 401 / UNAUTHORIZED — caller has no (or an invalid) identity.
 * @example throw new UnauthorizedError();
 */
class UnauthorizedError extends ApiError {
  constructor(message, code) {
    super(
      code || ERROR_CODES.UNAUTHORIZED,
      message || ERROR_MESSAGES[ERROR_CODES.UNAUTHORIZED],
      HTTP_STATUS.UNAUTHORIZED,
    );
  }
}

/**
 * 403 / FORBIDDEN — identity is valid but lacks permission.
 * @example throw new ForbiddenError('You cannot delete this indicator');
 */
class ForbiddenError extends ApiError {
  constructor(message) {
    super(
      ERROR_CODES.FORBIDDEN,
      message || ERROR_MESSAGES[ERROR_CODES.FORBIDDEN],
      HTTP_STATUS.FORBIDDEN,
    );
  }
}

/**
 * 404 / NOT_FOUND — resource does not exist (or the caller cannot see it).
 * @example throw new NotFoundError('Workplan 42 not found');
 */
class NotFoundError extends ApiError {
  constructor(message) {
    super(
      ERROR_CODES.NOT_FOUND,
      message || ERROR_MESSAGES[ERROR_CODES.NOT_FOUND],
      HTTP_STATUS.NOT_FOUND,
    );
  }
}

/**
 * 409 / DUPLICATE_ENTRY — unique constraint / optimistic-lock conflict.
 * @example throw new ConflictError('Indicator code already taken');
 */
class ConflictError extends ApiError {
  constructor(message, details) {
    super(
      ERROR_CODES.DUPLICATE_ENTRY,
      message || ERROR_MESSAGES[ERROR_CODES.DUPLICATE_ENTRY],
      HTTP_STATUS.CONFLICT,
      details,
    );
  }
}

/**
 * 429 / RATE_LIMITED — request throttled.
 * @example throw new RateLimitError('Too many login attempts');
 */
class RateLimitError extends ApiError {
  constructor(message) {
    super(
      ERROR_CODES.RATE_LIMITED,
      message || ERROR_MESSAGES[ERROR_CODES.RATE_LIMITED],
      HTTP_STATUS.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * 503 / SERVICE_UNAVAILABLE — a dependency is down (e.g. MySQL unreachable).
 * @example throw new ServiceUnavailableError('Email relay offline');
 */
class ServiceUnavailableError extends ApiError {
  constructor(message) {
    super(
      ERROR_CODES.SERVICE_UNAVAILABLE,
      message || ERROR_MESSAGES[ERROR_CODES.SERVICE_UNAVAILABLE],
      HTTP_STATUS.SERVICE_UNAVAILABLE,
    );
  }
}

/**
 * 400 / BAD_REQUEST — legacy preset. Prefer {@link ValidationError} for
 * validation failures; this exists only for non-validation 400s.
 */
class BadRequestError extends ApiError {
  constructor(message, details) {
    super(
      ERROR_CODES.BAD_REQUEST,
      message || ERROR_MESSAGES[ERROR_CODES.BAD_REQUEST],
      HTTP_STATUS.BAD_REQUEST,
      details,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanitization helpers (shared by both legacy and canonical translators).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `true` when `err` is a low-level DB driver error (MySQL ER_*, SQLite,
 * or PostgreSQL 5-digit SQLSTATE). DB errors expose schema info and MUST
 * never reach the client.
 *
 * @param {*} err
 * @returns {boolean}
 */
function isDatabaseError(err) {
  if (!err || !err.code) return false;
  if (err.errno != null) return true;
  const c = String(err.code);
  if (c.startsWith('ER_')) return true;
  if (c === 'SQLITE_ERROR') return true;
  if (/^\d{5}$/.test(c)) return true;
  return false;
}

/**
 * Heuristic: does this string smell like raw SQL / stack trace / path leak?
 * Used as defense-in-depth before any message crosses the wire.
 *
 * @param {string} s
 * @returns {boolean}
 */
function looksLikeInternalDetail(s) {
  if (!s || typeof s !== 'string') return false;
  if (s.length > 200) return true;
  return /\binsert\s+into\b|\bupdate\s+\w+\s+set\b|\bdelete\s+from\b|\bselect\s+.+\s+from\b|relation\s+"|column\s+"|constraint\b|violat(?:es|ion)|\bENUM\b|\bpg_\w+|node_modules|\.js:\d+/i.test(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical Express middleware.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global Express error-handling middleware. Emits the canonical flat envelope
 * for every failure, NEVER leaks stack traces, and sanitizes DB errors.
 *
 * Mount last in the Express stack:
 *
 *   app.use(errorHandler);
 *
 * @param {*} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 * @returns {void}
 * @throws never — catches and normalizes.
 * @example
 *   app.use(errorHandler);
 */
/**
 * Whether raw error internals (SQL messages, stack frames) may be sent to
 * the client. Sanitized everywhere except explicit development/test, with
 * two overrides: HIDE_DB_ERRORS=1 forces sanitization even in dev, and
 * DEBUG_ERRORS=1 re-enables the raw detail the 2026-04-19 operator request
 * asked for — now an opt-in instead of the default (D-20260715-02).
 *
 * @returns {boolean} true when raw internals may reach the response body
 * @example
 *   if (shouldExposeInternals()) body.details = { stack };
 */
function shouldExposeInternals() {
  if (process.env.HIDE_DB_ERRORS === '1') return false;
  if (process.env.DEBUG_ERRORS === '1') return true;
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' || env === 'test';
}

function errorHandler(err, _req, res, _next) {
  try {
    const expose = shouldExposeInternals();
    if (isDatabaseError(err)) {
      if (!expose) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError(
          ERROR_CODES.INTERNAL_ERROR,
          'A database error occurred. Please contact support if this persists.',
        ));
      }
      const details = {
        code: err.code || null,
        errno: err.errno || null,
        sqlState: err.sqlState || null,
        sqlMessage: err.sqlMessage || null,
      };
      const msg = err.sqlMessage || err.message || 'Database error';
      const body = buildError(ERROR_CODES.INTERNAL_ERROR, msg);
      body.details = details;
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(body);
    }

    if (err instanceof ApiError) {
      // Same toggle as above — ApiError messages are usually authored for
      // humans, but guard against internal detail slipping through.
      const safeMessage = !expose && looksLikeInternalDetail(err.message)
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
    const safe = expose ? raw : (raw && !looksLikeInternalDetail(raw) ? raw : undefined);
    const body = buildError(ERROR_CODES.INTERNAL_ERROR, safe);
    if (err && err.stack && expose) {
      body.details = { stack: String(err.stack).split('\n').slice(0, 8) };
    }
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(body);
  } catch (translateErr) {
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildError(ERROR_CODES.INTERNAL_ERROR));
  }
}

/**
 * Wrap an async route/middleware so thrown errors (or rejected promises)
 * are forwarded to Express `next(err)` — which {@link errorHandler} then
 * normalizes. Eliminates try/catch boilerplate in controllers.
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<*>} fn
 * @returns {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => void}
 * @example
 *   router.get('/:id', asyncHandler(async (req, res) => {
 *     const row = await svc.findById(req.params.id);
 *     if (!row) throw new NotFoundError();
 *     res.json(buildSuccess(row));
 *   }));
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY helpers — nested `{ success:false, error:{ code, message } }` shape.
// Retained for Sprint 1 migration; do not use in new code.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated Use {@link buildError}. Emits the legacy nested envelope.
 *
 * @param {string} code
 * @param {string} [message]
 * @param {object} [extra]
 * @returns {{ success: false, error: { code: string, message: string } }}
 */
function httpError(code, message, extra) {
  const payload = {
    code,
    message: message || ERROR_MESSAGES[code] || 'Unknown error',
  };
  if (extra && typeof extra === 'object') Object.assign(payload, extra);
  return { success: false, error: payload };
}

/**
 * @deprecated Use {@link buildSuccess}. Emits the legacy nested envelope.
 *
 * @template T
 * @param {T} data
 * @param {object} [meta]
 * @returns {{ success: true, data: T, meta?: object }}
 */
function httpSuccess(data, meta) {
  const envelope = { success: true, data: data == null ? null : data };
  if (meta && typeof meta === 'object') envelope.meta = meta;
  return envelope;
}

/**
 * @deprecated Use {@link errorHandler}. Translates an arbitrary thrown value
 * into a legacy `{ status, body }` tuple.
 *
 * @param {*} err
 * @returns {{ status: number, body: { success: false, error: object } }}
 */
function toErrorResponse(err) {
  if (isDatabaseError(err)) {
    return {
      status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      body: httpError(
        ERROR_CODES.INTERNAL_ERROR,
        'A database error occurred. Please contact support if this persists.',
      ),
    };
  }
  if (err instanceof ApiError) {
    const safeMessage = looksLikeInternalDetail(err.message)
      ? ERROR_MESSAGES[err.code] || 'Request failed'
      : err.message;
    return {
      status: err.statusCode,
      body: httpError(err.code, safeMessage, err.details ? { details: err.details } : undefined),
    };
  }
  if (err && err.name === 'TokenExpiredError') {
    return { status: HTTP_STATUS.UNAUTHORIZED, body: httpError(ERROR_CODES.TOKEN_EXPIRED) };
  }
  if (err && err.name === 'JsonWebTokenError') {
    return { status: HTTP_STATUS.UNAUTHORIZED, body: httpError(ERROR_CODES.TOKEN_INVALID) };
  }
  const raw = err && err.message ? err.message : undefined;
  const safe = raw && !looksLikeInternalDetail(raw) ? raw : undefined;
  return {
    status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    body: httpError(ERROR_CODES.INTERNAL_ERROR, safe),
  };
}

module.exports = {
  HTTP_STATUS,
  ERROR_CODES,
  ERROR_MESSAGES,
  // Canonical
  buildError,
  buildSuccess,
  errorHandler,
  asyncHandler,
  ApiError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError,
  BadRequestError,
  // Legacy
  httpError,
  httpSuccess,
  toErrorResponse,
  AppError,
};
