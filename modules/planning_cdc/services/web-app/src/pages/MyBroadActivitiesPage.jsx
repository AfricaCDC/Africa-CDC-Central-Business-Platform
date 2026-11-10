/* eslint-disable complexity -- division filtering adds branches */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import { useMyBroadActivities } from '@/hooks/usePlanNodeQueries';
import { Loader2, Search, ArrowRight } from 'lucide-react';
import { fmtBudgetCompact as fmt } from '@rbm/lib/formatters';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

/**
 * "My broad activities" page. Lists broad activities owned by the current user
 * with search and links into the activity detail/edit flow.
 *
 * @returns {JSX.Element}
 */
export default function MyBroadActivitiesPage() {
  const { user } = useAuth();
  const { activeCodes, activeDivision, loaded: _divLoaded, divisions: myDivisions } = useActiveDivision();
  // Legacy users.division_code is NULL for multi-division-era assignments.
  const divCode = activeDivision?.code || myDivisions?.[0]?.code || user?.division_code;
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { planningYear: fiscalYear } = usePlanningYear();

  const { data: allBroads = [], isLoading: loading } = useMyBroadActivities(fiscalYear);

  // Filter broads to user's divisions
  const broads = allBroads.filter(b =>
    !divCode || activeCodes.has(String(b.responsible_division_code || '').toUpperCase())
  );

  if (loading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'Broad Activities' }]}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#B45309]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!divCode) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'Broad Activities' }]}>
        <div className="p-6 text-[11px] text-gray-500">No division assigned to your account.</div>
      </DashboardLayout>
    );
  }

  const filtered = broads.filter(b => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (b.title || '').toLowerCase().includes(s) || (b.code || '').toLowerCase().includes(s);
  });

  const totalBudget = filtered.reduce((s, b) => s + Number(b.budget_total_2026 || 0), 0);

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'Broad Activities' }]}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#B45309] text-white">
          <div className="px-6 py-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
                Broad Activities
              </span>
              <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-white/15">{activeDivision?.code || user.division_code}</span>
              {(activeDivision?.parent_code || user.directorate) && <span className="text-[10px] text-white/60">{activeDivision?.parent_code || user.directorate}</span>}
            </div>
            <h1 className="text-[18px] font-semibold leading-snug">{activeDivision?.division_name || user.division_name}</h1>
            <p className="text-[11px] text-white/70 mt-1">All broad activities owned by your division</p>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70">
            <span><strong className="text-white">{filtered.length}</strong> Broad Activities</span>
            <span className="ml-auto text-white font-semibold">{fmt(totalBudget)} <span className="text-white/60 font-normal">Total {fiscalYear}</span></span>
          </div>
        </div>

        {/* Filter */}
        <div className="bg-white border border-gray-200 border-t-0 px-5 py-3">
          <div className="relative max-w-[400px]">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by code or title..."
              className="w-full text-[11px] border border-gray-200 pl-8 pr-3 py-1.5 outline-none focus:border-[#B45309]"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 border-t-0">
          {filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-[11px] text-gray-400">No broad activities found.</div>
          ) : (
            filtered.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })).map((b, i) => (
              <div
                key={b.id}
                onClick={() => navigate(`/plan/node/${b.id}`)}
                className={`border-b border-gray-100 cursor-pointer hover:bg-orange-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
              >
                <div className="px-5 py-3 flex items-center gap-3">
                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-[#B45309] text-white text-[9px] font-bold flex-shrink-0">
                    {b.code}
                  </span>
                  <span className="text-[11px] font-medium text-gray-900 flex-1 truncate">{b.title}</span>
                  <span className="text-[11px] font-semibold text-[#B45309] w-[80px] text-right">{fmt(b.budget_total_2026)}</span>
                  <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
