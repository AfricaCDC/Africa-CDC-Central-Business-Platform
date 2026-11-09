import { BIG_TICKET_PROGRESS, BIG_TICKET_PROGRESS_CONFIG, QUARTERS } from '@rbm/lib/enums';

export { BIG_TICKET_PROGRESS, BIG_TICKET_PROGRESS_CONFIG };

/** First year Big Tickets were tracked on the platform. */
const FIRST_YEAR = 2026;

/** Years offered in the selectors: from 2026 to next year. */
export const YEAR_OPTIONS = Array.from(
  { length: Math.max(new Date().getFullYear() + 1 - FIRST_YEAR + 1, 1) },
  (_, i) => String(FIRST_YEAR + i),
);

export const QUARTER_OPTIONS = Object.keys(QUARTERS);
export const QUARTER_KEYS = QUARTER_OPTIONS.map((q) => q.toLowerCase());

export const PROGRESS_OPTIONS = Object.values(BIG_TICKET_PROGRESS).map((value) => ({
  value, label: BIG_TICKET_PROGRESS_CONFIG[value].label,
}));

/**
 * Short pillar label: "Pillar 2_Institutionalised…" → "Pillar 2", "Crosscuting" → "Cross-cutting".
 * @param {string|null|undefined} name
 * @returns {string}
 * @example pillarShort('Pillar 4_Digital transformation'); // 'Pillar 4'
 */
export function pillarShort(name) {
  if (!name) return 'No pillar';
  if (name.includes('_')) return name.split('_')[0];
  return /^cross/i.test(name) ? 'Cross-cutting' : name;
}

/**
 * Pillar title without its "Pillar N_" prefix.
 * @param {string|null|undefined} name
 * @returns {string}
 * @example pillarTitle('Pillar 4_Digital transformation'); // 'Digital transformation'
 */
export function pillarTitle(name) {
  if (!name) return 'Not assigned to a pillar';
  if (name.includes('_')) return name.split('_').slice(1).join('_');
  return /^cross/i.test(name) ? 'Cross-cutting enablers' : name;
}

/**
 * Group list rows by pillar, in pillar order.
 * @param {Array<{ pillar_id: number|null, pillar_name: string|null }>} items
 * @returns {Array<{ key: string, name: string|null, items: object[] }>}
 * @example groupByPillar(data.items);
 */
export function groupByPillar(items) {
  const groups = new Map();
  for (const item of items) {
    const key = String(item.pillar_id ?? 'none');
    if (!groups.has(key)) groups.set(key, { key, name: item.pillar_name, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}

/** "2026" or "2026 – 2027" or "2026 – open". */
export const yearsLabel = (t) => (t.end_year === t.start_year ? t.start_year : `${t.start_year} – ${t.end_year || 'open'}`);
