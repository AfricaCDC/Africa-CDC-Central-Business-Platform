/* eslint-disable no-unused-vars, complexity -- pre-existing legacy, tracked. */
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import { useMyIndicatorsData } from '@/hooks/usePlanNodeQueries';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { Loader2, Search, ArrowRight, Star, Users, Eye } from 'lucide-react';
import { isMasterContributor as isMainContributor, getMasterDivisionCode as getMainDivisionCode } from '@/data/divisionPrefixMap';
import { fmtValue as fmtVal } from '@rbm/lib/formatters';
import { fyToYear } from '@rbm/lib/fiscalYear';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

/**
 * "My indicators" page. Lists indicators owned or contributed to by the current
 * user's division, with master/contributor badges and search.
 *
 * @returns {JSX.Element}
 */
export default function MyIndicatorsPage() {
  const { user } = useAuth();
  const { activeCodes, activeDivision, loaded: divLoaded, divisions: myDivisions } = useActiveDivision();
  // Legacy users.division_code is NULL for multi-division-era assignments.
  const divCode = activeDivision?.code || myDivisions?.[0]?.code || user?.division_code;
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const navigate = useNavigate();
  const { planningYear: fiscalYear, fyNum } = usePlanningYear();

  const { data: raw, isLoading: loading } = useMyIndicatorsData(fiscalYear);

  // Open reporting period (admin-controlled) — drives the "Due this Q"
  // column so we don't rely on wall-clock month.
  const { data: openPeriod } = useQuery({
    queryKey: ['reporting', 'periods', 'active'],
    queryFn: () => api.get('/reporting/periods/active').then(r => r.data).catch(() => null),
    staleTime: 60_000,
  });
  const openQuarterNum = openPeriod?.quarter
    ? Number(String(openPeriod.quarter).replace(/[^0-9]/g, ''))
    : null;

  const indicators = useMemo(() => {
    if (!raw || !divLoaded || !divCode) return [];
    const { broads: rawBroads, specifics: rawSpecs, t3, t4, divisions: allDivisions } = raw;
    const allInds = [...t3, ...t4];

    const enriched = allInds.map(i => {
      const mainCode = getMainDivisionCode(i.code, allDivisions);
      const mainDivision = mainCode
        ? allDivisions.find(d => d.code?.toUpperCase() === mainCode.toUpperCase())
        : null;
      return {
        ...i,
        main_division_code: mainCode,
        main_division: mainDivision,
        is_main_for_user: isMainContributor(i.code, divCode || user.division_code, allDivisions),
      };
    });

    const broads = rawBroads.filter(b => activeCodes.has(String(b.responsible_division_code || '').toUpperCase()));
    const broadIds = new Set(broads.map(b => b.id));
    const specs = rawSpecs.filter(s => activeCodes.has(String(s.responsible_division_code || '').toUpperCase()) || broadIds.has(s.parent_id));
    const contributedIds = new Set();
    broads.forEach(b => { if (b.parent_id) contributedIds.add(b.parent_id); });
    specs.forEach(s => { if (s.linked_indicator_id) contributedIds.add(s.linked_indicator_id); });

    return enriched.filter(i => i.is_main_for_user || contributedIds.has(i.id));
  }, [raw, divLoaded, divCode, activeCodes, user]);

  if (loading) return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'T3/T4 Indicators' }]}>
      <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-[#14442A]" /></div>
    </DashboardLayout>
  );

  if (!divCode) return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'T3/T4 Indicators' }]}>
      <div className="p-6 text-[11px] text-gray-500">No division assigned.</div>
    </DashboardLayout>
  );

  let filtered = indicators;
  if (roleFilter === 'main') filtered = filtered.filter(i => i.is_main_for_user);
  else if (roleFilter === 'contributor') filtered = filtered.filter(i => !i.is_main_for_user);
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(i => (i.title || '').toLowerCase().includes(s) || (i.code || '').toLowerCase().includes(s));
  }

  // Sort: main contributor first, then T3 → T4, then by code
  filtered = [...filtered].sort((a, b) => {
    if (a.is_main_for_user !== b.is_main_for_user) return a.is_main_for_user ? -1 : 1;
    if (a.tier_id !== b.tier_id) return a.tier_id - b.tier_id;
    return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true });
  });

  const mainCount        = indicators.filter(i => i.is_main_for_user).length;
  const contributorCount = indicators.filter(i => !i.is_main_for_user).length;

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'T3/T4 Indicators' }]}>
      <div className="space-y-0">
        <div className="bg-[#14442A] text-white">
          <div className="px-6 py-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">T3 / T4 Indicators</span>
              <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-white/15">{activeDivision?.code || user.division_code}</span>
            </div>
            <h1 className="text-[18px] font-semibold leading-snug">{activeDivision?.division_name || user.division_name}</h1>
            <p className="text-[11px] text-white/70 mt-1">All T3/T4 indicators your division contributes to</p>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70 flex-wrap">
            <span><strong className="text-white">{indicators.filter(i => i.tier_id === 3).length}</strong> T3</span>
            <span><strong className="text-white">{indicators.filter(i => i.tier_id === 4).length}</strong> T4</span>
            <span className="flex items-center gap-1"><Star className="w-3 h-3 text-[#B4A269]" /><strong className="text-white">{mainCount}</strong> Main contributor</span>
            <span className="flex items-center gap-1"><Users className="w-3 h-3 text-white/60" /><strong className="text-white">{contributorCount}</strong> Contributor</span>
            <span className="ml-auto"><strong className="text-white">{filtered.length}</strong> shown</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 border-t-0 px-5 py-3 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-[340px]">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by code or title..." className="w-full text-[11px] border border-gray-200 pl-8 pr-3 py-1.5 outline-none focus:border-[#14442A]" />
          </div>
          <div className="flex border border-gray-200">
            {[
              { key: 'all',         label: `All (${indicators.length})` },
              { key: 'main',        label: `Main (${mainCount})` },
              { key: 'contributor', label: `Contributor (${contributorCount})` },
            ].map(b => (
              <button
                key={b.key}
                onClick={() => setRoleFilter(b.key)}
                className={`text-[10px] px-3 py-1.5 border-r border-gray-200 last:border-r-0 ${
                  roleFilter === b.key
                    ? 'bg-[#14442A] text-white font-semibold'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Flat list */}
        <div className="bg-white border border-gray-200 border-t-0">
          {filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-[11px] text-gray-400">No indicators.</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] text-gray-400 border-b border-gray-100 bg-gray-50/50">
                  <th className="px-3 py-2 font-normal w-[40px] text-center">Tier</th>
                  <th className="px-3 py-2 font-normal w-[80px] text-center">Role</th>
                  <th className="px-3 py-2 font-normal w-[140px]">Code</th>
                  <th className="px-3 py-2 font-normal">Indicator</th>
                  <th className="px-3 py-2 font-normal w-[90px] text-center">UOM</th>
                  <th className="px-3 py-2 font-normal w-[60px] text-center">Baseline</th>
                  <th className="px-3 py-2 font-normal w-[60px] text-center">Target · {fyToYear(fyNum)}</th>
                  <th className="px-3 py-2 font-normal w-[40px] text-center">Q1</th>
                  <th className="px-3 py-2 font-normal w-[40px] text-center">Q2</th>
                  <th className="px-3 py-2 font-normal w-[40px] text-center">Q3</th>
                  <th className="px-3 py-2 font-normal w-[40px] text-center">Q4</th>
                  <th className="px-3 py-2 font-normal w-[90px] text-center" title="Whether this indicator is expected to be reported for the current quarter">Due this Q</th>
                  <th className="px-3 py-2 font-normal w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ind, i) => (
                  <tr key={ind.id} onClick={() => navigate(`/plan/node/${ind.id}`)} className={`border-b border-gray-100 cursor-pointer hover:bg-emerald-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block px-1 py-0.5 text-[8px] font-bold text-white ${ind.tier_id === 4 ? 'bg-[#D97706]' : 'bg-[#14442A]'}`}>T{ind.tier_id}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {ind.is_main_for_user ? (
                        <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-[#B4A269] border border-[#B4A269]/40 bg-[#B4A269]/10 px-1.5 py-0.5" title="Main contributor — your division can report on this indicator">
                          <Star className="w-2.5 h-2.5" />
                          Main
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-gray-500 border border-gray-300 bg-gray-50 px-1.5 py-0.5" title={`Read-only — main contributor: ${ind.main_division?.code || ind.main_division_code || 'unknown'}`}>
                          <Eye className="w-2.5 h-2.5" />
                          Contrib
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[9px] font-mono font-bold text-gray-700">{ind.code}</td>
                    <td className="px-3 py-2 text-[10px] text-gray-800">{ind.title}</td>
                    <td className="px-3 py-2 text-[9px] text-gray-500 text-center">{ind.uom?.label || '—'}</td>
                    <td className="px-3 py-2 text-[10px] font-semibold text-gray-700 text-center">{fmtVal(ind.baseline_numeric, ind.uom)}</td>
                    <td className="px-3 py-2 text-[10px] font-semibold text-[#14442A] text-center">{fmtVal(ind[`target_y${fyNum}_numeric`] ?? ind.target_y1_numeric, ind.uom)}</td>
                    <td className="px-3 py-2 text-[10px] text-gray-500 text-center">{ind.q1_target_numeric != null ? Math.round(Number(ind.q1_target_numeric)) : '—'}</td>
                    <td className="px-3 py-2 text-[10px] text-gray-500 text-center">{ind.q2_target_numeric != null ? Math.round(Number(ind.q2_target_numeric)) : '—'}</td>
                    <td className="px-3 py-2 text-[10px] text-gray-500 text-center">{ind.q3_target_numeric != null ? Math.round(Number(ind.q3_target_numeric)) : '—'}</td>
                    <td className="px-3 py-2 text-[10px] text-gray-500 text-center">{ind.q4_target_numeric != null ? Math.round(Number(ind.q4_target_numeric)) : '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {(() => {
                        const periods = Array.isArray(ind.active_periods) ? ind.active_periods : [];
                        if (!openQuarterNum) {
                          return <span className="inline-block text-[9px] text-gray-400">No open quarter</span>;
                        }
                        const due = periods.some((p) => p.fy === fyNum && p.q === openQuarterNum);
                        return due ? (
                          <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 bg-[#1A5632]/10 text-[#1A5632]">Due · Q{openQuarterNum}</span>
                        ) : (
                          <span className="inline-block text-[9px] text-gray-400">—</span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 text-center"><ArrowRight className="w-3 h-3 text-gray-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
