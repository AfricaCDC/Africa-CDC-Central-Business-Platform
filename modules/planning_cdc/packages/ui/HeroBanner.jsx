import React from 'react';
import { COLORS } from '@rbm/lib';

const TIER_COLORS = {
  1: COLORS.TIER_1,
  2: COLORS.TIER_2,
  3: COLORS.TIER_3,
  4: COLORS.TIER_4,
};

/**
 * HeroBanner — colored header used on Impact, Outcome, Activity, Task pages
 *
 * @param {number} tier — 1-4 (determines background color)
 * @param {string} color — override color
 * @param {string} tierLabel — e.g. "Tier 1 — Impact"
 * @param {string} code — e.g. "OC-1"
 * @param {string} title — main title
 * @param {React.ReactNode} stats — bottom bar content
 * @param {React.ReactNode} children — extra content in body
 */
export default function HeroBanner({ tier, color, tierLabel, code, title, stats, children }) {
  const bg = color || TIER_COLORS[tier] || COLORS.AU_GREEN_DARK;

  return (
    <div style={{ backgroundColor: bg }} className="text-white">
      <div className="px-6 py-5">
        <div className="flex items-center gap-3 mb-2">
          {tierLabel && (
            <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
              {tierLabel}
            </span>
          )}
          {code && (
            <span className="text-[11px] font-mono text-white/70">{code}</span>
          )}
        </div>
        {title && (
          <h1 className="text-[18px] font-semibold leading-snug max-w-3xl">{title}</h1>
        )}
        {children}
      </div>
      {stats && (
        <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70">
          {stats}
        </div>
      )}
    </div>
  );
}
