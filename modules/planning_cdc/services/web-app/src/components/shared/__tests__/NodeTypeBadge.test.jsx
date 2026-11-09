// ── NodeTypeBadge tests ──
//
// NodeTypeBadge is the single-source chip that names a plan node's TYPE
// (Outcome / Broad / Specific / indicator tier). It must read its label +
// colour classes exclusively from the centralized getNodeBadge config
// (@/config/nodeTypeBadges) — never inline — so every surface distinguishes
// the hierarchy levels identically (backlog H-7).

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NODE_TYPES } from '@rbm/lib/enums';
import { getNodeBadge, NODE_TYPE_BADGES } from '@/config/nodeTypeBadges';
import NodeTypeBadge from '../NodeTypeBadge';

describe('<NodeTypeBadge />', () => {
  it('should render the centralized short label for a known node type', () => {
    const cfg = getNodeBadge({ node_type: NODE_TYPES.BROAD_ACTIVITY });
    render(<NodeTypeBadge node={{ node_type: NODE_TYPES.BROAD_ACTIVITY }} />);
    expect(screen.getByText(cfg.shortLabel)).toBeInTheDocument();
  });

  it('should render the full label (not the short one) when `full` is set', () => {
    const cfg = getNodeBadge({ node_type: NODE_TYPES.SPECIFIC_ACTIVITY });
    render(<NodeTypeBadge node={{ node_type: NODE_TYPES.SPECIFIC_ACTIVITY }} full />);
    expect(screen.getByText(cfg.label)).toBeInTheDocument();
  });

  it('should apply the centralized bg class from getNodeBadge', () => {
    const cfg = getNodeBadge({ node_type: NODE_TYPES.OUTCOME_AREA });
    render(<NodeTypeBadge node={{ node_type: NODE_TYPES.OUTCOME_AREA }} />);
    const chip = screen.getByText(cfg.shortLabel);
    expect(chip).toHaveClass(cfg.bg);
  });

  it('should resolve the tier-specific entry for OUTCOME_INDICATOR by tier_id', () => {
    // T4 → "T4" chip, distinct from the default OUTCOME_INDICATOR (T2) entry
    render(<NodeTypeBadge node={{ node_type: NODE_TYPES.OUTCOME_INDICATOR, tier_id: 4 }} />);
    expect(screen.getByText('T4')).toBeInTheDocument();
  });

  it('should carry the full label / tier label in the title attribute', () => {
    const cfg = getNodeBadge({ node_type: NODE_TYPES.OUTCOME_INDICATOR, tier_id: 3 });
    render(<NodeTypeBadge node={{ node_type: NODE_TYPES.OUTCOME_INDICATOR, tier_id: 3 }} />);
    const chip = screen.getByText('T3');
    expect(chip).toHaveAttribute('title', cfg.tierLabel);
  });

  it('should fall back to a safe config (no crash) for a null node', () => {
    const fallback = NODE_TYPE_BADGES[NODE_TYPES.IMPACT];
    render(<NodeTypeBadge node={null} />);
    expect(screen.getByText(fallback.shortLabel)).toBeInTheDocument();
  });

  it('should fall back to a safe config for an unknown node type', () => {
    const fallback = NODE_TYPE_BADGES[NODE_TYPES.IMPACT];
    render(<NodeTypeBadge node={{ node_type: 'TOTALLY_UNKNOWN_TYPE' }} />);
    expect(screen.getByText(fallback.shortLabel)).toBeInTheDocument();
  });
});
