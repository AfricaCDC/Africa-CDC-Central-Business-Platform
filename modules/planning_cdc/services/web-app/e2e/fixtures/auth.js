/* eslint-disable no-restricted-syntax --
 * P-17: this e2e fixture seeds the JWT into browser localStorage to drive specs
 * as a logged-in user — it mirrors the app's allow-listed token auth path from
 * the outside. Test-only; no production code stores tokens here.
 */
/**
 * E2E auth helpers for the Africa CDC RBM platform.
 *
 * Sign-in is Microsoft only (D-20261107-03): there is no password to type and
 * a test cannot pass the Microsoft page. The specs sign in with a short-lived
 * access token signed here with the local API's JWT_ACCESS_SECRET (loaded from
 * the .env files exactly as the API loads them), the same token the API issues
 * after Microsoft.
 *
 * The test user is set with E2E_USER_ID, E2E_USER_EMAIL and E2E_USER_ROLES
 * (comma-separated). It must exist in the local database.
 *
 * @module e2e/fixtures/auth
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../api-server');
const apiRequire = createRequire(path.join(API_DIR, 'package.json'));
apiRequire('./src/config/env.js');
const { signAccessToken } = apiRequire('../../packages/lib/auth.js');

/** The user the specs act as (defaults to the seeded admin, id 1). */
export const E2E_USER = {
  id: Number(process.env.E2E_USER_ID || 1),
  email: process.env.E2E_USER_EMAIL || 'admin@africacdc.org',
  roles: (process.env.E2E_USER_ROLES || 'SYSTEM_ADMIN').split(','),
};

/**
 * Sign a 15-minute access token for the test user.
 *
 * @param {{ id: number, email: string, roles: string[] }} [user]
 * @returns {string} the bearer token
 * @throws {Error} when JWT_ACCESS_SECRET is not set in the .env files
 * @example
 * const auth = { Authorization: `Bearer ${testToken()}` };
 */
export function testToken(user = E2E_USER) {
  return signAccessToken({ ...user, bu_id: null }, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
}

/**
 * Open the app as the signed-in test user and land on /dashboard.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ id: number, email: string, roles: string[] }} [user]
 * @returns {Promise<void>}
 * @example
 * await signIn(page);
 */
export async function signIn(page, user = E2E_USER) {
  const token = testToken(user);
  await page.goto('/login');
  await page.evaluate((t) => localStorage.setItem('token', t), token);
  await page.goto('/dashboard');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
}
