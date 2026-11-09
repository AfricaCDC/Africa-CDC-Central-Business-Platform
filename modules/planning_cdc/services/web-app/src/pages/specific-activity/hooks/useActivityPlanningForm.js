import { useEffect, useRef, useState } from 'react';
import { COMPLEXITY_CRITERIA, scoreComplexity } from '@rbm/lib/complexity';
import { useActivityPlanning, useSaveActivityPlanning } from './useActivityPlanningQueries';

const EMPTY_SCREENING = { requires_complex_decision: null, ...Object.fromEntries(COMPLEXITY_CRITERIA.map((c) => [c.key, null])) };
let nextKey = 1;
const newKey = () => `line-${nextKey++}`;

/** Editable copy of a saved cost line; `place` is used when the activity has several places. */
const toLine = (l) => ({
  key: newKey(), expense_category_id: l.expense_category_id || '', description: l.description || '', amount: String(l.amount ?? ''),
  place: l.place || '',
});

const sum = (lines) => Math.round(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100;

export const emptyLine = () => toLine({});

/**
 * Problems that block saving, in plain words (empty = valid): the screening
 * question is required (D-20261026-04), Yes needs the five ratings, every
 * cost line needs a category and a description.
 *
 * With several places (D-20261028-01) every line names its place and every
 * place needs a cost: each place becomes its own activity with its own budget.
 *
 * @param {object} screening - requires_complex_decision (true/false/null) + one rating per criterion key
 * @param {object[]} lines - cost lines of the form
 * @param {string[]} [places] - places of the activity when there are several
 * @returns {string[]}
 * @example planningProblems({ requires_complex_decision: null }, []) // ['answer the decision complexity question']
 */
export function planningProblems(screening, lines, places = []) {
  const problems = [];
  if (screening.requires_complex_decision === null) problems.push('answer the decision complexity question');
  if (screening.requires_complex_decision === true && !scoreComplexity(screening)) {
    problems.push('rate the five complexity criteria');
  }
  if (lines.some((l) => !l.expense_category_id || !l.description.trim())) problems.push('give every cost line a category and a description');
  if (places.length > 1) {
    if (lines.some((l) => !places.includes(l.place))) problems.push('give every cost line its place');
    const unpriced = places.filter((p) => sum(lines.filter((l) => l.place === p)) <= 0);
    if (unpriced.length) problems.push(`add the cost lines of ${unpriced.join(', ')}`);
  }
  return problems;
}

/**
 * Form state of the screening and the cost lines of a specific activity
 * (D-20261026-01), loaded once in edit mode, saved after the activity.
 *
 * With several places, each line names its place: `totalFor(place)` is the
 * budget of that place's activity and `save(id, place)` stores only its lines.
 *
 * @param {number|string|null} id - activity id in edit mode, null when creating
 * @param {string[]} [places] - places of the activity when there are several
 * @returns {{ screening: object, setScreening: Function, lines: object[], setLines: Function, total: number, totalFor: (place: string) => number, problems: string[], isLoading: boolean, save: (id: number, place?: string) => Promise<void> }}
 * @example const plan = useActivityPlanningForm(isEdit ? id : null, ['Kenya', 'Uganda']);
 */
export function useActivityPlanningForm(id, places = []) {
  const { data, isLoading } = useActivityPlanning(id);
  const saveAll = useSaveActivityPlanning();
  const [screening, setScreening] = useState(EMPTY_SCREENING);
  const [lines, setLines] = useState([]);
  const loaded = useRef(false);

  // Copy the saved planning into the form once (the form then owns its state).
  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    if (data.screening) {
      setScreening({ ...EMPTY_SCREENING, ...data.screening, requires_complex_decision: Boolean(data.screening.requires_complex_decision) });
    }
    setLines(data.cost_lines.map(toLine));
  }, [data]);

  const save = (activityId, place) => saveAll(activityId, {
    screening: screening.requires_complex_decision === null ? null : {
      requires_complex_decision: screening.requires_complex_decision,
      ...Object.fromEntries(COMPLEXITY_CRITERIA.map((c) => [c.key, screening[c.key] ? Number(screening[c.key]) : null])),
    },
    lines: lines.filter((l) => !place || l.place === place)
      .map((l) => ({ expense_category_id: Number(l.expense_category_id), description: l.description.trim(), amount: Number(l.amount) || 0 })),
  });

  // Once the user edits, the form keeps their entries (no overwrite by a later load).
  const edit = (setter) => (v) => { loaded.current = true; setter(v); };

  return {
    screening, setScreening: edit(setScreening), lines, setLines: edit(setLines),
    total: sum(lines),
    totalFor: (place) => sum(lines.filter((l) => l.place === place)),
    problems: planningProblems(screening, lines, places),
    isLoading: !!id && isLoading,
    save,
  };
}
