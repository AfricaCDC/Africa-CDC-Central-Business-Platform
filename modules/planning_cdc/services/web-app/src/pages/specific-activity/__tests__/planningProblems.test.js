// ── planningProblems — what blocks saving the screening and cost lines ──

import { describe, it, expect } from 'vitest';
import { COMPLEXITY_CRITERIA } from '@rbm/lib/complexity';
import { planningProblems } from '../hooks/useActivityPlanningForm';

const rated = Object.fromEntries(COMPLEXITY_CRITERIA.map((c) => [c.key, 2]));
const LINE = { expense_category_id: '2', description: 'Tickets', amount: '10' };

describe('planningProblems', () => {
  it('should require an answer to the decision complexity question (D-20261026-04)', () => {
    expect(planningProblems({ requires_complex_decision: null }, [])).toEqual(['answer the decision complexity question']);
  });

  it('should accept No without ratings', () => {
    expect(planningProblems({ requires_complex_decision: false }, [LINE])).toEqual([]);
  });

  it('should require the five ratings on Yes', () => {
    expect(planningProblems({ requires_complex_decision: true, scope_impact: 2 }, [])).toEqual(['rate the five complexity criteria']);
    expect(planningProblems({ requires_complex_decision: true, ...rated }, [])).toEqual([]);
  });

  it('should require a category and a description on every cost line', () => {
    expect(planningProblems({ requires_complex_decision: false }, [{ ...LINE, description: ' ' }]))
      .toEqual(['give every cost line a category and a description']);
  });

  it('should require a place on every line and a cost for every place when there are several (D-20261028-01)', () => {
    const no = { requires_complex_decision: false };
    const kenya = { ...LINE, place: 'Kenya' };
    expect(planningProblems(no, [kenya], ['Kenya', 'Uganda'])).toEqual(['add the cost lines of Uganda']);
    expect(planningProblems(no, [kenya, { ...LINE, place: '' }], ['Kenya', 'Uganda']))
      .toEqual(['give every cost line its place', 'add the cost lines of Uganda']);
    expect(planningProblems(no, [kenya, { ...LINE, place: 'Uganda' }], ['Kenya', 'Uganda'])).toEqual([]);
  });
});
