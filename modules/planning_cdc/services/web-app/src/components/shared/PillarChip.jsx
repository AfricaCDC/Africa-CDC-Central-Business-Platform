/**
 * AHSS pillar chip (D-20260714-03) — compact label everywhere an indicator
 * appears. Long pillar names ("Pillar 2_Institutionalised continental PPPR
 * agenda") display their short prefix ("Pillar 2"); the full name lives in
 * the tooltip. Flat design, no rounding (CLAUDE.md design rules).
 *
 * @param {{ name?: string|null, className?: string }} props
 * @returns {JSX.Element|null} null when no pillar is assigned
 * @example <PillarChip name={indicator.pillar?.name} />
 */
export default function PillarChip({ name, className = '' }) {
  if (!name) return null;
  const short = name.includes('_') ? name.split('_')[0] : name;
  return (
    <span
      title={name}
      className={`inline-block px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 ${className}`}
    >
      {short}
    </span>
  );
}
