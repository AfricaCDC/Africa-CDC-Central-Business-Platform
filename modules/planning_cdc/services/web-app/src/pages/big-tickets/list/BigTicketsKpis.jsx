import { BIG_TICKET_PROGRESS } from '../config';

const average = (nums) => (nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null);

function Kpi({ label, value, sub, tone = 'text-gray-900' }) {
  return (
    <div className="border border-gray-200 bg-white px-4 py-3">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className={`mt-1 text-[20px] font-semibold ${tone}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-500">{sub}</div>}
    </div>
  );
}

/**
 * Headline numbers of the list: tickets, status split, average performance,
 * reports of the quarter.
 *
 * @param {{ items: object[], quarter: string }} props
 * @returns {JSX.Element}
 * @example <BigTicketsKpis items={data.items} quarter="Q2" />
 */
export default function BigTicketsKpis({ items, quarter }) {
  const count = (s) => items.filter((t) => t.report?.progress_status === s).length;
  const reported = items.filter((t) => t.report).length;
  const perf = average(items.map((t) => t.report?.performance_pct).filter((v) => v !== null && v !== undefined));
  const lines = items.reduce((n, t) => n + t.line_count, 0);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Kpi label="Big Tickets" value={items.length} sub={`${lines} indicator lines`} />
      <Kpi label="On track" value={count(BIG_TICKET_PROGRESS.ON_TRACK)} tone="text-blue-700" />
      <Kpi label="Achieved" value={count(BIG_TICKET_PROGRESS.ACHIEVED)} tone="text-[#1A5632]" />
      <Kpi label="At risk / off track" value={count(BIG_TICKET_PROGRESS.AT_RISK) + count(BIG_TICKET_PROGRESS.OFF_TRACK)} tone="text-amber-700" />
      <Kpi label="Avg. performance" value={perf === null ? '—' : `${perf}%`} sub="vs annual target" />
      <Kpi label={`${quarter} reports`} value={`${reported} / ${items.length}`} sub="tickets with a report" />
    </div>
  );
}
