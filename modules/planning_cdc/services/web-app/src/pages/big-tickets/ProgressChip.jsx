import { BIG_TICKET_PROGRESS_CONFIG } from './config';

/**
 * Progress status chip of a Big Ticket (On track, Achieved, At risk...).
 *
 * @param {{ status?: string|null }} props
 * @returns {JSX.Element}
 * @example <ProgressChip status="ON_TRACK" />
 */
export default function ProgressChip({ status }) {
  const cfg = BIG_TICKET_PROGRESS_CONFIG[status];
  if (!cfg) return <span className="text-[10px] text-gray-400">Not reported</span>;
  return <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>;
}

/**
 * Horizontal performance bar with its percentage (capped at 100% wide).
 *
 * @param {{ value?: number|null, status?: string|null }} props
 * @returns {JSX.Element}
 * @example <PerformanceBar value={82} status="ON_TRACK" />
 */
export function PerformanceBar({ value, status }) {
  const has = value !== null && value !== undefined;
  const bar = BIG_TICKET_PROGRESS_CONFIG[status]?.bar || 'bg-gray-400';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 bg-gray-100" aria-hidden="true">
        {has && <div className={`h-1.5 ${bar}`} style={{ width: `${Math.min(Number(value), 100)}%` }} />}
      </div>
      <span className="w-10 text-right text-[11px] tabular-nums text-gray-700">{has ? `${Math.round(value)}%` : '—'}</span>
    </div>
  );
}
