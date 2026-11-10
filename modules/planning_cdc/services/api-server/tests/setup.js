// ── Jest setup (runs after framework, before each test file) ──
//
// Goals:
//   1. Force NODE_ENV=test and supply fake JWT secrets so `config/env.js`
//      passes its startup validation without a real .env file.
//   2. Stub every external I/O surface so a unit test can NEVER reach
//      MySQL, the notification-service, or the network.
//   3. Expose a `global.__makeKnexMock` factory so tests can build a
//      throw-away chainable knex builder per test.
//   4. Expose a `global.__makeReqRes` helper for thin controller tests.
//
// Per CLAUDE.md "Test Data Cleanup": no real connections, no real
// network. Tests using transactions still need to roll back, but that
// is the test author's job — this file only sets up the mocking floor.

// ── 1. Environment ──────────────────────────────────────────────────
process.env.NODE_ENV = 'test';
// Both secrets must be ≥32 chars and DIFFERENT in non-dev (see
// services/api-server/src/config/env.js:30-41).
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ||
  'test_access_secret_at_least_32_characters_long_xxx';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  'test_refresh_secret_at_least_32_characters_long_yyy';
process.env.JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL || '15m';
process.env.JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL || '7d';
// Service-to-service JWT (D-07). Routes under /api/governance/workflows mint
// these via mintServiceToken(); without a default here, test files that load
// app.js would need per-file inline injection (the task #35 workaround).
process.env.SERVICE_TOKEN_SECRET =
  process.env.SERVICE_TOKEN_SECRET ||
  'test_service_token_secret_at_least_32_characters_long_zzz';
process.env.DB_NAME = process.env.DB_NAME || 'rbm_platform_test';
process.env.APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5000';
process.env.NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005';
// Bump rate limits sky-high so the per-route limiters never trip during
// supertest runs (a single test file makes dozens of requests).
process.env.RATE_LIMIT_AUTH_MAX = '1000000';
process.env.RATE_LIMIT_ADMIN_MAX = '1000000';
process.env.RATE_LIMIT_GENERAL_MAX = '1000000';

// ── 2. Chainable knex builder factory ────────────────────────────────
//
// A fresh stub per test avoids cross-test state leakage. Each chain
// method returns the same `chain` object so calls like
// `db('users').select('id').where({ id: 1 }).first()` all collapse
// onto one mock surface that the test can program.
//
// Resolve the chain to a value via:
//   chain.first.mockResolvedValue({ id: 1 })
//   chain.then.mockImplementation((resolve) => Promise.resolve([row1, row2]).then(resolve))
//
// Or override individual methods on the returned chain.
const makeKnexMock = () => {
  const chain = {};
  const methods = [
    'select', 'from', 'into', 'where', 'whereIn', 'whereNot', 'whereNotNull',
    'whereNull', 'andWhere', 'orWhere', 'whereExists', 'whereBetween',
    'whereRaw',
    'orderBy', 'orderByRaw', 'groupBy', 'groupByRaw', 'having', 'havingRaw',
    'limit', 'offset', 'returning',
    'join', 'leftJoin', 'rightJoin', 'innerJoin', 'crossJoin', 'joinRaw',
    'with', 'distinct', 'count', 'countDistinct', 'sum', 'avg', 'min', 'max',
    'pluck', 'modify', 'clone', 'as', 'on', 'using', 'forUpdate', 'forShare',
  ];
  methods.forEach((m) => { chain[m] = jest.fn().mockReturnValue(chain); });

  // Resolvers — override these with mockResolvedValue in tests.
  chain.first = jest.fn().mockResolvedValue(undefined);
  chain.insert = jest.fn().mockResolvedValue([1]);
  chain.update = jest.fn().mockResolvedValue(1);
  chain.del = jest.fn().mockResolvedValue(1);
  chain.delete = jest.fn().mockResolvedValue(1);
  chain.truncate = jest.fn().mockResolvedValue(undefined);
  chain.raw = jest.fn().mockResolvedValue([[]]);

  // `await chain` resolves the chain to an array by default.
  chain.then = jest.fn((resolve) => Promise.resolve([]).then(resolve));
  chain.catch = jest.fn();
  chain.finally = jest.fn();

  // Make the factory callable as `db('table_name')` — the result is
  // the same chain. Tests can also call `db.transaction(cb)`.
  const db = jest.fn(() => chain);
  db.raw = jest.fn().mockResolvedValue([[]]);
  db.fn = { now: () => 'CURRENT_TIMESTAMP' };
  db.transaction = jest.fn(async (cb) => cb(db));
  db.destroy = jest.fn().mockResolvedValue(undefined);
  // Schema introspection. `hasColumn` defaults to false so column-existence
  // guards take the "absent" branch; `hasTable` defaults to true. Override
  // either per test.
  db.schema = {
    hasColumn: jest.fn().mockResolvedValue(false),
    hasTable: jest.fn().mockResolvedValue(true),
  };
  // Expose the chain so tests can program it.
  db.__chain = chain;
  return db;
};
global.__makeKnexMock = makeKnexMock;

