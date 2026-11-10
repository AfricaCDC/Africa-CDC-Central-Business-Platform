import { useState } from 'react';
import { QUARTER_KEYS } from '../config';

const TARGET_TEXT = ['annual_target', ...QUARTER_KEYS.map((q) => `${q}_milestone`)];
const TARGET_NUMBERS = TARGET_TEXT.map((f) => `${f}_numeric`);

const emptyTarget = () => Object.fromEntries([...TARGET_TEXT, ...TARGET_NUMBERS].map((f) => [f, '']));
let lineSeq = 0;
const newLine = () => ({ key: `new-${++lineSeq}`, id: null, label: '', indicator_code: '', tier: '', target: emptyTarget() });
const str = (v) => (v === null || v === undefined ? '' : String(v));

/**
 * Form state from a loaded ticket (edit) or empty (create).
 * @param {object|null} ticket - detail payload of the year, or null
 * @param {string} fiscalYear
 * @returns {object}
 */
export function initialForm(ticket, fiscalYear) {
  if (!ticket) {
    return {
      code: '', title: '', pillar_id: '', lead_division_code: '', contributors: [], contributors_note: '',
      expected_result: '', delivery_model: '', success_factors: '', start_year: fiscalYear, end_year: '', is_active: true,
      lines: [newLine()],
    };
  }
  return {
    code: ticket.code, title: ticket.title, pillar_id: str(ticket.pillar_id), lead_division_code: ticket.lead_division_code,
    contributors: ticket.contributors.map((c) => c.division_code), contributors_note: str(ticket.contributors_note),
    expected_result: str(ticket.expected_result), delivery_model: str(ticket.delivery_model), success_factors: str(ticket.success_factors),
    start_year: ticket.start_year, end_year: str(ticket.end_year), is_active: !!ticket.is_active,
    lines: ticket.lines.map((l) => ({
      key: `line-${l.id}`, id: l.id, label: str(l.label), indicator_code: str(l.indicator_code), tier: str(l.tier),
      target: Object.fromEntries([...TARGET_TEXT, ...TARGET_NUMBERS].map((f) => [f, str(l.target?.[f])])),
    })),
  };
}

const textOrNull = (v) => (String(v).trim() ? String(v).trim() : null);
const numberOrNull = (v) => (String(v).trim() === '' ? null : Number(v));

/**
 * API payload from the form state.
 * @param {object} form
 * @param {string} fiscalYear - year whose targets are saved
 * @returns {object}
 */
export function toPayload(form, fiscalYear) {
  return {
    code: form.code.trim(), title: form.title.trim(),
    pillar_id: form.pillar_id ? Number(form.pillar_id) : null,
    lead_division_code: form.lead_division_code, contributors: form.contributors,
    contributors_note: textOrNull(form.contributors_note),
    expected_result: textOrNull(form.expected_result), delivery_model: textOrNull(form.delivery_model),
    success_factors: textOrNull(form.success_factors),
    start_year: form.start_year, end_year: form.end_year || null, is_active: form.is_active,
    fiscal_year: fiscalYear,
    lines: form.lines.map((l) => ({
      ...(l.id ? { id: l.id } : {}),
      label: textOrNull(l.label), indicator_code: textOrNull(l.indicator_code), tier: textOrNull(l.tier),
      target: {
        ...Object.fromEntries(TARGET_TEXT.map((f) => [f, textOrNull(l.target[f])])),
        ...Object.fromEntries(TARGET_NUMBERS.map((f) => [f, numberOrNull(l.target[f])])),
      },
    })),
  };
}

/**
 * Errors shown before sending (the server validates again).
 * @param {object} form
 * @param {string} fiscalYear
 * @returns {string[]}
 */
export function validateForm(form, fiscalYear) {
  const outsideYears = fiscalYear < form.start_year || (form.end_year && fiscalYear > form.end_year);
  const negative = form.lines.some((l) => TARGET_NUMBERS.some((f) => l.target[f] !== '' && Number(l.target[f]) < 0));
  return [
    [!/^[A-Za-z0-9_-]{2,10}$/.test(form.code.trim()), 'Code: 2 to 10 letters or digits (e.g. BT43).'],
    [form.title.trim().length < 3, 'Title is required.'],
    [!form.lead_division_code, 'Choose the lead business unit.'],
    [form.end_year && form.end_year < form.start_year, 'End year cannot be before the start year.'],
    [outsideYears, `Targets year ${fiscalYear} is outside the ticket years.`],
    [!form.lines.length, 'Add at least one indicator line.'],
    [negative, 'Targets and milestones cannot be negative.'],
  ].filter(([failed]) => failed).map(([, message]) => message);
}

/**
 * Controlled state of the Big Ticket form.
 *
 * @param {object} initial - from initialForm()
 * @returns {{ form: object, setField: Function, toggleContributor: Function, addLine: Function,
 *   removeLine: Function, setLine: Function, setTarget: Function }}
 * @example const f = useTicketForm(initialForm(ticket, '2026'));
 */
export function useTicketForm(initial) {
  const [form, setForm] = useState(initial);
  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const toggleContributor = (code) => setForm((f) => ({
    ...f, contributors: f.contributors.includes(code) ? f.contributors.filter((c) => c !== code) : [...f.contributors, code],
  }));
  const updateLine = (key, patch) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? patch(l) : l)) }));
  return {
    form,
    setField,
    toggleContributor,
    addLine: () => setForm((f) => ({ ...f, lines: [...f.lines, newLine()] })),
    removeLine: (key) => setForm((f) => ({ ...f, lines: f.lines.filter((l) => l.key !== key) })),
    setLine: (key, field, value) => updateLine(key, (l) => ({ ...l, [field]: value })),
    setTarget: (key, field, value) => updateLine(key, (l) => ({ ...l, target: { ...l.target, [field]: value } })),
  };
}
