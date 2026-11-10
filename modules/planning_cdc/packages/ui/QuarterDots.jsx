import React from 'react';
import { COLORS } from '@rbm/lib';

/**
 * QuarterDots — renders 4 quarterly indicators (colored dot or dash)
 */
export default function QuarterDots({ q1, q2, q3, q4, color = COLORS.TIER_3 }) {
  const dot = (active) =>
    active
      ? <span className="inline-block w-2.5 h-2.5" style={{ backgroundColor: color }} />
      : <span className="text-[10px] text-gray-300">—</span>;

  return (
    <>
      <td className="px-3 py-3 text-center">{dot(q1)}</td>
      <td className="px-3 py-3 text-center">{dot(q2)}</td>
      <td className="px-3 py-3 text-center">{dot(q3)}</td>
      <td className="px-3 py-3 text-center">{dot(q4)}</td>
    </>
  );
}

/** Standalone version (not table cells) */
export function QuarterDotsInline({ q1, q2, q3, q4, color = COLORS.TIER_3 }) {
  const dot = (active, label) =>
    <span key={label} className="flex items-center gap-1">
      {active
        ? <span className="inline-block w-2 h-2" style={{ backgroundColor: color }} />
        : <span className="inline-block w-2 h-2 bg-gray-200" />}
      <span className="text-[10px] text-gray-400">{label}</span>
    </span>;

  return (
    <div className="flex items-center gap-3">
      {dot(q1, 'Q1')}
      {dot(q2, 'Q2')}
      {dot(q3, 'Q3')}
      {dot(q4, 'Q4')}
    </div>
  );
}