// ── 3. Express req / res helper ──────────────────────────────────────
//
// Returns a fake req + res pair good enough for thin handler unit
// tests. For full integration tests use supertest against the real
// `src/app.js` instead.
const makeReqRes = (overrides = {}) => {
  const req = {
    body: {},
    params: {},
    query: {},
    headers: {},
    cookies: {},
    user: null,
    ip: '127.0.0.1',
    method: 'GET',
    originalUrl: '/',
    get: jest.fn((h) => req.headers[String(h).toLowerCase()]),
    ...overrides.req,
  };
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status: jest.fn(function status(code) { this.statusCode = code; return this; }),
    json: jest.fn(function json(payload) { this.body = payload; return this; }),
    send: jest.fn(function send(payload) { this.body = payload; return this; }),
    set: jest.fn(function set(k, v) { this.headers[k] = v; return this; }),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    ...overrides.res,
  };
  const next = jest.fn();
  return { req, res, next };
};
global.__makeReqRes = makeReqRes;

// ── 4. Auto-mock external I/O surfaces ───────────────────────────────
//
// `jest.mock` calls in setupFilesAfterEnv apply to every test file —
// individual tests can still override with `jest.unmock(...)` or
// re-`jest.mock(...)` with a richer factory.

// express-rate-limit — replace every limiter with a pass-through middleware
// so test files can hammer the same endpoint dozens of times without
// tripping the protection. (Some limiters hardcode `max: 5` and cannot
// be overridden by env vars.)
jest.mock('express-rate-limit', () => {
  const factory = jest.fn(() => (_req, _res, next) => next());
  factory.default = factory;
  factory.__esModule = true;
  return factory;
});

// nodemailer — never send real email
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
    verify: jest.fn().mockResolvedValue(true),
    close: jest.fn(),
  })),
}));

// Global `fetch` — Node 18+ ships a built-in. Stub it so any code path
// that calls notification-service / external HTTP gets a benign 200 OK.
// Tests that need a specific response can `global.fetch.mockResolvedValueOnce(...)`.
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  status: 200,
  text: jest.fn().mockResolvedValue(''),
  json: jest.fn().mockResolvedValue({}),
});

// axios — never make outbound HTTP. Both default and named exports.
jest.mock('axios', () => {
  const instance = {
    get: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    post: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    put: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    patch: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    delete: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    request: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
    create: jest.fn(function create() { return instance; }),
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
  };
  return { __esModule: true, default: instance, ...instance };
});

// knex — never connect to a real DB. Returns the chainable factory
// described in section 2 above so a basic `require('knex')(config)`
// hands the test a programmable mock.
//
// `require('knex')` must yield a CALLABLE function so `knex(config)`
// still works from `src/config/db.js`. We attach `.default` and
// `__esModule: true` so ESM-style `import knex from 'knex'` also works.
jest.mock('knex', () => {
  const factory = jest.fn(() => global.__makeKnexMock());
  factory.default = factory;
  factory.__esModule = true;
  return factory;
});

// requestLogger — the fire-and-forget HTTP audit middleware writes to the
// shared knex mock's `chain.insert`, which pollutes route-level assertions
// that check `chain.insert.not.toHaveBeenCalled()`. Replace it with a
// pass-through so route tests only see inserts from the code under test.
jest.mock('../src/middleware/requestLogger', () => {
  return jest.fn(() => (_req, _res, next) => next());
});

// NOTE on @rbm/schemas + @rbm/lib:
//   We deliberately DO NOT mock these. Zod validation is fast and
//   running it for real catches test fixture mistakes. The role /
//   enum / error helpers in @rbm/lib are pure JS — running them for
//   real keeps tests honest about the actual constants.

// ── 5. Sanity safeguards ─────────────────────────────────────────────
// Catch unhandled promise rejections so a forgotten `await` in a test
// fails the suite loudly instead of silently passing.
process.on('unhandledRejection', (reason) => {
  console.error('[jest setup] Unhandled promise rejection:', reason);
  throw reason;
});
