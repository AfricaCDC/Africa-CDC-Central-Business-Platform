// ── Unit: APPROVAL_STEP_DECISIONS is the single source for step-decision values ──
//
// Cleaning Phase 2.2. The value written to approval_steps.decision used to be an
// inline literal map in each engine ('PENDING', 'BLOCKED_NO_APPROVER', ...). It now
// lives once in @rbm/lib/enums. This test pins the canonical values and proves the
// contributor engine's local STEP_DECISION alias derives from the shared enum
// (so the two can never drift — the class of bug this cleaning targets).

const { APPROVAL_STEP_DECISIONS, STATUSES } = require('@rbm/lib/enums');

describe('APPROVAL_STEP_DECISIONS — canonical step-decision values', () => {
  it('exposes exactly the five decision states', () => {
    expect(Object.keys(APPROVAL_STEP_DECISIONS).sort()).toEqual(
      ['APPROVED', 'BLOCKED_NO_APPROVER', 'CANCELLED', 'PENDING', 'REJECTED'].sort()
    );
  });

  it('reuses STATUSES values for the overlapping decisions (no translation needed)', () => {
    expect(APPROVAL_STEP_DECISIONS.APPROVED).toBe(STATUSES.APPROVED);
    expect(APPROVAL_STEP_DECISIONS.REJECTED).toBe(STATUSES.REJECTED);
    expect(APPROVAL_STEP_DECISIONS.CANCELLED).toBe(STATUSES.CANCELLED);
  });

  it('defines step-only states distinct from any entity status', () => {
    expect(APPROVAL_STEP_DECISIONS.PENDING).toBe('PENDING');
    expect(APPROVAL_STEP_DECISIONS.BLOCKED_NO_APPROVER).toBe('BLOCKED_NO_APPROVER');
  });

  it('is frozen (cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(APPROVAL_STEP_DECISIONS)).toBe(true);
  });
});
