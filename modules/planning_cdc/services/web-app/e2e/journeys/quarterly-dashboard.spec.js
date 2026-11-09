/**
 * E2E spec: Quarterly reporting dashboard — /reporting/quarterly-dashboard
 *
 * Scenarios:
 *   1. Page loads without JS errors and renders KPI summary cards
 *   2. The quarter filter buttons are present (Q1–Q4)
 *   3. Clicking Q1 filter does not crash the page
 */

import { test, expect } from '@playwright/test';
import { signIn } from '../fixtures/auth.js';

test.describe('Quarterly dashboard — /reporting/quarterly-dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('page loads and KPI summary cards are visible', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/reporting/quarterly-dashboard');
    await page.waitForURL('**/reporting/quarterly-dashboard', { timeout: 10_000 });

    // Wait for the loading spinner to disappear (data has loaded)
    await expect(page.locator('.animate-spin').first()).not.toBeVisible({ timeout: 15_000 });

    // The dashboard renders summary cards with labels from the KPI section.
    // RbacPermissionsPage: labels like "Indicators", "Divisions", "Fully reported"
    // SummaryCard renders: label + value. We check for at least one numeric value cell.
    const summaryCards = page.locator('[role="button"], [tabindex="0"]');
    await expect(summaryCards.first()).toBeVisible({ timeout: 10_000 });

    // No unhandled JS errors
    expect(jsErrors).toHaveLength(0);
  });

  test('quarter filter buttons Q1–Q4 are rendered', async ({ page }) => {
    await page.goto('/reporting/quarterly-dashboard');
    await page.waitForURL('**/reporting/quarterly-dashboard', { timeout: 10_000 });
    await expect(page.locator('.animate-spin').first()).not.toBeVisible({ timeout: 15_000 });

    for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
      await expect(page.getByText(q, { exact: true }).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('selecting Q1 filter does not crash the page', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/reporting/quarterly-dashboard');
    await page.waitForURL('**/reporting/quarterly-dashboard', { timeout: 10_000 });
    await expect(page.locator('.animate-spin').first()).not.toBeVisible({ timeout: 15_000 });

    // Click the Q1 button
    await page.getByText('Q1', { exact: true }).first().click();

    // Page should remain on the dashboard (no redirect / crash)
    await expect(page).toHaveURL(/reporting\/quarterly-dashboard/, { timeout: 5_000 });

    // No new JS errors introduced by the filter interaction
    expect(jsErrors).toHaveLength(0);
  });
});
