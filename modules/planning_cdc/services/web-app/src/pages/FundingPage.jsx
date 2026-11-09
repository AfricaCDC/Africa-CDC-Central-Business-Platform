/* eslint-disable complexity --
 * Pre-existing debt: FundingPage branches once per funding source and per
 * filter combination (complexity 20). Splitting it would produce mutually
 * coupled files for no clarity gain. Pragma is a ceiling: do NOT grow it.
 */
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Loader2, DollarSign, Landmark, TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react';
import { useFundingOverview } from '@/hooks/useBudgetQueries';
import { fmtBudget, fmtBudgetCompact } from '@rbm/lib/formatters';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import { useActiveBuCodes } from '@/hooks/useActiveBuCodes';
import { RBAC_MODULES, RBAC_ACTIONS } from '@rbm/lib/rbac';
import { usePermissions } from '@/hooks/usePermissions';

// Local: KPI cards always show '$0' rather than '—' on empty values.
const fmt = (v) => fmtBudget(v, { fallback: '$0' });
const fmtShort = (v) => fmtBudgetCompact(v, '$0');

const pct = (part, total) => {
  if (!total) return 0;
  return Math.round((Number(part) / Number(total)) * 100);
};

function StatCard({ label, value, sub, icon: Icon, color = '#1A5632' }) {
  return (
    <div className="bg-white border border-gray-200 px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="text-[22px] font-bold text-gray-900">{value}</div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function BarRow({ label, value, maxValue, color = '#348F41', count, link }) {
  const w = maxValue > 0 ? Math.max(2, (Number(value) / maxValue) * 100) : 0;
  const content = (
    <div className="flex items-center gap-3 py-2 px-4 hover:bg-gray-50 border-b border-gray-100 group">
      <div className="w-[140px] text-[11px] font-medium text-gray-700 truncate flex-shrink-0" title={label}>{label}</div>
      <div className="flex-1 h-[18px] bg-gray-100 relative">
        <div className="h-full transition-all" style={{ width: `${w}%`, backgroundColor: color }} />
      </div>
      <div className="w-[90px] text-right text-[12px] font-semibold text-gray-900 flex-shrink-0">{fmtShort(value)}</div>
      {count !== undefined && <div className="w-[40px] text-right text-[10px] text-gray-400 flex-shrink-0">{count}</div>}
      {link && <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-[#1A5632] flex-shrink-0" />}
    </div>
  );
  return link ? <Link to={link}>{content}</Link> : content;
}

const CHIP = 'text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5';

// Budget Base is an administrator page: its links follow its route gate (audit_log read).
function FundingHero({ fiscalYear, lineCount, buCount, ipCount }) {
  const { activeDivision } = useActiveDivision();
  const { can } = usePermissions();
  const buName = activeDivision?.division_name || activeDivision?.code;
  return (
    <div className="bg-[#1A5632] text-white">
      <div className="px-6 py-5">
        <div className="flex items-center gap-3 mb-2">
          <span className={CHIP}>FY {fiscalYear}</span>
          {buName && <span className={CHIP}>{buName}</span>}
        </div>
        <h1 className="text-[20px] font-semibold">Budget Overview</h1>
      </div>
      <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70">
        <span><strong className="text-white">{lineCount}</strong> Budget Lines</span>
        <span><strong className="text-white">{buCount}</strong> Business Units</span>
        <span><strong className="text-white">{ipCount}</strong> Funding Sources</span>
        {can(RBAC_MODULES.AUDIT_LOG, RBAC_ACTIONS.READ) && (
          <Link to="/budget-base" className="ml-auto text-[#B4A269] hover:text-white font-medium">Open Budget Base &rarr;</Link>
        )}
      </div>
    </div>
  );
}

/**
 * Funding overview page. Summarises total budget vs. funding gap and lists every
 * funded line by donor for the active fiscal year.
 *
 * @returns {JSX.Element}
 */
export default function FundingPage() {
  const { planningYear: fiscalYear } = usePlanningYear();
  // Aggregates › Budget: the budget codes of the active BU (D-20261105-06).
  const buCodes = useActiveBuCodes(RBAC_MODULES.BUDGET);
  const { can } = usePermissions();
  const isBaseOpen = can(RBAC_MODULES.AUDIT_LOG, RBAC_ACTIONS.READ);
  const { data, isLoading: loading } = useFundingOverview(fiscalYear, buCodes);
  const summary = data || null;
  const lines = data?.codes || [];

  if (loading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Aggregates' }, { label: 'Budget' }]}>
        <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" /></div>
      </DashboardLayout>
    );
  }

  const totals = summary?.totals || {};
  const byBu = summary?.byBu || [];
  const byFund = summary?.byFund || [];
  const maxBu = Math.max(...byBu.map(b => Number(b.total_amount || 0)), 1);
  const topBUs = [...byBu].sort((a, b) => Number(b.total_amount) - Number(a.total_amount)).slice(0, 10);
  const topFunds = [...byFund].filter(f => Number(f.total_amount) > 0).slice(0, 10);

  const ipTotals = {};
  const IP_KEYS = [
    { key: 'ip_world_bank', label: 'World Bank' },
    { key: 'ip_world_diabetic', label: 'World Diabetic Foundation' },
    { key: 'ip_korea_fund', label: 'Korea Fund' },
    { key: 'ip_sbtf', label: 'SBTF' },
    { key: 'ip_member_states', label: 'Member States' },
    { key: 'ip_mastercard', label: 'MasterCard' },
    { key: 'ip_gavi', label: 'GAVI' },
    { key: 'ip_afdb', label: 'AfDB' },
    { key: 'ip_cepi', label: 'CEPI' },
    { key: 'ip_eu_hera', label: 'EU HERA' },
    { key: 'ip_fcdo', label: 'FCDO' },
    { key: 'ip_unicef', label: 'UNICEF' },
    { key: 'ip_canada', label: 'Canada' },
    { key: 'ip_welcome_trust', label: 'Wellcome Trust' },
    { key: 'ip_korea_dca', label: 'Korea DCA' },
    { key: 'ip_team_europe', label: 'Team Europe' },
    { key: 'ip_indirect_cost', label: 'Indirect Cost' },
    { key: 'ip_ecdc', label: 'ECDC' },
  ];
  for (const ip of IP_KEYS) {
    ipTotals[ip.key] = lines.reduce((s, l) => s + Number(l[ip.key] || 0), 0);
  }
  const activeIPs = IP_KEYS.filter(ip => ipTotals[ip.key] > 0).sort((a, b) => ipTotals[b.key] - ipTotals[a.key]);
  const maxIP = Math.max(...activeIPs.map(ip => ipTotals[ip.key]), 1);

  const totalTA = Number(totals.total_ta || 0);
  const totalMain = Number(totals.total_main || 0);
  const totalAmount = Number(totals.total_amount || 0);
  const totalApproved = Number(totals.total_approved || 0);
  const totalGap = Number(totals.total_gap || 0);
  const lineCount = Number(totals.line_count || 0);

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Aggregates' }, { label: 'Budget' }]}>
      <div className="space-y-0">

        <FundingHero fiscalYear={fiscalYear} lineCount={lineCount} buCount={byBu.length} ipCount={activeIPs.length} />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-0 border border-gray-200 border-t-0">
          <StatCard label="Total Budget" value={fmtShort(totalAmount)} sub={`${lineCount} budget lines`} icon={DollarSign} />
          <StatCard label="Main Budget" value={fmtShort(totalMain)} sub={`${pct(totalMain, totalAmount)}% of total`} icon={DollarSign} color="#348F41" />
          <StatCard label="Technical Assistance" value={fmtShort(totalTA)} sub={`${pct(totalTA, totalAmount)}% of total`} icon={TrendingUp} color="#E8A838" />
          <StatCard label="AMERT Approved" value={fmtShort(totalApproved)} sub={`${pct(totalApproved, totalAmount)}% approved`} icon={Landmark} color="#1A5632" />
          <StatCard label="GAP" value={fmtShort(totalGap)} sub={totalGap > 0 ? 'Unfunded' : 'Fully funded'} icon={AlertTriangle} color={totalGap > 0 ? '#EF4444' : '#10B981'} />
        </div>

        {/* Two columns: BUs + Funding Sources */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">

          {/* Budget by BU */}
          <div className="bg-white border border-gray-200 border-t-0">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-gray-800">Budget by Business Unit</h3>
              <span className="text-[11px] text-gray-400">{byBu.length} BUs</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {topBUs.map(bu => (
                <BarRow
                  key={bu.bu_code}
                  label={bu.bu_code}
                  value={bu.total_amount}
                  maxValue={maxBu}
                  count={bu.line_count}
                  color="#348F41"
                  link={isBaseOpen ? `/budget-base?bu=${encodeURIComponent(bu.bu_code)}` : null}
                />
              ))}
            </div>
          </div>

          {/* Budget by Implementing Partner */}
          <div className="bg-white border border-gray-200 border-t-0 border-l-0">
            <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-gray-800">Funding Sources (IPs)</h3>
              <span className="text-[11px] text-gray-400">{activeIPs.length} active</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {activeIPs.map(ip => (
                <BarRow
                  key={ip.key}
                  label={ip.label}
                  value={ipTotals[ip.key]}
                  maxValue={maxIP}
                  color="#E8A838"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Fund Descriptions breakdown */}
        <div className="bg-white border border-gray-200 border-t-0">
          <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-gray-800">By Fund Description</h3>
            <span className="text-[11px] text-gray-400">{topFunds.length} funds</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-100 text-[10px] text-gray-500 uppercase">
                  <th className="px-4 py-2 font-semibold">Fund</th>
                  <th className="px-4 py-2 font-semibold text-right w-[100px]">Amount</th>
                  <th className="px-4 py-2 font-semibold text-right w-[60px]">Lines</th>
                  <th className="px-4 py-2 font-semibold w-[200px]">Share</th>
                </tr>
              </thead>
              <tbody>
                {topFunds.map((f, idx) => {
                  const share = pct(f.total_amount, totalAmount);
                  return (
                    <tr key={f.fund_description} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="px-4 py-2.5 text-[12px] font-medium text-gray-800">{f.fund_description}</td>
                      <td className="px-4 py-2.5 text-[12px] font-semibold text-gray-900 text-right">{fmt(f.total_amount)}</td>
                      <td className="px-4 py-2.5 text-[12px] text-gray-500 text-right">{f.line_count}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-[10px] bg-gray-100">
                            <div className="h-full bg-[#1A5632]" style={{ width: `${share}%` }} />
                          </div>
                          <span className="text-[10px] text-gray-500 w-[30px] text-right">{share}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
