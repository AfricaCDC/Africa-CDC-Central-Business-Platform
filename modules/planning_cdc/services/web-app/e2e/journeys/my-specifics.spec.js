/**
 * E2E spec: My Specifics page — /my-specifics
 *
 * Scenarios:
 *   1. Page loads and renders the specific activities list (or empty state)
 *   2. "New specific" button navigates to the dedicated form PAGE /my-specifics/new
 *      (per CLAUDE.md: forms with >3 fields MUST be a full page, NOT a modal)
 *   3. Filter tabs (All, Drafts, In review, Approved, Rejected) are present
 */

import { test, expect } from '@playwright/test';
import { signIn } from '../fixtures/auth.js';

test.describe('My Specifics page — /my-specifics', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('page loads without JS errors', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/my-specifics');
    await page.waitForURL('**/my-specifics', { timeout: 10_000 });

    // Loading spinner disappears once data arrives
    await expect(page.locator('.animate-spin').first()).not.toBeVisible({ timeout: 12_000 });

    expect(jsErrors).toHaveLength(0);
  });

  test('renders list or empty state — never a blank page', async ({ page }) => {
    await page.goto('/my-specifics');
    await page.waitForURL('**/my-specifics', { timeout: 10_000 });
    await expect(page.locator('.animate-spin').first()).not.toBeVisible({ timeout: 12_000 });

    // Either a table row is present OR the empty-state message is shown.
    // MySpecificsPage shows the empty text when no records exist.
    const tableRow = page.locator('table tbody tr, [role="row"]').first();
    const emptyText = page.getByText(/no specific activity|click.*new specific/i).first();

    const hasRows  = await tableRow.isVisible().catch(() => false);
    const hasEmpty = await emptyText.isVisible().catch(() => false);
    expect(hasRows || hasEmpty).toBe(true);
  });

  test('filter tabs All / Drafts / In review / Approved / Rejected are rendered', async ({ page }) => {
    await page.goto('/my-specifics');
    await page.waitForURL('**/my-specifics', { timeout: 10_000 });
    await expect(page.locator('.animate-spin').first()).not.toBeVisible({ timeout: 12_000 });

    const expectedTabs = ['All', 'Drafts', 'In review', 'Approved', 'Rejected'];
    for (const tab of expectedTabs) {
      await expect(page.getByText(tab, { exact: true }).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('"New specific" button navigates to a dedicated form page (not a modal)', async ({ page }) => {
    await page.goto('/my-specifics');
    await page.waitForURL('**/my-specifics', { timeout: 10_000 });
    await expect(page.locator('.animate-spin').first()).not.toBeVisible({ timeout: 12_000 });

    // Find and click the "New specific" button
    const newBtn = page.getByText('New specific', { exact: true }).first();
    await expect(newBtn).toBeVisible({ timeout: 5_000 });
    await newBtn.click();

    // Per CLAUDE.md: forms with >3 fields MUST navigate to their own page,
    // not open a modal. Verify the URL changes to /my-specifics/new.
    await page.waitForURL('**/my-specifics/new', { timeout: 8_000 });
    expect(page.url()).toContain('/my-specifics/new');

    // Confirm a form element is present on the new page
    await expect(page.locator('form, input, select, textarea').first()).toBeVisible({ timeout: 8_000 });
  });
});
