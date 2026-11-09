/**
 * Coloured chip that names a plan node's TYPE (Outcome / Broad / Specific /
 * indicator tier). Reads the single-source config in
 * `@/config/nodeTypeBadges` so every surface distinguishes the hierarchy
 * levels identically (backlog H-7).
 *
 * @param {object} props
 * @param {{ node_type?: string, tier_id?: number }} props.node - the plan node
 * @param {boolean} [props.full] - show the full label (e.g. "Broad Activity")
 *   instead of the short chip ("Broad"); the tooltip always carries the full name
 * @param {string} [props.className]
 * @returns {JSX.Element}
 * @example <NodeTypeBadge node={child} />
 */
import { getNodeBadge } from '@/config/nodeTypeBadges';

export default function NodeTypeBadge({ node, full = false, className = '' }) {
  const cfg = getNodeBadge(node);
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white ${cfg.bg} ${className}`}
      title={cfg.tierLabel || cfg.label}
    >
      {full ? cfg.label : cfg.shortLabel}
    </span>
  );
}
