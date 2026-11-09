// ── Contract: there is ONE approval-decision engine ──
//
// Cleaning Phase 1.3. The platform exposes three thin HTTP surfaces that let a
// user decide an approval step, each serving a different frontend module with
// its own auth:
//   - PUT  /governance/steps/:id/decide              (governanceRoutes)  — QuarterlyReportFormPage
//   - PUT  /governance/workflows/steps/:id/decide    (workflowRoutes)    — workflowApi
//   - POST /governance/workflows/steps/:id/approve|reject (contributorApprovalRoutes) — ApprovalReviewPage
//
// They MUST all delegate to workflowEngine.decideWorkflowStep — the single
// decision state machine. No route may fork its own decision logic by mutating
// approval_instances.status / approval_steps.decision directly. This test fails
// if a future edit reintroduces a parallel decision path (the class of drift
// that produced the "which approval path ran?" bugs).

const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.resolve(__dirname, '../../src/routes');
const DECISION_ROUTE_FILES = [
  'governanceRoutes.js',
  'workflowRoutes.js',
  'contributorApprovalRoutes.js',
];

describe('approval decision path is unified through workflowEngine.decideWorkflowStep', () => {
  for (const file of DECISION_ROUTE_FILES) {
    it(`${file} delegates step decisions to decideWorkflowStep`, () => {
      const src = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
      expect(src).toMatch(/decideWorkflowStep\s*\(/);
    });

    it(`${file} does NOT fork its own decision logic (no direct instance-status mutation)`, () => {
      const src = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
      // A route that sets approval_instances.status to APPROVED/REJECTED itself
      // would be a parallel decision engine. The only legitimate writer is the
      // engine. contributorApprovalRoutes may still call adminBypassInstance
      // (engine-owned) — that does not mutate status inline here.
      expect(src).not.toMatch(/approval_instances'\)[\s\S]{0,80}\.update\(\s*\{\s*status/);
    });
  }
});
