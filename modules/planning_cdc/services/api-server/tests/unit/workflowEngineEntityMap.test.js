// ── Guardrail: workflowEngine.ENTITY_MAP is the single source of truth ──
//
// D-20260817-02 ("TOUJOURS BRANCHER", supersedes D-20260530-02):
//   - EVERY approval flow is template-driven — PLAN_NODE included. The five
//     entity types below are the exhaustive engine surface.
//   - contributorWorkflowEngine is the CONTRIBUTOR_CHAIN variant of the SAME
//     engine and must reuse workflowEngine.ENTITY_MAP — never redefine its
//     own copy (which previously drifted with a "keep in sync" comment).

const workflowEngine = require('../../src/services/workflowEngine');

describe('workflowEngine.ENTITY_MAP — single source of truth', () => {
  it('exposes exactly the five template-driven entity types', () => {
    expect(Object.keys(workflowEngine.ENTITY_MAP).sort()).toEqual(
      ['ACTIVITY_REPORT', 'DIVISION_ACTIVITY_REPORT', 'INDICATOR_ACTUAL', 'INDICATOR_DIVISION_REPORT', 'PLAN_NODE'].sort()
    );
  });

  it('contains PLAN_NODE (specific activities re-wired, D-20260817-02)', () => {
    expect(workflowEngine.ENTITY_MAP.PLAN_NODE).toEqual({
      table: 'plan_nodes', col: 'status',
      onSubmit: 'IN_REVIEW', onApprove: 'APPROVED', onReject: 'REJECTED',
    });
  });

  it('every entry has the table/col/onSubmit/onApprove/onReject shape', () => {
    for (const [key, cfg] of Object.entries(workflowEngine.ENTITY_MAP)) {
      expect({ key, ...cfg }).toEqual(
        expect.objectContaining({
          table: expect.any(String),
          col: expect.any(String),
          onSubmit: expect.any(String),
          onApprove: expect.any(String),
          onReject: expect.any(String),
        })
      );
    }
  });
});
