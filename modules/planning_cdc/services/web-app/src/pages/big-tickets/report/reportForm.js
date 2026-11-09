const TEXT_FIELDS = ['progress_status', 'narrative', 'challenges', 'next_steps'];

function lineValue(line, report, prefill) {
  const saved = report?.values?.find((v) => v.line_id === line.id);
  if (saved) return { achieved: saved.achieved || '', achieved_numeric: saved.achieved_numeric == null ? '' : Number(saved.achieved_numeric) };
  const suggested = prefill?.[line.id]?.suggested;
  return suggested == null ? { achieved: '', achieved_numeric: '' } : { achieved: String(suggested), achieved_numeric: suggested };
}

/**
 * Initial form of a report: the saved report, else the pre-fill (suggested
 * achieved value per line from the indicator reports).
 *
 * @param {{ ticket: object, report: object|null, prefill: object }} data
 * @returns {{ progress_status: string, narrative: string, challenges: string, next_steps: string, values: Record<number, { achieved: string, achieved_numeric: string }> }}
 * @example initialForm({ ticket, report: null, prefill: { 7: { suggested: 12 } } });
 */
export function initialForm({ ticket, report, prefill }) {
  const values = Object.fromEntries(ticket.lines.map((line) => [line.id, lineValue(line, report, prefill)]));
  const texts = Object.fromEntries(TEXT_FIELDS.map((key) => [key, report?.[key] || '']));
  return { ...texts, values };
}

/**
 * API payload of the form.
 *
 * @param {object} form - from initialForm
 * @param {string} fiscalYear
 * @param {boolean} submit
 * @returns {object}
 * @example toPayload(form, '2026', false);
 */
export function toPayload(form, fiscalYear, submit) {
  return {
    fiscal_year: fiscalYear,
    submit,
    progress_status: form.progress_status || null,
    narrative: form.narrative || null,
    challenges: form.challenges || null,
    next_steps: form.next_steps || null,
    values: Object.entries(form.values).map(([lineId, v]) => ({
      line_id: Number(lineId),
      achieved: v.achieved || null,
      achieved_numeric: v.achieved_numeric === '' || v.achieved_numeric == null ? null : Number(v.achieved_numeric),
    })),
  };
}
