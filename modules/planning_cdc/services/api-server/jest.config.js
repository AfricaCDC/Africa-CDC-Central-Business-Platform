// ── Jest config for the rbm-api-server ──
//
// JS only (no TypeScript). Tests live under `tests/` and `__tests__/`.
// External I/O (DB, SMTP, HTTP) is stubbed in `tests/setup.js` so the
// suite never touches a real MySQL or notification-service.
//
// Per CLAUDE.md "Mandatory Testing Policy": coverage threshold is 80%
// across branches / functions / lines / statements.

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.test.js',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/scripts/',
    '/db/migrations/',
    '/db/seeds/',
  ],
  // Reset mock state and counts between tests for deterministic runs.
  clearMocks: true,
  // Hard-stop a hung test — better than letting CI sit idle. 30s (not the
  // 10s default we ran with until 2026-07-16) because the exceljs XLSX
  // export tests (exportRoutes, divisionQuarterlySummaryRoutes) exceed 10s
  // purely from worker starvation when the pre-push hook runs the full
  // suite alongside vitest — same fix as web-app/vitest.config.js.
  testTimeout: 30000,
  // Setup file is loaded AFTER the jest framework is installed, so
  // jest.fn / jest.mock are available inside it.
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  // No transforms — this codebase is plain JS on Node 20, which already
  // supports every syntax we use natively. Disabling babel-jest avoids
  // a known false positive where JSDoc `@param` lines get misparsed as
  // legacy decorators inside route files.
  transform: {},
  // Coverage collection — exclude entry point, db migrations/seeds,
  // legacy archived migrations, cron jobs and import scripts
  // (one-off / infrastructure files exempt from the standard size/coverage rules).
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/db/migrations/**',
    '!src/db/migrations_old/**',
    '!src/db/seeds/**',
    '!src/scripts/**',
    '!src/cron/**',
    '!src/__test_fixtures/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'html', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  // Resolve workspace packages (`@rbm/lib`, `@rbm/schemas`) the same
  // way the runtime does — Node CJS resolution from this package's
  // `node_modules`. No extra moduleNameMapper needed because npm
  // workspaces symlinks the packages into `node_modules/@rbm/*`.
  moduleFileExtensions: ['js', 'mjs', 'json'],
  // Cache for faster reruns.
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
};
