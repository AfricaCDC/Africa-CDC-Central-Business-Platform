import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useStrategicPlan } from '@/hooks/useMiscQueries';
import { Loader2, Target, Shield } from 'lucide-react';

const BREADCRUMBS = [{ label: 'Reference' }, { label: 'Strategic Plan' }];

// `strategic_plan.sp_type` values. The plan items are not linked to the
// outcome areas of a year: their codes follow another numbering (D-20261106-13).
const SECTIONS = [
  { type: 'priority', title: 'Strategic Priorities', icon: Target, color: '#2563EB' },
  { type: 'enabler', title: 'Strategic Enablers', icon: Shield, color: '#059669' },
];

function Section({ title, icon, color, items }) {
  return (
    <div className="bg-white border border-gray-200 border-t-0">
      <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
        {React.createElement(icon, { className: 'w-4 h-4', style: { color } })}
        <h3 className="text-[13px] font-semibold text-gray-800">{title}</h3>
        <span className="text-[11px] text-gray-400 ml-1">({items.length})</span>
      </div>
      <div className="divide-y divide-gray-100">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3 px-5 py-3.5">
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 flex-shrink-0 mt-0.5 text-white" style={{ backgroundColor: color }}>{item.sp_code}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-gray-900">{item.short_name}</div>
              <div className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{item.full_goal}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Reference page of the Africa CDC Strategic Plan 2023-2027: its priorities
 * and enablers.
 *
 * @returns {JSX.Element}
 */
export default function StrategicPlanPage() {
  const { data: items = [], isLoading, isError, refetch } = useStrategicPlan();

  let body;
  if (isLoading) body = <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" /></div>;
  else if (isError) {
    body = (
      <div className="bg-white border border-gray-200 px-5 py-6 text-[12px] text-gray-700">
        The Strategic Plan could not be loaded. <button type="button" onClick={() => refetch()} className="text-[#1A5632] underline">Try again</button>
      </div>
    );
  } else if (!items.length) body = <div className="bg-white border border-gray-200 px-5 py-6 text-[12px] text-gray-500">No Strategic Plan items are configured.</div>;
  else body = SECTIONS.map((s) => <Section key={s.type} {...s} items={items.filter((i) => i.sp_type === s.type)} />);

  return (
    <DashboardLayout breadcrumbs={BREADCRUMBS}>
      <div className="bg-[#1A5632] text-white px-6 py-5">
        <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">2023-2027</span>
        <h1 className="text-[20px] font-semibold mt-2">Africa CDC Strategic Plan</h1>
        <p className="text-[12px] text-white/60 mt-1">New Public Health Order for Africa: Priorities and Enablers</p>
      </div>
      {body}
    </DashboardLayout>
  );
}
