import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useSearchSections } from '@/hooks/useSearchQueries';
import { SEARCH_GROUP_VIEW, SEARCH_MIN_CHARS, SEARCH_PAGE_LIMIT } from '@/config/globalSearch';

const ALL = 'all';
const TAB = 'text-[11px] px-3 py-1 font-medium transition-colors';

function TypeTabs({ sections, active, total, onSelect }) {
  const tabs = [{ group: ALL, label: 'All', count: total }, ...sections.map((s) => ({ group: s.group, label: s.label, count: s.rows.length }))];
  return (
    <div className="bg-white border border-gray-200 border-t-0 px-5 py-2 flex flex-wrap items-center gap-2" role="tablist">
      {tabs.map((t) => (
        <button key={t.group} type="button" role="tab" aria-selected={active === t.group} onClick={() => onSelect(t.group)}
          className={`${TAB} ${active === t.group ? 'bg-[#1A5632] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
          {t.label} ({t.count})
        </button>
      ))}
    </div>
  );
}

function Section({ section }) {
  const view = SEARCH_GROUP_VIEW[section.group];
  return (
    <section>
      <h2 className="px-5 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">{section.label}</h2>
      <div className="divide-y divide-gray-100">
        {section.rows.map((row) => (
          <Link key={row.key} to={row.path} className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#F5F7FA]">
            <view.Icon className={`w-4 h-4 flex-shrink-0 ${view.color}`} />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-gray-900 truncate">
                {row.code && <span className={`font-mono font-semibold mr-2 ${view.color}`}>{row.code}</span>}
                {row.label}
              </div>
              {row.sub && <div className="text-[10px] text-gray-400 mt-0.5">{row.sub}</div>}
            </div>
          </Link>
        ))}
      </div>
      {section.rows.length >= SEARCH_PAGE_LIMIT && (
        <p className="px-5 py-2 text-[10px] text-gray-500 border-t border-gray-100">First {SEARCH_PAGE_LIMIT} shown. Type a longer text or a code to narrow the list.</p>
      )}
    </section>
  );
}

function Body({ q, shown, isSearching, isError, hasTerm, planningYear, refetch }) {
  const note = (text) => <div className="py-12 px-5 text-center text-[12px] text-gray-500">{text}</div>;
  if (!hasTerm) return note(`Type at least ${SEARCH_MIN_CHARS} characters in the search box.`);
  if (isSearching && !shown.length) return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" /></div>;
  if (isError) {
    return (
      <div className="py-12 text-center text-[12px] text-gray-600">
        Search is unavailable right now.{' '}
        <button type="button" onClick={() => refetch()} className="text-[#1A5632] font-medium hover:underline">Try again</button>
      </div>
    );
  }
  if (!shown.length) return note(`Nothing matches "${q}" in the ${planningYear} plan. Try a code, or another year in the year selector.`);
  return shown.map((section) => <Section key={section.group} section={section} />);
}

/**
 * All results of the global search (D-20261106-05) for `?q=`, grouped by
 * type, in the selected plan year. The type tab lives in the URL (`?type=`).
 *
 * @returns {JSX.Element}
 * @example <Route path="/search" element={<SearchResults />} />
 */
export default function SearchResults() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const { sections, ...state } = useSearchSections(q, { limit: SEARCH_PAGE_LIMIT });
  const wanted = params.get('type');
  const active = sections.some((s) => s.group === wanted) ? wanted : ALL;
  const shown = active === ALL ? sections : sections.filter((s) => s.group === active);
  const total = sections.reduce((n, s) => n + s.rows.length, 0);

  const handleSelect = (group) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (group === ALL) next.delete('type'); else next.set('type', group);
    return next;
  }, { replace: true });

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Search' }, { label: q || '...' }]}>
      <div className="bg-[#1A5632] text-white px-6 py-5">
        <div className="flex items-center gap-2 mb-2">
          <Search className="w-5 h-5 text-white/60" />
          <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">Search</span>
        </div>
        <h1 className="text-[20px] font-semibold">Results for &quot;{q}&quot;</h1>
        <p className="text-[11px] text-white/70 mt-1">Plan {state.planningYear} · {total} result{total === 1 ? '' : 's'}</p>
      </div>
      {sections.length > 0 && <TypeTabs sections={sections} active={active} total={total} onSelect={handleSelect} />}
      <div className="bg-white border border-gray-200 border-t-0">
        <Body q={q} shown={shown} {...state} />
      </div>
    </DashboardLayout>
  );
}
