// ── Zod validation middleware ──
//
// Wraps any Zod schema and returns a standardized error envelope on failure
// (matching the `@rbm/lib/errors` ValidationError contract). Uses safeParse
// so we never throw out of band — every validation failure becomes a
// well-formed 400 response with structured `details`.
//
// Usage:
//   const { validate } = require('../middleware/validate');
//   const { refreshSchema } = require('@rbm/schemas');
//   router.post('/refresh', validate(refreshSchema), refreshController);

const {
  HTTP_STATUS,
  ERROR_CODES,
  buildError,
} = require('@rbm/lib/errors');

/**
 * Build a middleware that validates `req[source]` against `schema`.
 *
 * @param {import('zod').ZodTypeAny} schema
 * @param {'body'|'query'|'params'} [source='body']
 * @returns {(req: import('express').Request, res: import('express').Response, next: Function) => void}
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const flat = result.error.flatten();
      const body = buildError(ERROR_CODES.VALIDATION_ERROR, 'Validation failed');
      body.details = flat;
      return res.status(HTTP_STATUS.BAD_REQUEST).json(body);
    }
    // Replace the raw payload with the parsed (and possibly coerced) object so
    // controllers always receive the validated shape.
    req[source] = result.data;
    return next();
  };
};

module.exports = { validate };
