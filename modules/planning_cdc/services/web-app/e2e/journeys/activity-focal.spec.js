/**
 * E2E spec: Activity focal person — form field + division-staff endpoint
 *
 * Scenarios:
 *   1. /my-specifics/new renders the "Focal person (staff of the division)"
 *      picker without JS errors.
 *   2. GET /api/plan-nodes/division-staff/:code answers 200 with the
 *      success envelope for a real division, 404 for an unknown one.
 *   3. Creating a specific activity with a focal from OUTSIDE the main
 *      division is rejected with 422 (server-side eligibility rule).
 *
 * Read-only on purpose: no rows are persisted (the 422 create is rejected
 * before any INSERT), so no test-data cleanup is needed.
 */

import { test, expect } from '@playwright/test';
import { signIn, testToken } from '../fixtures/auth.js';

test.describe('Activity focal person', () => {
  test('new-specific form page renders the focal person picker without JS errors', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await signIn(page);
    await page.goto('/my-specifics/new');
    await expect(page.locator('.animate-spin').first()).not.toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByText(/Focal person \(staff of the division\)/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    expect(jsErrors).toHaveLength(0);
  });

  test('division-staff endpoint returns the success envelope for a real division', async ({ request }) => {
    const token = testToken();
    const auth = { Authorization: `Bearer ${token}` };

    // Pick a real division code from the reference list.
    const divRes = await request.get('/api/admin/division-codes', { headers: auth });
    expect(divRes.ok()).toBe(true);
    const divisions = await divRes.json();
    const code = (Array.isArray(divisions) ? divisions : divisions.data || [])[0]?.code;
    expect(code).toBeTruthy();

    const staffRes = await request.get(`/api/plan-nodes/division-staff/${code}`, { headers: auth });
    expect(staffRes.status()).toBe(200);
    const staffBody = await staffRes.json();
    expect(staffBody.success).toBe(true);
    expect(Array.isArray(staffBody.data)).toBe(true);

    const missingRes = await request.get('/api/plan-nodes/division-staff/__NOPE__', { headers: auth });
    expect(missingRes.status()).toBe(404);
  });

  test('creating an activity with an out-of-division focal is rejected with 422', async ({ request }) => {
    const token = testToken();
    const auth = { Authorization: `Bearer ${token}` };

    // A real broad activity to attach to.
    const broadsRes = await request.get('/api/plan-nodes?node_type=BROAD_ACTIVITY', { headers: auth });
    expect(broadsRes.ok()).toBe(true);
    const broads = await broadsRes.json();
    const parent = (Array.isArray(broads) ? broads : broads.data || [])
      .find((b) => b.responsible_division_code);
    expect(parent).toBeTruthy();

    // focal_user_id 999999 does not exist → fails the STAFF-of-division rule.
    const createRes = await request.post('/api/plan-nodes/specific-activity', {
      headers: auth,
      data: {
        title: 'E2E focal eligibility check (must never persist)',
        parent_id: parent.id,
        responsible_division_code: parent.responsible_division_code,
        focal_user_id: 999999,
        activity_type: 'EVENT',
        implementation_at_rcc: 0,
        budgeting_arrangement: 'Extramural',
        primary_funding_source: 'E2E',
        grant_name: 'E2E',
        budget_main: 1000,
      },
    });
    expect(createRes.status()).toBe(422);
    const body = await createRes.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/active staff member of the responsible division/i);
  });
});
