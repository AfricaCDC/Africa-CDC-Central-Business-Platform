import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useT3T4Indicators, useMappingPlanNodes } from '@/hooks/useIndicatorQueries';
import { Loader2, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { ITEM_TYPES, NODE_TYPES } from '@rbm/lib/enums';
import { useMappingActivities } from '@/pages/indicator-mapping/hooks/useIndicatorMappingQueries';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

const TIER_COLOR = { 3: '#B4A269', 4: '#58595B' };

/**
 * Page that lists T3/T4 indicators with the workplan items (activities or tasks)
 * contributing to each one. Used to verify mapping coverage.
 *
 * @returns {JSX.Element}
 */
export default function IndicatorContributionsPage() {
  const [itemType, setItemType] = useState(ITEM_TYPES.ACTIVITY);
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState('all');

  const { planningYear: fiscalYear } = usePlanningYear();

  const { data: indicators = [] } = useT3T4Indicators(fiscalYear);
  const { data: rawItems = [], isLoading: loading } = useMappingPlanNodes(itemType, fiscalYear);
  // Links come from the mapping API: a broad activity has several (indicator_broad_links), a specific one at most one.
  const nodeType = itemType === ITEM_TYPES.ACTIVITY ? NODE_TYPES.BROAD_ACTIVITY : NODE_TYPES.SPECIFIC_ACTIVITY;
  const { data: links = [] } = useMappingActivities({ fiscal_year: String(fiscalYear || ''), node_type: nodeType });
  const currentItems = useMemo(() => {
    const idsById = new Map(links.map((l) => [l.id, l.indicator_ids]));
    return rawItems.filter((a) => idsById.get(a.id)?.length).map((a) => ({ ...a, indicator_ids: idsById.get(a.id) }));
  }, [rawItems, links]);

  const itemsByIndicator = useMemo(() => {
    const map = {};
    currentItems.forEach(a => a.indicator_ids.forEach((id) => {
      if (!map[id]) map[id] = [];
      map[id].push(a);
    }));
    return map;
  }, [currentItems]);

  const filtered = useMemo(() => {
    let list = indicators.filter(i => itemsByIndicator[i.id]?.length > 0);
    if (filterTier !== 'all') list = list.filter(i => i.tier_id === parseInt(filterTier));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        (i.indicator_code || '').toLowerCase().includes(q) ||
        (i.indicator_name || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [indicators, itemsByIndicator, search, filterTier]);

  const totalBudget = (items) =>
    items.reduce((s, a) => s + (parseFloat(a.budget_total_2026) || 0), 0);

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));
  const expandAll = () => setExpanded(Object.fromEntries(filtered.map(i => [i.id, true])));
  const collapseAll = () => setExpanded({});

  const totalItems = filtered.reduce((s, i) => s + (itemsByIndicator[i.id]?.length || 0), 0);
  const typeLabel = itemType === ITEM_TYPES.ACTIVITY ? 'Broad Activities' : 'Specific Activities';

  return (
    <DashboardLayout breadcrumbs={[{ label: 'PIRS' }, { label: 'Indicators', path: '/pirs' }, { label: 'Indicator Contributions' }]}>
      <div className="space-y-0">

        {/* Header */}
        <div className="bg-[#1A5632] text-white px-6 py-5">
          <h1 className="text-[18px] font-semibold">Indicator Contributions Report</h1>
          <p className="text-[12px] text-white/70 mt-1">T3/T4 indicators with their contributing activities.</p>
          {!loading && (
            <div className="flex items-center gap-6 mt-3 text-[12px] text-white/80">
              <span><strong className="text-white">{filtered.length}</strong> indicators</span>
              <span><strong className="text-white">{totalItems}</strong> contributing {typeLabel.toLowerCase()}</span>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 border-t-0 px-5 py-3 flex items-center gap-3 flex-wrap">
          {/* Type toggle */}
          <div className="flex items-center gap-0 border border-gray-300 overflow-hidden flex-shrink-0">
            {[[ITEM_TYPES.ACTIVITY, 'Broad Activities'], [ITEM_TYPES.TASK, 'Specific Activities']].map(([v, l]) => (
              <button key={v} onClick={() => { setItemType(v); setExpanded({}); }}
                className={`text-[11px] px-4 py-1.5 font-medium ${itemType === v ? 'bg-[#1A5632] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {l}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search an indicator..."
              className="text-[12px] flex-1 outline-none"
            />
          </div>

          <div className="flex items-center gap-1">
            {[['all', 'T3 + T4'], ['3', 'T3 only'], ['4', 'T4 only']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterTier(v)}
                className={`text-[11px] px-3 py-1 border ${filterTier === v ? 'bg-[#1A5632] text-white border-[#1A5632]' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {l}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button onClick={expandAll} className="text-[11px] px-3 py-1 border border-gray-300 text-gray-600 hover:bg-gray-50">Expand all</button>
            <button onClick={collapseAll} className="text-[11px] px-3 py-1 border border-gray-300 text-gray-600 hover:bg-gray-50">Collapse all</button>
          </div>
        </div>

        {/* Indicator rows */}
        <div className="bg-white border border-gray-200 border-t-0 divide-y divide-gray-100">
          {loading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" /></div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-gray-400">No indicators with contributing {typeLabel.toLowerCase()}</div>
          ) : filtered.map(ind => {
            const acts = itemsByIndicator[ind.id] || [];
            const budget = totalBudget(acts);
            const isOpen = !!expanded[ind.id];
            const tierColor = TIER_COLOR[ind.tier_id] || '#888';
            return (
              <div key={ind.id}>
                <div
                  className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/60 select-none"
                  onClick={() => toggle(ind.id)}
                >
                  <div className="mt-0.5 text-gray-400 flex-shrink-0">
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 text-white" style={{ backgroundColor: tierColor }}>
                        T{ind.tier_id}
                      </span>
                      <Link
                        to={`/plan/node/${ind.id}`}
                        onClick={e => e.stopPropagation()}
                        className="text-[12px] font-semibold text-[#1A5632] hover:underline font-mono"
                      >
                        {ind.indicator_code}
                      </Link>
                      <span className="text-[11px] text-gray-700 leading-snug">{ind.indicator_name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 text-right">
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase">Activities</div>
                      <div className="text-[13px] font-semibold text-gray-700">{acts.length}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase">Total budget</div>
                      <div className="text-[12px] font-semibold text-gray-700">
                        {budget > 0 ? `$${budget.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {isOpen && (
                  <div className="bg-gray-50/60 border-t border-gray-100">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[9px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-200">
                          <th className="pl-12 pr-4 py-2 w-[100px]">Code</th>
                          <th className="px-4 py-2">{typeLabel.slice(0, -1)}</th>
                          <th className="px-4 py-2 w-[160px]">Responsible</th>
                          <th className="px-4 py-2 w-[120px] text-right">Budget</th>
                        </tr>
                      </thead>
                      <tbody>
                        {acts.map(a => (
                          <tr key={a.id} className="border-b border-gray-100 last:border-0 hover:bg-white/80">
                            <td className="pl-12 pr-4 py-2">
                              <Link to={`/plan/node/${a.id}`} className="text-[11px] font-mono text-[#E8A838] hover:underline">
                                {a.amert_code || a.code || `#${a.id}`}
                              </Link>
                            </td>
                            <td className="px-4 py-2 text-[11px] text-gray-700 leading-snug max-w-0">
                              <div className="truncate">{a.title}</div>
                            </td>
                            <td className="px-4 py-2 text-[10px] text-gray-500">{a.responsible_division || '—'}</td>
                            <td className="px-4 py-2 text-[11px] text-gray-600 text-right">
                              {a.budget_total_2026 ? `$${parseFloat(a.budget_total_2026).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
