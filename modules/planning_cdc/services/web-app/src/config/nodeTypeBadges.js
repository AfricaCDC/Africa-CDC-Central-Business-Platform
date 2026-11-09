/**
 * Single source of truth for how each plan-node TYPE is shown in the UI
 * (colour + label + short label), keyed off NODE_TYPES (zero-hardcode of the
 * type keys). Both the plan-node detail header and the reusable
 * `<NodeTypeBadge>` read from here so broad / specific / indicator are
 * distinguished identically everywhere (backlog H-7).
 *
 * OUTCOME_INDICATOR rows share one node_type but differ by tier (T2/T3/T4) —
 * `getNodeBadge` resolves the tier-specific entry for those.
 */
import { NODE_TYPES } from '@rbm/lib/enums';

// Tier-specific config for OUTCOME_INDICATOR (T2/T3/T4 share node_type).
export const TIER_BADGES = {
  2: { color: '#1A5632', bg: 'bg-[#1A5632]', label: 'Outcome Indicator',          shortLabel: 'T2',       tierLabel: 'T2 — Outcome' },
  3: { color: '#14442A', bg: 'bg-[#14442A]', label: 'Short-term Outcome Indicator', shortLabel: 'T3',     tierLabel: 'T3 — Short-term Outcome' },
  4: { color: '#D97706', bg: 'bg-[#D97706]', label: 'Output Indicator',           shortLabel: 'T4',       tierLabel: 'T4 — Output' },
};

// Per node_type config. `shortLabel` is the chip text; `label` is the full
// name (header + tooltip); `tierLabel` is the tier qualifier when relevant.
export const NODE_TYPE_BADGES = {
  [NODE_TYPES.IMPACT]:            { color: '#9F2241', bg: 'bg-[#9F2241]', label: 'Impact',             shortLabel: 'Impact',   tierLabel: null },
  [NODE_TYPES.IMPACT_INDICATOR]:  { color: '#7B1A33', bg: 'bg-[#7B1A33]', label: 'Impact Indicator',   shortLabel: 'T1',       tierLabel: 'T1 — Impact' },
  // eslint-disable-next-line no-restricted-syntax -- 'Outcome' is the human-readable chip label/short label for the OUTCOME_AREA node type (UI display text), not an ENTITY_TYPES / DB-table reference
  [NODE_TYPES.OUTCOME_AREA]:      { color: '#1A5632', bg: 'bg-[#1A5632]', label: 'Outcome',            shortLabel: 'Outcome',  tierLabel: null },
  [NODE_TYPES.OUTCOME_INDICATOR]: { color: '#14442A', bg: 'bg-[#14442A]', label: 'Outcome Indicator',  shortLabel: 'T2',       tierLabel: 'T2 — Outcome' },
  [NODE_TYPES.BROAD_ACTIVITY]:    { color: '#B45309', bg: 'bg-[#B45309]', label: 'Broad Activity',     shortLabel: 'Broad',    tierLabel: null },
  // Specific activities get their OWN distinct hue (blue) — they used to share
  // amber #D97706 with both Broad Activity and the T4 Output indicator, which
  // made them visually indistinguishable (H-7 feedback, D-20260621).
  [NODE_TYPES.SPECIFIC_ACTIVITY]: { color: '#2563EB', bg: 'bg-[#2563EB]', label: 'Specific Activity',  shortLabel: 'Specific', tierLabel: null },
};

const FALLBACK = NODE_TYPE_BADGES[NODE_TYPES.IMPACT];

/**
 * Resolve the badge config for a plan node — tier-aware for OUTCOME_INDICATOR.
 *
 * @param {{ node_type?: string, tier_id?: number }|null} node
 * @returns {{ color: string, bg: string, label: string, shortLabel: string, tierLabel: string|null }}
 * @example getNodeBadge({ node_type: 'OUTCOME_INDICATOR', tier_id: 4 }).shortLabel // → 'T4'
 */
export function getNodeBadge(node) {
  if (!node) return FALLBACK;
  if (node.node_type === NODE_TYPES.OUTCOME_INDICATOR && node.tier_id && TIER_BADGES[node.tier_id]) {
    return TIER_BADGES[node.tier_id];
  }
  return NODE_TYPE_BADGES[node.node_type] || FALLBACK;
}

/**
 * Ordered legend of the plan hierarchy (top → bottom) for a colour key.
 */
export const NODE_TYPE_LEGEND = [
  NODE_TYPES.OUTCOME_AREA,
  NODE_TYPES.OUTCOME_INDICATOR,
  NODE_TYPES.BROAD_ACTIVITY,
  NODE_TYPES.SPECIFIC_ACTIVITY,
].map((type) => ({ type, ...NODE_TYPE_BADGES[type] }));
