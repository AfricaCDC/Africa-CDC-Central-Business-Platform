import React, { useState, useMemo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useFullPlanData } from '@/hooks/usePlanNodeQueries';
import { ChevronDown, ChevronRight, Target } from 'lucide-react';
import { fmtBudgetCompact } from '@rbm/lib/formatters';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CURRENT_MONTH = new Date().getMonth();

// Local: returns '' on empty values and strips the leading `$` for the
// gantt cells (which add their own currency styling in CSS).
const fmt = (n) => {
  const formatted = fmtBudgetCompact(n, '');
  return formatted ? formatted.replace(/^\$/, '') : '';
};

const fmtFull = (n) => {
  if (!n || n === 0) return '-';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
};

function monthSpan(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const s = new Date(startDate);
  const e = new Date(endDate);
  const months = [];
  for (let m = s.getMonth(); m <= e.getMonth(); m++) months.push(m);
  return months;
}

/* ── Reusable cells ─────────────────────────────────── */

function TimelineCells({ startDate, endDate, color = '#348F41', height = 8 }) {
  const active = monthSpan(startDate, endDate);
  return MONTHS.map((m, i) => (
    <td key={m} className="p-0">
      {active.includes(i) && (
        <div style={{ height, backgroundColor: color }} />
      )}
    </td>
  ));
}

function EmptyTimeline({ bg = 'transparent' }) {
  return MONTHS.map((m) => <td key={m} className="p-0" style={{ backgroundColor: bg }} />);
}

function BudgetCells({ q1, q2, q3, q4, total, bold, bg }) {
  const cls = `px-1 text-right text-[11px] whitespace-nowrap ${bold ? 'font-bold text-gray-900' : 'text-gray-600'}`;
  const style = bg ? { backgroundColor: bg } : {};
  return (
    <>
      <td className={cls} style={style}>{fmt(q1)}</td>
      <td className={cls} style={style}>{fmt(q2)}</td>
      <td className={cls} style={style}>{fmt(q3)}</td>
      <td className={cls} style={style}>{fmt(q4)}</td>
      <td className={`${cls} font-semibold`} style={style}>{fmtFull(total)}</td>
    </>
  );
}

/* ── Row components ─────────────────────────────────── */

function TaskRow({ task }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/50">
      <td className="py-1 px-2 sticky left-0 bg-white z-10">
        <div className="pl-14 flex items-center gap-1.5 overflow-hidden">
          <div className="w-1 h-1 bg-gray-300 flex-shrink-0" />
          <span className="text-[11px] text-gray-500 truncate">{task.title}</span>
        </div>
      </td>
      <TimelineCells startDate={task.start_date} endDate={task.end_date} color="#93C5FD" height={4} />
      <td colSpan={5} />
      <td className="px-1 text-[10px] text-gray-400 truncate">{task.responsible_division || ''}</td>
    </tr>
  );
}

function ActivityRow({ activity, showTasks }) {
  const [open, setOpen] = useState(false);
  const hasTasks = activity.tasks?.length > 0;

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-blue-50/30 group">
        <td className="py-1.5 px-2 sticky left-0 bg-white group-hover:bg-blue-50/30 z-10">
          <div className="pl-8 flex items-center gap-1.5 overflow-hidden">
            {hasTasks && showTasks ? (
              <button onClick={() => setOpen(!open)} className="p-0.5 hover:bg-gray-100 flex-shrink-0">
                {open ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
              </button>
            ) : <span className="w-4 flex-shrink-0" />}
            <span className="text-[11px] font-medium text-blue-700 flex-shrink-0">{activity.code}</span>
            <span className="text-[12px] text-gray-700 truncate">{activity.title}</span>
            {hasTasks && <span className="text-[10px] text-gray-400 flex-shrink-0">({activity.tasks_count})</span>}
          </div>
        </td>
        <TimelineCells startDate={activity.start_date} endDate={activity.end_date} color="#348F41" height={7} />
        <BudgetCells q1={activity.budget_q1} q2={activity.budget_q2} q3={activity.budget_q3} q4={activity.budget_q4} total={activity.budget_total} />
        <td className="px-1 text-[11px] text-gray-500 truncate">{activity.responsible_division || ''}</td>
      </tr>
      {open && showTasks && activity.tasks.map(t => <TaskRow key={t.id} task={t} />)}
    </>
  );
}

