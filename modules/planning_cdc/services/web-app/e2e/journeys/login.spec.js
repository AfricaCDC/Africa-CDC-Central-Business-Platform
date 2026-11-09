/**
 * E2E spec: Login page (Microsoft only, D-20261107-03)
 *
 * Scenarios:
 *   1. The page offers "Sign in with Microsoft" and no email/password form.
 *   2. A known SSO error code shows its message; free text in the URL is never shown.
 *   3. The removed password pages send the user back to /login.
 *   4. After an expired session the page says so and keeps the page to go back to.
 */

import { test, expect } from '@playwright/test';

test.describe('Login page', () => {
  test('offers Microsoft sign-in only', async ({ page }) => {
    await page.goto('/login');
    const sso = page.getByRole('link', { name: 'Sign in with Microsoft' });
    await expect(sso).toBeVisible();
    await expect(sso).toHaveAttribute('href', /\/api\/auth\/microsoft\/login/);
    await expect(page.locator('input')).toHaveCount(0);
  });

  test('shows the message of a known SSO error and never the URL text', async ({ page }) => {
    await page.goto('/login?error=sso_inactive&message=Injected%20text');
    await expect(page.getByRole('alert')).toContainText('Your account is disabled');
    await expect(page.getByText('Injected text')).toHaveCount(0);
  });

  test('says the session expired and keeps the page to go back to', async ({ page }) => {
    await page.goto('/login?return_to=%2Fprofile&reason=session_expired');
    await expect(page.getByRole('status')).toContainText('Your session expired');
    await expect(page.getByRole('img', { name: 'Africa CDC' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with Microsoft' }))
      .toHaveAttribute('href', '/api/auth/microsoft/login?return_to=%2Fprofile');
  });

  test('the removed password pages redirect to /login', async ({ page }) => {
    for (const path of ['/forgot-password', '/reset-password?token=x']) {
      await page.goto(path);
      await page.waitForURL('**/login');
    }
  });

});
