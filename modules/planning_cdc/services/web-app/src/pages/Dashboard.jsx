/* eslint-disable complexity, no-unused-vars --
 * Legacy file with baseline debt from pre-guardrails era. Scheduled refactor:
 * T-42..T-49 (TanStack Query + page split). Do NOT add new violations; this pragma is a ceiling.
 * (Activity progress comes from the activity reports since D-20261015-04;
 *  the old approval-status counter is gone.)
 */
import React from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useFullPlanData } from '@/hooks/usePlanNodeQueries';
import { Loader2, AlertTriangle, ArrowRight, DollarSign } from 'lucide-react';
import { fmtBudgetCompact as fmt } from '@rbm/lib/formatters';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import BudgetExecutionWidget from '@/components/budget-execution/BudgetExecutionWidget';
import { PROGRESS_STATES } from '@/components/dashboard/ActivityProgressStrip';
import { useActivityProgress } from '@/hooks/useDashboardQueries';

const pct = (a,b) => b ? Math.round((Number(a)/Number(b))*100) : 0;

function KPI({ label, value, sub, alert, link }) {
  const Tag = link ? Link : 'div';
  return (
    <Tag to={link} className={`px-4 py-3.5 ${link ? 'cursor-pointer hover:bg-gray-50' : ''} transition-colors`}>
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-[24px] font-bold leading-none ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</div>
      <div className={`text-[10px] mt-1 ${alert ? 'text-red-500 font-medium' : 'text-gray-500'}`}>{sub}</div>
    </Tag>
  );
}

