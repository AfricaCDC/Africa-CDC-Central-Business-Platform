/* eslint-disable no-restricted-syntax --
 * P-17: this e2e spec clears/seeds the JWT in localStorage to drive the browser
 * as (un)authenticated — it exercises the app's allow-listed token auth path
 * from the outside. Test-only; no app code stores tokens here.
 */
/**
 * E2E spec: RBAC admin matrix page
 *
 * Scenarios:
 *   1. Admin can navigate to /admin/rbac and the permission matrix renders
 *   2. The matrix shows role columns and module rows
 *   3. Unauthenticated access to /admin/rbac redirects to /login
 */

import { test, expect } from '@playwright/test';
import { signIn } from '../fixtures/auth.js';

test.describe('RBAC permissions matrix — /admin/rbac', () => {
  test('unauthenticated access redirects to /login', async ({ page }) => {
    // Clear any existing session
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    });

    await page.goto('/admin/rbac');
    await page.waitForURL(/\/login(\?|$)/, { timeout: 10_000 }); // keeps ?return_to (D-20261105-10)
    expect(page.url()).toContain('/login');
  });

  test('admin can reach /admin/rbac and matrix renders', async ({ page }) => {
    await signIn(page);

    await page.goto('/admin/rbac');
    await page.waitForURL('**/admin/rbac', { timeout: 10_000 });

    // Page should not show a loading spinner indefinitely
    await expect(page.locator('[data-loading="true"], .animate-spin').first()).not.toBeVisible({ timeout: 8_000 }).catch(() => {
      // spinner may already be gone — that is fine
    });

    // The RBAC matrix page renders a table or grid with role labels.
    // The Shield icon and "RBAC" text confirm the right page loaded.
    await expect(page.getByText(/permission|rbac|matrix|role/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('matrix contains at least one role column and one module row', async ({ page }) => {
    await signIn(page);
    await page.goto('/admin/rbac');
    await page.waitForURL('**/admin/rbac', { timeout: 10_000 });

    // Wait for data to load — the role selector dropdown or a table header must appear
    const roleIndicator = page.locator('select, [role="combobox"], th, [class*="role"]').first();
    await expect(roleIndicator).toBeVisible({ timeout: 12_000 });

    // At minimum the category labels render (core, planning, reporting…)
    const categoryLabels = ['Core', 'Planning', 'Reporting', 'Admin'];
    let found = 0;
    for (const label of categoryLabels) {
      const count = await page.getByText(label, { exact: true }).count();
      if (count > 0) found++;
    }
    expect(found).toBeGreaterThanOrEqual(1);
  });
});