function OutputRow({ output, showTasks }) {
  const [open, setOpen] = useState(true);
  const bg = '#F0FAF3';

  return (
    <>
      <tr className="border-b border-gray-200" style={{ backgroundColor: bg }}>
        <td className="py-2 px-2 sticky left-0 z-10" style={{ backgroundColor: bg }}>
          <div className="pl-3 flex items-center gap-1.5 overflow-hidden">
            <button onClick={() => setOpen(!open)} className="p-0.5 hover:bg-green-100 flex-shrink-0">
              {open ? <ChevronDown className="w-3.5 h-3.5 text-[#1A5632]" /> : <ChevronRight className="w-3.5 h-3.5 text-[#1A5632]" />}
            </button>
            <span className="text-[11px] font-bold text-[#1A5632] flex-shrink-0">{output.code}</span>
            <span className="text-[12px] font-semibold text-[#1A5632] truncate">{output.name}</span>
          </div>
        </td>
        <EmptyTimeline bg={bg} />
        <BudgetCells q1={output.budget_q1} q2={output.budget_q2} q3={output.budget_q3} q4={output.budget_q4} total={output.budget_total} bold bg={bg} />
        <td className="px-1 text-[11px] font-medium text-[#1A5632] truncate" style={{ backgroundColor: bg }}>
          {output.activities?.[0]?.responsible_division || ''}
        </td>
      </tr>
      {/* T2 indicators */}
      {open && output.indicators?.length > 0 && (
        <tr className="border-b border-gray-100 bg-emerald-50/40">
          <td colSpan={19} className="py-1 px-2">
            <div className="pl-8 flex flex-wrap gap-x-5 gap-y-0.5">
              {output.indicators.map(ind => (
                <span key={ind.id} className="text-[10px] text-emerald-700">
                  <span className="font-semibold">{ind.indicator_code}</span>
                  {' '}{ind.indicator_name?.substring(0, 55)}{ind.indicator_name?.length > 55 ? '…' : ''}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
      {open && output.activities?.map(a => <ActivityRow key={a.id} activity={a} showTasks={showTasks} />)}
    </>
  );
}

function IndicatorSection({ indicator, showTasks }) {
  const [open, setOpen] = useState(true);
  const tQ1 = indicator.outputs.reduce((s, o) => s + (o.budget_q1 || 0), 0);
  const tQ2 = indicator.outputs.reduce((s, o) => s + (o.budget_q2 || 0), 0);
  const tQ3 = indicator.outputs.reduce((s, o) => s + (o.budget_q3 || 0), 0);
  const tQ4 = indicator.outputs.reduce((s, o) => s + (o.budget_q4 || 0), 0);
  const tBudget = indicator.outputs.reduce((s, o) => s + Number(o.budget_total || 0), 0);
  const bg = '#FEFCE8';

  return (
    <>
      <tr className="border-b-2 border-[#B4A269]/30" style={{ backgroundColor: bg }}>
        <td className="py-2 px-2 sticky left-0 z-10" style={{ backgroundColor: bg }}>
          <div className="flex items-center gap-1.5 overflow-hidden">
            <button onClick={() => setOpen(!open)} className="p-0.5 hover:bg-yellow-100 flex-shrink-0">
              {open ? <ChevronDown className="w-3.5 h-3.5 text-[#9F2241]" /> : <ChevronRight className="w-3.5 h-3.5 text-[#9F2241]" />}
            </button>
            <span className="text-[10px] font-bold text-white bg-[#9F2241] px-1.5 py-0.5 flex-shrink-0">T1</span>
            <span className="text-[11px] font-bold text-[#9F2241] flex-shrink-0">{indicator.indicator_code}</span>
            <span className="text-[12px] font-semibold text-gray-800 truncate">{indicator.indicator_name}</span>
          </div>
        </td>
        <EmptyTimeline bg={bg} />
        <BudgetCells q1={tQ1} q2={tQ2} q3={tQ3} q4={tQ4} total={tBudget} bold bg={bg} />
        <td style={{ backgroundColor: bg }} />
      </tr>
      {open && indicator.outputs.map(o => <OutputRow key={o.id} output={o} showTasks={showTasks} />)}
    </>
  );
}

/* ── Main page ──────────────────────────────────────── */

export default function GanttWorkplan() {
  const [projects] = useState([{ id: 1, name: 'Africa CDC Annual Workplan' }]);
  const [selectedProject, setSelectedProject] = useState(1);
  const [showTasks, setShowTasks] = useState(false);
  const { planningYear: fiscalYear } = usePlanningYear();
  const { data: raw, isLoading: loading } = useFullPlanData(fiscalYear);

  const data = useMemo(() => {
    if (!raw) return null;
    const { impact, t1, areas, t2, t3, t4, broads, specifics } = raw;

    const allInds = [...t2, ...t3, ...t4];
    const indToArea = {};
    allInds.forEach(i => { indToArea[i.id] = i.parent_id; });

    const tasksByBroad = {};
    specifics.forEach(s => {
      if (!tasksByBroad[s.parent_id]) tasksByBroad[s.parent_id] = [];
      tasksByBroad[s.parent_id].push({
        ...s,
        budget_total: s.budget_total_2026,
        budget_q1: s.q1_budget || 0,
        budget_q2: s.q2_budget || 0,
        budget_q3: s.q3_budget || 0,
        budget_q4: s.q4_budget || 0,
        responsible_division: s.division?.name || s.responsible_division_code,
      });
    });

    const outcomeNode = {
      id: impact?.id || 0,
      code: 'OC',
      name: impact?.title || 'Programme Outcome',
      budget_q1: 0, budget_q2: 0, budget_q3: 0, budget_q4: 0,
      budget_total: Number(impact?.budget_total_2026 || 0),
      indicators: t1
        .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }))
        .map(ti => {
          const outputs = areas
            .filter(a => a.parent_id === ti.id)
            .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }))
            .map(area => {
              const acts = broads
                .filter(b => indToArea[b.parent_id] === area.id)
                .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }))
                .map(b => ({
                  ...b,
                  budget_total: b.budget_total_2026,
                  budget_q1: b.q1_budget || 0,
                  budget_q2: b.q2_budget || 0,
                  budget_q3: b.q3_budget || 0,
                  budget_q4: b.q4_budget || 0,
                  responsible_division: b.division?.name || b.responsible_division_code,
                  tasks: tasksByBroad[b.id] || [],
                }));
              const t2InArea = t2.filter(i => i.parent_id === area.id).map(i => ({
                ...i,
                indicator_code: i.code,
                indicator_name: i.title,
              }));
              const total = acts.reduce((s, a) => s + Number(a.budget_total || 0), 0);
              const q1t = acts.reduce((s, a) => s + Number(a.budget_q1 || 0), 0);
              const q2t = acts.reduce((s, a) => s + Number(a.budget_q2 || 0), 0);
              const q3t = acts.reduce((s, a) => s + Number(a.budget_q3 || 0), 0);
              const q4t = acts.reduce((s, a) => s + Number(a.budget_q4 || 0), 0);
              return {
                id: area.id, code: area.code, name: area.title,
                budget_total: total, budget_q1: q1t, budget_q2: q2t, budget_q3: q3t, budget_q4: q4t,
                activities: acts, indicators: t2InArea,
              };
            });
          return { id: ti.id, indicator_code: ti.code, indicator_name: ti.title, outputs };
        }),
    };

    return {
      outcomes: [outcomeNode],
      summary: {
        total_outputs: areas.length,
        total_activities: broads.length,
        total_tasks: specifics.length,
        total_budget: Number(impact?.budget_total_2026 || 0),
      },
    };
  }, [raw]);

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <div>
            <h1 className="text-[20px] font-bold text-gray-900">Work Plan — Gantt Chart</h1>
            <p className="text-[12px] text-gray-500 mt-0.5">
              {data ? `${data.summary.total_outputs} Outcomes · ${data.summary.total_activities} Activities · ${data.summary.total_tasks} Tasks · Budget: $${fmtFull(data.summary.total_budget)}` : 'Loading...'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {projects.length > 1 && (
              <select
                value={selectedProject || ''}
                onChange={(e) => setSelectedProject(Number(e.target.value))}
                className="text-[12px] border border-gray-200 px-3 py-1.5 bg-white text-gray-700"
              >
                {projects.map(p => <option key={p.id} value={p.id}>{p.name || p.code}</option>)}
              </select>
            )}
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer">
              <input type="checkbox" checked={showTasks} onChange={e => setShowTasks(e.target.checked)} className="accent-[#348F41]" />
              Show tasks
            </label>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-[#348F41] animate-spin" style={{ borderRadius: '50%' }} />
          </div>
        ) : !data ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-[13px]">No data available</div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="border-collapse text-[12px]" style={{ tableLayout: 'fixed', width: 1560 }}>
              <colgroup>
                <col style={{ width: 380 }} />
                {MONTHS.map((m) => <col key={m} style={{ width: 44 }} />)}
                <col style={{ width: 62 }} />
                <col style={{ width: 62 }} />
                <col style={{ width: 62 }} />
                <col style={{ width: 62 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 150 }} />
              </colgroup>
              <thead className="sticky top-0 z-20">
                {/* Row 1: group headers */}
                <tr className="bg-[#143D26] text-white">
                  <th rowSpan={2} className="text-left px-2 py-2 font-semibold text-[11px] sticky left-0 bg-[#143D26] z-30 border-r border-white/10">
                    Output / Activity / Task
                  </th>
                  <th colSpan={12} className="text-center py-1.5 font-semibold text-[10px] border-b border-white/10 border-r border-white/10">
                    Implementation Timeline
                  </th>
                  <th colSpan={5} className="text-center py-1.5 font-semibold text-[10px] border-b border-white/10 border-r border-white/10">
                    Quarterly Expenditure ($)
                  </th>
                  <th rowSpan={2} className="text-left px-1 py-2 font-semibold text-[10px]">Responsible</th>
                </tr>
                {/* Row 2: month + quarter headers */}
                <tr className="bg-[#1A5632] text-white">
                  {MONTHS.map((m, i) => (
                    <th
                      key={m}
                      className={`text-center py-1.5 font-medium text-[10px] ${i === CURRENT_MONTH ? 'bg-[#B4A269]' : ''} ${i === 11 ? 'border-r border-white/10' : ''}`}
                    >
                      {m}
                    </th>
                  ))}
                  <th className="text-right px-1 py-1.5 font-semibold text-[10px]">Q1</th>
                  <th className="text-right px-1 py-1.5 font-semibold text-[10px]">Q2</th>
                  <th className="text-right px-1 py-1.5 font-semibold text-[10px]">Q3</th>
                  <th className="text-right px-1 py-1.5 font-semibold text-[10px]">Q4</th>
                  <th className="text-right px-1 py-1.5 font-semibold text-[10px] border-r border-white/10">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.outcomes.map(oc => {
                  const ocBg = 'rgba(159,34,65,0.08)';
                  return (
                    <React.Fragment key={oc.id}>
                      {/* Outcome row */}
                      <tr className="border-b-2 border-[#9F2241]/20" style={{ backgroundColor: ocBg }}>
                        <td className="py-2.5 px-2 sticky left-0 z-10" style={{ backgroundColor: ocBg }}>
                          <div className="flex items-center gap-2 overflow-hidden">
                            <Target className="w-4 h-4 text-[#9F2241] flex-shrink-0" />
                            <span className="text-[12px] font-bold text-[#9F2241] flex-shrink-0">{oc.code}</span>
                            <span className="text-[12px] font-semibold text-gray-800 truncate">{oc.name}</span>
                          </div>
                        </td>
                        <EmptyTimeline bg={ocBg} />
                        <BudgetCells q1={oc.budget_q1} q2={oc.budget_q2} q3={oc.budget_q3} q4={oc.budget_q4} total={oc.budget_total} bold bg={ocBg} />
                        <td style={{ backgroundColor: ocBg }} />
                      </tr>
                      {oc.indicators.map(ind => (
                        <IndicatorSection key={ind.id} indicator={ind} showTasks={showTasks} />
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
