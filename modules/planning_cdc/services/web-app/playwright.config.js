// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for the Africa CDC RBM Planning web-app.
 *
 * Prerequisites before running:
 *   1. Start the API server:  cd services/api-server && npm run dev
 *   2. Start the frontend:    cd services/web-app && npx vite --port 5000
 *      OR from the repo root: npm run dev
 *   3. Run tests:             cd services/web-app && npm run e2e
 *
 * The config uses reuseExistingServer: true — it does NOT start any
 * server automatically. Both the api-server (port 4000) and the Vite
 * dev server (port 5000) must already be running when you invoke playwright.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  /* Run each spec file's tests in order; parallel across files */
  fullyParallel: false,

  /* Fail CI fast on unexpected test.only */
  forbidOnly: !!process.env.CI,

  /* No automatic retries — flaky tests get quarantined, not silently retried */
  retries: process.env.CI ? 1 : 0,

  /* One worker in CI to avoid race conditions on a shared DB */
  workers: process.env.CI ? 1 : undefined,

  /* Reporters */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  /* Artifact storage */
  outputDir: 'playwright-report/test-results',

  use: {
    /* All requests go to the Vite dev server */
    baseURL: process.env.BASE_URL || 'http://localhost:5000',

    /* Keep artifacts only when a test fails */
    screenshot: 'only-on-failure',
    video:      'retain-on-failure',
    trace:      'retain-on-failure',

    /* Reasonable timeouts */
    actionTimeout:     10_000,
    navigationTimeout: 15_000,
  },

  /* Single browser project — add firefox/webkit when needed */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Global test timeout (ms) */
  timeout: 30_000,

  /* Assertion timeout (ms) */
  expect: {
    timeout: 5_000,
  },

  /*
   * reuseExistingServer: true — Playwright will NOT attempt to start a server.
   * Both http://localhost:5000 (Vite) and http://localhost:4000 (API) must be
   * running before you execute `npm run e2e`.
   */
});
