import React from 'react';
import { COLORS } from '@rbm/lib';

const TIER_CONFIG = {
  1: { label: 'T1', bg: COLORS.TIER_1, full: 'Impact' },
  2: { label: 'T2', bg: COLORS.TIER_2, full: 'Outcome' },
  3: { label: 'T3', bg: COLORS.TIER_3, full: 'Activity' },
  4: { label: 'T4', bg: COLORS.TIER_4, full: 'Task' },
};

export default function TierBadge({ tier, showFull = false, className = '' }) {
  const cfg = TIER_CONFIG[tier];
  if (!cfg) return null;

  return (
    <span
      className={`text-[9px] px-1.5 py-0.5 font-bold text-white ${className}`}
      style={{ backgroundColor: cfg.bg }}
    >
      {cfg.label}{showFull ? ` — ${cfg.full}` : ''}
    </span>
  );
}

export { TIER_CONFIG };
