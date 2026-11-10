import { getStatusConfig } from '@rbm/lib/enums';

/**
 * Single-source status badge.
 *
 * Renders a status pill whose label and colours come exclusively from the
 * centralized `getStatusConfig` (→ `STATUS_LABELS` / `STATUS_STYLES`) in
 * `@rbm/lib/enums`. This is the ONLY place the front-end maps a status value to
 * a visual style — never inline a `{ DRAFT: 'bg-…', … }` map in a page
 * (enforced by the `cdc-rbm/no-inline-status-map` ESLint rule, CHARTER §2
 * Zero Hardcoded Values).
 *
 * Unknown / non-enum statuses (e.g. legacy `ON_HOLD`) fall back to a neutral
 * gray style with a humanized label, so the badge never crashes on bad data.
 *
 * @param {object} props
 * @param {string} props.status - The status value (one of `STATUSES.*`).
 * @param {'xs'|'sm'} [props.size='xs'] - Visual size. `xs` matches the dense
 *   table/list density used across the app; `sm` is slightly larger.
 * @param {string} [props.className] - Extra classes appended to the pill.
 * @returns {JSX.Element}
 *
 * @example
 * <StatusBadge status={node.status} />
 */
export default function StatusBadge({ status, size = 'xs', className = '' }) {
  const cfg = getStatusConfig(status);
  const sizeCls = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-[9px] px-1.5 py-0.5';
  return (
    <span
      className={`inline-flex items-center font-semibold ${sizeCls} ${cfg.bg} ${cfg.text} ${className}`.trim()}
    >
      {cfg.label}
    </span>
  );
}
