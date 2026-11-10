# E2E Tests — Africa CDC RBM Planning

End-to-end tests use [Playwright](https://playwright.dev/) and live under `services/web-app/e2e/`.

---

## One-time setup

```bash
# 1. Install the package (already declared as devDependency)
cd services/web-app
npm install

# 2. Install the Chromium browser binary (run once per machine)
npx playwright install chromium
```

---

## Running tests

Both the **API server** and the **Vite dev server** must be running before you invoke Playwright.
The config uses `reuseExistingServer: true` — it does NOT start servers automatically.

```bash
# Terminal 1 — start the API
cd services/api-server && npm run dev

# Terminal 2 — start the frontend (port 5000)
cd services/web-app && npx vite --port 5000

# Terminal 3 — run E2E tests
cd services/web-app && npm run e2e
```

### Useful flags

```bash
# Interactive UI mode (pick specs, watch replays)
npm run e2e:ui

# Run a single spec
npx playwright test e2e/journeys/login.spec.js

# Headed mode (see the browser)
npx playwright test --headed

# Debug mode (pause on each step)
npx playwright test --debug

# Repeat each test N times to catch flakiness
npx playwright test --repeat-each=5
```

---

## Viewing the HTML report

After a test run the HTML report is generated at `playwright-report/index.html`.

```bash
npm run e2e:report
```

Or open `services/web-app/playwright-report/index.html` directly in your browser.

---

## Artifacts (screenshots, videos, traces)

Artifacts are only captured when a test **fails** (`retain-on-failure`).  
They land in `playwright-report/test-results/`.

To inspect a trace:

```bash
npx playwright show-trace playwright-report/test-results/<test-name>/trace.zip
```

---

## Directory layout

```
e2e/
├── fixtures/
│   └── auth.js          — signIn() and testToken(): sign in with a token signed from the local .env (no password, D-20261107-03)
└── journeys/
    ├── login.spec.js              — Sign-in happy path + error cases
    ├── rbac.spec.js               — RBAC matrix page access control
    ├── quarterly-dashboard.spec.js — /reporting/quarterly-dashboard KPIs
    └── my-specifics.spec.js        — /my-specifics list + "New specific" page nav
```

---

## Quarantining a flaky test

If a test is intermittently failing, quarantine it rather than deleting it:

```js
test('flaky: some description', async ({ page }) => {
  test.fixme(true, 'Intermittent failure — tracked in issue #NNN');
  // … test body …
});
```

Open a tracking issue and add the issue number to the `fixme` comment.

---

## Updating selectors after UI changes

Selectors are intentionally semantic (role/text/id) to survive CSS class renames.  
If a UI component's text label or HTML `id` changes, update the relevant spec.  
Run `npm run e2e` after any UI change to catch regressions early.
