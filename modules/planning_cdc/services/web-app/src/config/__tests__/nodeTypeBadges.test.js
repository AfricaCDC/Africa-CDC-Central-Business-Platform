// ── nodeTypeBadges tests (H-7) ──
//
// Single source of truth for plan-node type colours/labels. Guards two things
// Lenny flagged: (1) a SPECIFIC_ACTIVITY must be a DISTINCT colour from a
// BROAD_ACTIVITY (and from the T4 Output indicator it used to share amber
// with); (2) getNodeBadge stays tier-aware for OUTCOME_INDICATOR (T2/T3/T4).

import { describe, it, expect } from 'vitest';
import { NODE_TYPES } from '@rbm/lib/enums';
import { getNodeBadge, NODE_TYPE_BADGES, TIER_BADGES } from '@/config/nodeTypeBadges';

describe('nodeTypeBadges colours', () => {
  it('should give SPECIFIC_ACTIVITY its own colour, distinct from BROAD_ACTIVITY', () => {
    const broad = NODE_TYPE_BADGES[NODE_TYPES.BROAD_ACTIVITY];
    const specific = NODE_TYPE_BADGES[NODE_TYPES.SPECIFIC_ACTIVITY];
    expect(specific.color).not.toBe(broad.color);
    expect(specific.bg).not.toBe(broad.bg);
  });

  it('should not reuse the T4 Output indicator colour for SPECIFIC_ACTIVITY', () => {
    const specific = NODE_TYPE_BADGES[NODE_TYPES.SPECIFIC_ACTIVITY];
    expect(specific.color).not.toBe(TIER_BADGES[4].color);
  });
});

describe('getNodeBadge', () => {
  it('should resolve the tier-specific entry for OUTCOME_INDICATOR rows', () => {
    expect(getNodeBadge({ node_type: NODE_TYPES.OUTCOME_INDICATOR, tier_id: 3 }).shortLabel).toBe('T3');
    expect(getNodeBadge({ node_type: NODE_TYPES.OUTCOME_INDICATOR, tier_id: 4 }).shortLabel).toBe('T4');
  });

  it('should resolve SPECIFIC_ACTIVITY by node_type', () => {
    expect(getNodeBadge({ node_type: NODE_TYPES.SPECIFIC_ACTIVITY }).label).toBe('Specific Activity');
  });
});
