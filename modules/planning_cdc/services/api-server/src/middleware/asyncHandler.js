/**
 * Wraps an async Express handler so rejected promises are forwarded to `next`.
 *
 * @param {Function} fn — async Express route handler `(req, res, next) => Promise<any>`
 * @returns {Function} Express middleware that resolves `fn` and forwards errors to `next`
 * @example
 * router.get('/users', asyncHandler(async (req, res) => { ... }));
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