function Bar({ label, value, max, pctLabel, color = '#348F41', link }) {
  const w = max > 0 ? Math.max(3, (Number(value) / max) * 100) : 0;
  const inner = (
    <div className="flex items-center gap-2 px-4 py-1.5 hover:bg-gray-50 border-b border-gray-50 group">
      <span className="text-[10px] text-gray-700 w-[110px] truncate flex-shrink-0" title={label}>{label}</span>
      <div className="flex-1 h-[12px] bg-gray-100"><div className="h-full" style={{ width: `${w}%`, backgroundColor: color }} /></div>
      <span className="text-[11px] font-semibold text-gray-900 w-[60px] text-right flex-shrink-0">{fmt(value)}</span>
      {pctLabel !== undefined && <span className="text-[9px] text-gray-400 w-[30px] text-right flex-shrink-0">{pctLabel}%</span>}
      {link && <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-[#1A5632] flex-shrink-0" />}
    </div>
  );
  return link ? <Link to={link}>{inner}</Link> : inner;
}

function AlertRow({ icon: Icon, text, detail, severity = 'warning' }) {
  const colors = { warning: 'text-amber-600 bg-amber-50', danger: 'text-red-600 bg-red-50', info: 'text-blue-600 bg-blue-50' };
  return (
    <div className={`flex items-start gap-2.5 px-4 py-2.5 border-b border-gray-50 ${colors[severity]?.split(' ')[1] || ''}`}>
      <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${colors[severity]?.split(' ')[0] || ''}`} />
      <div>
        <div className={`text-[11px] font-medium ${colors[severity]?.split(' ')[0] || ''}`}>{text}</div>
        {detail && <div className="text-[10px] text-gray-500 mt-0.5">{detail}</div>}
      </div>
    </div>
  );
}

/**
 * Admin/staff landing dashboard. Shows KPI tiles, division breakdown bars and a list
 * of system alerts (overdue items, missing data, etc.) for the current fiscal year.
 *
 * @returns {JSX.Element}
 */
export default function Dashboard() {
  const { planningYear: fiscalYear } = usePlanningYear();
  const { data: raw, isLoading: loading } = useFullPlanData(fiscalYear);
  // Real implementation signal: specific activities with a submitted / approved activity report (D-20261015-04).
  const { data: progress } = useActivityProgress(fiscalYear);

  if (loading) {
    return <DashboardLayout breadcrumbs={[{ label: 'Dashboard' }]}><div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-[#1A5632]" /></div></DashboardLayout>;
  }

  const { impact = null, t1 = [], areas = [], t2 = [], t3 = [], t4 = [], broads = [], specifics = [] } = raw || {};

  // Budget aggregates from impact
  const totalBudget = Number(impact?.budget_total_2026 || 0);
  const mainBudgetVal = Number(impact?.budget_main || 0);
  const taBudget = Number(impact?.budget_tech_assistance || 0);
  const taPct = totalBudget > 0 ? Math.round(taBudget / totalBudget * 100) : 0;
  const mainPct = 100 - taPct;

  const totalActivities = broads.length;
  const totalTasks = specifics.length;
  const totalIndicators = t1.length + t2.length + t3.length + t4.length;

  const topOutcomes = [...areas]
    .sort((a, b) => Number(b.budget_total_2026 || 0) - Number(a.budget_total_2026 || 0))
    .slice(0, 8);
  const maxOutcomeBudget = Math.max(...topOutcomes.map(o => Number(o.budget_total_2026 || 0)), 1);
  const topOutcomePct = topOutcomes.length > 0 ? pct(topOutcomes[0].budget_total_2026, totalBudget) : 0;

  // By division (from broads + specifics)
  const byDivMap = {};
  broads.forEach(b => {
    if (!b.responsible_division_code) return;
    const k = b.responsible_division_code;
    if (!byDivMap[k]) byDivMap[k] = { code: k, name: b.division?.name || k, activity_count: 0, budget: 0 };
    byDivMap[k].activity_count++;
    byDivMap[k].budget += Number(b.budget_total_2026 || 0);
  });
  const byDiv = Object.values(byDivMap).sort((a, b) => b.budget - a.budget);
  const maxDivBudget = Math.max(...byDiv.map(x => x.budget), 1);

  const reportedPct = progress?.reported_pct ?? 0;
  const reportedCount = progress ? progress.approved + progress.in_review : 0;

  // Recent activities (sort by id desc as proxy for created)
  const recentActivities = [...broads]
    .sort((a, b) => b.id - a.id)
    .slice(0, 6);

  const byTier = [
    { tier_id: 1, count: t1.length },
    { tier_id: 2, count: t2.length },
    { tier_id: 3, count: t3.length },
    { tier_id: 4, count: t4.length },
  ];

  const alerts = [];
  if (progress?.total && progress.not_reported > 0) {
    alerts.push({
      icon: AlertTriangle,
      text: `${progress.not_reported} of ${progress.total} specific activities have no activity report yet`,
      detail: `${reportedCount} reported (${reportedPct}%) — ${progress.approved} approved, ${progress.in_review} in review, ${progress.draft} in draft`,
      severity: reportedPct < 25 ? 'danger' : 'info',
    });
  }
  if (topOutcomePct > 30) {
    alerts.push({ icon: DollarSign, text: `${topOutcomes[0]?.code} absorbs ${topOutcomePct}% of total budget`, detail: `${fmt(topOutcomes[0]?.budget_total_2026)} — high concentration risk`, severity: 'info' });
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Dashboard' }]}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#1A5632] text-white">
          <div className="px-6 py-5">
            <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">FY {fiscalYear}</span>
            <h1 className="text-[20px] font-semibold mt-2">Africa CDC — RBM Dashboard</h1>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70 flex-wrap">
            <span><strong className="text-white">{totalActivities}</strong> Broad Activities</span>
            <span><strong className="text-white">{totalTasks}</strong> Specific Activities</span>
            <span><strong className="text-white">{areas.length}</strong> Outcomes</span>
            <span><strong className="text-white">{totalIndicators}</strong> Indicators</span>
            <span className="ml-auto text-white font-semibold">{fmt(totalBudget)}</span>
          </div>
        </div>

        {/* KPI Row 1: Budget */}
        <div className="grid grid-cols-2 lg:grid-cols-6 border border-gray-200 border-t-0 divide-x divide-gray-200">
          <KPI label="Total Budget" value={fmt(totalBudget)} sub={`${areas.length} outcomes`} link="/budget" />
          <KPI label="Main Budget" value={fmt(mainBudgetVal)} sub={`${mainPct}% of total`} />
          <KPI label="Technical Assistance" value={fmt(taBudget)} sub={`${taPct}% of total`} />
          <KPI label="2027 Forecast" value={fmt(impact?.budget_2027)} sub="next year" />
          <KPI label="2028 Forecast" value={fmt(impact?.budget_2028)} sub="year +2" />
          <KPI label="Indicators" value={totalIndicators} sub={`${t1.length}T1·${t2.length}T2·${t3.length}T3·${t4.length}T4`} link="/short-term-outcome" />
        </div>

        {/* Budget execution (D-20261015-04) */}
        <BudgetExecutionWidget fiscalYear={fiscalYear} />

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="border border-gray-200 border-t-0">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <h3 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Operational Alerts</h3>
            </div>
            {alerts.map((a) => <AlertRow key={a.text} {...a} />)}
          </div>
        )}

        {/* Row 2: Budget by Outcome + TA Split + Activity Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 border border-gray-200 border-t-0 divide-x divide-gray-200">

          {/* Budget by Outcome */}
          <div>
            <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold text-gray-800">Budget by Outcome</h3>
              <Link to="/outcome" className="text-[10px] text-[#1A5632] hover:underline font-medium">View all</Link>
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              {topOutcomes.map(o => (
                <Bar key={o.id} label={o.code} value={o.budget_total_2026} max={maxOutcomeBudget} pctLabel={pct(o.budget_total_2026, totalBudget)} color="#1A5632" link={`/plan/node/${o.id}`} />
              ))}
            </div>
          </div>

          {/* Budget Split */}
          <div>
            <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold text-gray-800">Budget Composition</h3>
              <Link to="/budget" className="text-[10px] text-[#1A5632] hover:underline font-medium">Overview</Link>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-gray-600">Main Budget</span>
                  <span className="text-[11px] font-semibold text-[#1A5632]">{fmt(mainBudgetVal)}</span>
                </div>
                <div className="h-[8px] bg-gray-100"><div className="h-full bg-[#1A5632]" style={{ width: `${mainPct}%` }} /></div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-gray-600">Technical Assistance</span>
                  <span className="text-[11px] font-semibold text-[#E8A838]">{fmt(taBudget)}</span>
                </div>
                <div className="h-[8px] bg-gray-100"><div className="h-full bg-[#E8A838]" style={{ width: `${taPct}%` }} /></div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-gray-600">Pass Through</span>
                  <span className="text-[11px] font-semibold text-gray-700">{fmt(impact?.budget_pass_through)}</span>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-gray-600">Special Projects</span>
                  <span className="text-[11px] font-semibold text-gray-700">{fmt(impact?.budget_special_projects)}</span>
                </div>
              </div>
            </div>
            <div className="px-4 py-2.5 border-t border-gray-200 bg-gray-50">
              <div className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5">Multi-Year Forecast</div>
              <div className="flex h-[14px] bg-gray-100 overflow-hidden">
                <div className="h-full bg-[#1A5632]" title={`${fiscalYear}: ${fmt(totalBudget)}`} style={{ width: `${pct(totalBudget, totalBudget + Number(impact?.budget_2027 || 0) + Number(impact?.budget_2028 || 0))}%` }} />
                <div className="h-full bg-[#9F2241]" title={`+1: ${fmt(impact?.budget_2027)}`} style={{ width: `${pct(impact?.budget_2027, totalBudget + Number(impact?.budget_2027 || 0) + Number(impact?.budget_2028 || 0))}%` }} />
                <div className="h-full bg-[#E8A838]" title={`+2: ${fmt(impact?.budget_2028)}`} style={{ width: `${pct(impact?.budget_2028, totalBudget + Number(impact?.budget_2027 || 0) + Number(impact?.budget_2028 || 0))}%` }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-[#1A5632] font-medium">{fiscalYear}</span>
                <span className="text-[9px] text-[#9F2241] font-medium">{parseInt(fiscalYear)+1}</span>
                <span className="text-[9px] text-[#E8A838] font-medium">{parseInt(fiscalYear)+2}</span>
              </div>
            </div>
          </div>

          {/* Activity Status + Indicators */}
          <div>
            <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold text-gray-800">Execution Status</h3>
              <Link to="/workplan" className="text-[10px] text-[#1A5632] hover:underline font-medium">Workplan</Link>
            </div>
            <div className="px-4 py-3">
              <div className="flex items-center gap-4 mb-3">
                <div className="relative w-[60px] h-[60px]">
                  <svg viewBox="0 0 36 36" className="w-full h-full">
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#E5E7EB" strokeWidth="3" />
                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none" stroke={reportedPct >= 50 ? '#059669' : reportedPct > 0 ? '#E8A838' : '#EF4444'} strokeWidth="3"
                      strokeDasharray={`${reportedPct}, 100`} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[13px] font-bold text-gray-900">{reportedPct}%</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-gray-900">Activities reported</div>
                  <div className="text-[10px] text-gray-500">{reportedCount} of {progress?.total ?? totalTasks} specific activities</div>
                  <div className="text-[10px] text-gray-500">from the activity reports</div>
                </div>
              </div>
              {PROGRESS_STATES.map(s => (
                <div key={s.key} className="flex items-center gap-2 py-1">
                  <div className={`w-2 h-2 flex-shrink-0 ${s.color}`} />
                  <span className="text-[10px] text-gray-600 flex-1">{s.label}</span>
                  <span className="text-[11px] font-bold text-gray-900 w-[28px] text-right">{progress?.[s.key] ?? 0}</span>
                  <span className="text-[9px] text-gray-400 w-[28px] text-right">{pct(progress?.[s.key] ?? 0, progress?.total)}%</span>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-gray-500 uppercase">Indicators by Tier</span>
                <Link to="/short-term-outcome" className="text-[9px] text-[#1A5632] hover:underline font-medium">View</Link>
              </div>
              <div className="flex gap-2 flex-wrap">
                {byTier.map(t => {
                  const c = { 1: '#9F2241', 2: '#1A5632', 3: '#14442A', 4: '#D97706' };
                  return (
                    <div key={t.tier_id} className="flex items-center gap-1">
                      <span className="text-[8px] font-bold text-white px-1 py-0.5" style={{ backgroundColor: c[t.tier_id] }}>T{t.tier_id}</span>
                      <span className="text-[11px] font-bold text-gray-800">{t.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Division Workload + Recent Activities */}
        <div className="grid grid-cols-1 lg:grid-cols-2 border border-gray-200 border-t-0 divide-x divide-gray-200">

          {/* Division Budget vs Activities */}
          <div>
            <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold text-gray-800">Division Workload</h3>
              <Link to="/activities" className="text-[10px] text-[#1A5632] hover:underline font-medium">All activities</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] text-gray-400 uppercase bg-gray-50">
                    <th className="px-3 py-1.5 font-semibold">Division</th>
                    <th className="px-3 py-1.5 font-semibold text-center w-[40px]">Act.</th>
                    <th className="px-3 py-1.5 font-semibold text-right w-[65px]">Budget</th>
                    <th className="px-3 py-1.5 font-semibold text-right w-[55px]">$/Act.</th>
                  </tr>
                </thead>
                <tbody>
                  {byDiv.slice(0, 10).map((div, i) => {
                    const budgetPerAct = div.activity_count > 0 ? div.budget / div.activity_count : 0;
                    const isHigh = budgetPerAct > 5000000;
                    return (
                      <tr key={div.code} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                        <td className="px-3 py-1.5 text-[10px] text-gray-700 truncate" style={{ maxWidth: 150 }} title={div.name}>{div.name}</td>
                        <td className="px-3 py-1.5 text-[11px] text-gray-800 text-center font-semibold">{div.activity_count}</td>
                        <td className="px-3 py-1.5 text-[10px] text-gray-700 text-right">{fmt(div.budget)}</td>
                        <td className={`px-3 py-1.5 text-[10px] text-right font-medium ${isHigh ? 'text-amber-600' : 'text-gray-500'}`}>{fmt(budgetPerAct)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Activities */}
          <div>
            <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold text-gray-800">Recent Activities</h3>
              <Link to="/activities" className="text-[10px] text-[#1A5632] hover:underline font-medium">View all</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {recentActivities.map(a => (
                <Link key={a.id} to={`/plan/node/${a.id}`} className="block px-4 py-2 hover:bg-gray-50 group">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[#B45309] font-semibold flex-shrink-0 w-[60px]">{a.code}</span>
                    <span className="text-[11px] text-gray-700 truncate flex-1">{a.title}</span>
                    <span className="text-[10px] text-gray-500 flex-shrink-0">{fmt(a.budget_total_2026)}</span>
                    <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-[#1A5632] flex-shrink-0" />
                  </div>
                  <div className="text-[9px] text-gray-400 mt-0.5 ml-[68px]">{a.division?.name || ''}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
