/**
 * errorHandler sanitization defaults (D-20260715-02).
 *
 * The global error middleware must NEVER leak SQL messages, schema details
 * or stack traces outside explicit development/test — previously the raw
 * detail was the default and sanitization required HIDE_DB_ERRORS=1, which
 * no environment set. These tests pin the inverted default and both
 * override flags on the shared CJS module every service consumes.
 */

const { errorHandler, ApiError, ERROR_CODES } = require('@rbm/lib/errors');

const makeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.json = jest.fn((body) => { res.body = body; return res; });
  return res;
};

const dbError = () => Object.assign(new Error('boom'), {
  code: 'ER_BAD_FIELD_ERROR',
  errno: 1054,
  sqlState: '42S22',
  sqlMessage: "Unknown column 'secret_col' in 'field list'",
});

const ORIGINAL_ENV = { ...process.env };
const setEnv = (overrides) => {
  delete process.env.NODE_ENV;
  delete process.env.HIDE_DB_ERRORS;
  delete process.env.DEBUG_ERRORS;
  Object.assign(process.env, overrides);
};

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('errorHandler — DB errors', () => {
  it('should sanitize SQL detail when NODE_ENV=production', () => {
    setEnv({ NODE_ENV: 'production' });
    const res = makeRes();
    errorHandler(dbError(), {}, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('secret_col');
    expect(res.body.details).toBeUndefined();
  });

  it('should sanitize SQL detail when NODE_ENV=staging', () => {
    setEnv({ NODE_ENV: 'staging' });
    const res = makeRes();
    errorHandler(dbError(), {}, res, () => {});
    expect(JSON.stringify(res.body)).not.toContain('secret_col');
  });

  it('should sanitize when NODE_ENV is an unknown value', () => {
    setEnv({ NODE_ENV: 'qa' });
    const res = makeRes();
    errorHandler(dbError(), {}, res, () => {});
    expect(JSON.stringify(res.body)).not.toContain('secret_col');
  });

  it('should expose SQL detail in test/development', () => {
    setEnv({ NODE_ENV: 'test' });
    const res = makeRes();
    errorHandler(dbError(), {}, res, () => {});
    expect(res.body.message).toContain('secret_col');
    expect(res.body.details.sqlState).toBe('42S22');
  });

  it('should expose SQL detail in production when DEBUG_ERRORS=1', () => {
    setEnv({ NODE_ENV: 'production', DEBUG_ERRORS: '1' });
    const res = makeRes();
    errorHandler(dbError(), {}, res, () => {});
    expect(res.body.message).toContain('secret_col');
  });

  it('should sanitize in development when HIDE_DB_ERRORS=1', () => {
    setEnv({ NODE_ENV: 'development', HIDE_DB_ERRORS: '1' });
    const res = makeRes();
    errorHandler(dbError(), {}, res, () => {});
    expect(JSON.stringify(res.body)).not.toContain('secret_col');
  });

  it('should keep HIDE_DB_ERRORS=1 winning over DEBUG_ERRORS=1', () => {
    setEnv({ NODE_ENV: 'development', HIDE_DB_ERRORS: '1', DEBUG_ERRORS: '1' });
    const res = makeRes();
    errorHandler(dbError(), {}, res, () => {});
    expect(JSON.stringify(res.body)).not.toContain('secret_col');
  });
});

describe('errorHandler — generic errors', () => {
  it('should not attach stack frames in production', () => {
    setEnv({ NODE_ENV: 'production' });
    const res = makeRes();
    errorHandler(new Error('Cannot read properties of undefined at /app/services/api-server/src/x.js:42'), {}, res, () => {});
    expect(res.body.details).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('api-server/src');
  });

  it('should attach stack frames in development', () => {
    setEnv({ NODE_ENV: 'development' });
    const res = makeRes();
    errorHandler(new Error('kaput'), {}, res, () => {});
    expect(Array.isArray(res.body.details.stack)).toBe(true);
  });

  it('should pass through a human-safe message even in production', () => {
    setEnv({ NODE_ENV: 'production' });
    const res = makeRes();
    errorHandler(new Error('Quarter already closed'), {}, res, () => {});
    expect(res.body.message).toBe('Quarter already closed');
  });
});

describe('errorHandler — ApiError', () => {
  it('should mask internal-looking ApiError messages in production', () => {
    setEnv({ NODE_ENV: 'production' });
    const res = makeRes();
    const err = new ApiError(ERROR_CODES.INTERNAL_ERROR, "insert into plan_nodes (code) violates constraint uq_code", 500);
    errorHandler(err, {}, res, () => {});
    expect(res.body.message).not.toContain('plan_nodes');
  });

  it('should keep human-readable ApiError messages in production', () => {
    setEnv({ NODE_ENV: 'production' });
    const res = makeRes();
    const err = new ApiError(ERROR_CODES.NOT_FOUND, 'Report not found', 404);
    errorHandler(err, {}, res, () => {});
    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe('Report not found');
  });
});
