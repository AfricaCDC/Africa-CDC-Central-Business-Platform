import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import { NODE_TYPES } from '@rbm/lib/enums';
import { RBAC_MODULES, RBAC_ACTIONS, RBAC_SCOPES } from '@rbm/lib/rbac';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { LoadingState, ErrorState } from '@/components/shared/QueryStates';
import { usePermissions } from '@/hooks/usePermissions';
import { useT3T4Indicators } from '@/hooks/useIndicatorQueries';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import { getErrorMessage } from '@/utils/errorMessage';
import { useMappingActivities, useSetIndicatorLinks } from './hooks/useIndicatorMappingQueries';
import { useMappingFilters, LINK_FILTERS } from './hooks/useMappingFilters';
import MappingTable, { PAGE_SIZE } from './MappingTable';

const TYPES = [[NODE_TYPES.BROAD_ACTIVITY, 'Broad Activities'], [NODE_TYPES.SPECIFIC_ACTIVITY, 'Specific Activities']];
const LINK_LABELS = { all: 'All', linked: 'Linked', unlinked: 'Unlinked' };
const toggle = (isOn) => `border px-3 py-1 text-[11px] ${isOn ? 'border-[#B4A269] bg-[#B4A269] text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`;

function matches(item, { q, linked }) {
  if (linked === 'linked' && !item.indicator_ids.length) return false;
  if (linked === 'unlinked' && item.indicator_ids.length) return false;
  const needle = q.trim().toLowerCase();
  return !needle || `${item.code} ${item.title} ${item.responsible_division_code}`.toLowerCase().includes(needle);
}

function Filters({ filters, setFilter }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border border-t-0 border-gray-200 bg-white px-5 py-3">
      <div className="flex border border-gray-300">
        {TYPES.map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter('type', value)}
            className={`px-4 py-1.5 text-[11px] font-medium ${filters.type === value ? 'bg-[#B4A269] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{label}</button>
        ))}
      </div>
      <label className="flex min-w-[180px] flex-1 items-center gap-2">
        <Search className="h-3.5 w-3.5 text-gray-400" />
        <input type="text" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Search code, title or business unit…" className="flex-1 text-[12px] outline-none" />
      </label>
      <div className="flex gap-1">
        {LINK_FILTERS.map((v) => <button key={v} type="button" onClick={() => setFilter('linked', v)} className={toggle(filters.linked === v)}>{LINK_LABELS[v]}</button>)}
      </div>
    </div>
  );
}

/**
 * Activity → T3/T4 indicator mapping (D-20261016-04). Broad activities link
 * to several indicators, specific activities to one. Everyone with read sees
 * the links; M&E and admins (`indicator_mapping:update` at scope `all`) edit.
 *
 * Route: /pirs/mapping?type=BROAD_ACTIVITY&q=&linked=unlinked&page=1
 *
 * @returns {JSX.Element}
 * @example <Route path="/pirs/mapping" element={<IndicatorMappingPage />} />
 */
export default function IndicatorMappingPage() {
  const { planningYear: fiscalYear } = usePlanningYear();
  const { filters, setFilter } = useMappingFilters();
  const { getScope } = usePermissions();
  const canEdit = getScope(RBAC_MODULES.INDICATOR_MAPPING, RBAC_ACTIONS.UPDATE) === RBAC_SCOPES.ALL;
  const isSingle = filters.type === NODE_TYPES.SPECIFIC_ACTIVITY;
  const activities = useMappingActivities({ fiscal_year: String(fiscalYear || ''), node_type: filters.type });
  const { data: indicators = [] } = useT3T4Indicators(fiscalYear);
  const save = useSetIndicatorLinks();
  const [savingId, setSavingId] = useState(null);

  const options = useMemo(() => indicators.map((i) => ({ value: i.id, label: `T${i.tier_id} ${i.code}`, sub: i.title })), [indicators]);
  const all = activities.data || [];
  const rows = all.filter((item) => matches(item, filters));
  const linkedCount = all.filter((item) => item.indicator_ids.length).length;

  const handleLinks = async (id, ids) => {
    setSavingId(id);
    try {
      await save.mutateAsync({ id, indicatorIds: ids });
      toast.success('Indicator links saved');
    } catch (err) {
      toast.error(getErrorMessage(err, 'The links could not be saved.'));
    } finally {
      setSavingId(null);
    }
  };

  let body;
  if (activities.isLoading) body = <div className="border border-t-0 border-gray-200 bg-white p-6"><LoadingState /></div>;
  else if (activities.isError) body = <ErrorState message={getErrorMessage(activities.error, 'Could not load the activities.')} onRetry={activities.refetch} />;
  else if (!rows.length) body = <div className="border border-t-0 border-gray-200 bg-white px-6 py-10 text-center text-[12px] text-gray-500">No activity matches these filters.</div>;
  else {
    body = (
      <MappingTable items={rows.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE)} total={rows.length} page={filters.page}
        options={options} isSingle={isSingle} canEdit={canEdit} savingId={savingId} onLinks={handleLinks} onPage={(p) => setFilter('page', p)} />
    );
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'PIRS' }, { label: 'Indicators', path: '/pirs' }, { label: 'Activity Mapping' }]}>
      <div className="bg-[#B4A269] px-6 py-5 text-white">
        <h1 className="text-[18px] font-semibold">Activity → T3/T4 indicator mapping</h1>
        <p className="mt-1 text-[12px] text-white/80">
          {isSingle ? 'A specific activity contributes to one T3/T4 indicator.' : 'A broad activity can contribute to several T3/T4 indicators.'}
          {!canEdit && ' Only M&E and administrators can change the links.'}
        </p>
        {activities.data && (
          <p className="mt-3 flex flex-wrap gap-6 text-[12px] text-white/90">
            <span><strong className="text-white">{all.length}</strong> activities</span>
            <span><strong className="text-white">{linkedCount}</strong> linked</span>
            <span><strong className="text-white">{all.length - linkedCount}</strong> unlinked</span>
            <span><strong className="text-white">{indicators.length}</strong> T3/T4 indicators</span>
          </p>
        )}
      </div>
      <Filters filters={filters} setFilter={setFilter} />
      {body}
    </DashboardLayout>
  );
}
