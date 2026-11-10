import { useNavigate } from 'react-router-dom';
import { BIG_TICKET_PROGRESS, groupByPillar, pillarShort, pillarTitle, yearsLabel } from '../config';
import ProgressChip, { PerformanceBar } from '../ProgressChip';

const GRID = 'grid grid-cols-[64px_minmax(0,1fr)_160px_140px_150px_110px] gap-3';

function gapNote(report) {
  if (!report || report.progress_status !== BIG_TICKET_PROGRESS.ACHIEVED) return null;
  const pct = report.performance_pct;
  return pct !== null && pct !== undefined && pct < 100 ? `Achieved at ${pct}% of target` : null;
}

/**
 * Big Tickets grouped by pillar; a click on a row opens the ticket.
 *
 * @param {{ items: object[], fiscalYear: string }} props
 * @returns {JSX.Element}
 * @example <BigTicketsTable items={data.items} fiscalYear="2026" />
 */
export default function BigTicketsTable({ items, fiscalYear }) {
  const navigate = useNavigate();
  const handleRowClick = (id) => navigate(`/big-tickets/${id}?fy=${fiscalYear}`);

  return (
    <div className="flex flex-col gap-4">
      {groupByPillar(items).map((group) => (
        <section key={group.key} className="border border-gray-200 bg-white">
          <header className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2">
            <span className="bg-[#1A5632] px-1.5 py-0.5 text-[10px] font-bold text-white">{pillarShort(group.name)}</span>
            <h2 className="text-[12px] font-semibold text-gray-900">{pillarTitle(group.name)}</h2>
            <span className="text-[11px] text-gray-500">{group.items.length} {group.items.length === 1 ? 'ticket' : 'tickets'}</span>
          </header>
          <div className="overflow-x-auto">
            <div className="min-w-[880px]">
              <div className={`${GRID} border-b border-gray-100 px-4 py-1.5 text-[10px] uppercase text-gray-500`}>
                <span>Ticket</span><span>Big Ticket</span><span>Business units</span><span>Indicators</span><span>Performance</span><span>Status</span>
              </div>
              {group.items.map((t) => (
                <div
                  key={t.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => handleRowClick(t.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRowClick(t.id); }}
                  className={`${GRID} cursor-pointer items-center border-b border-gray-100 px-4 py-2.5 hover:bg-[#F2F7F3] focus:bg-[#F2F7F3] focus:outline-none`}
                >
                  <span className="font-mono text-[11px] font-semibold text-[#1A5632]">{t.code}</span>
                  <span className="text-[12px] leading-snug text-gray-900">
                    {t.title}
                    <span className="mt-0.5 block text-[10px] text-gray-500">
                      {yearsLabel(t)}{t.line_count > 1 ? ` · ${t.line_count} indicator lines` : ''}
                    </span>
                  </span>
                  <span className="text-[11px] leading-snug">
                    <span className="font-semibold text-gray-800" title={t.lead_division_name ? `Lead: ${t.lead_division_name}` : 'Lead'}>{t.lead_division_code}</span>
                    {!!t.contributor_codes?.length && <span className="block text-[10px] text-gray-500">+ {t.contributor_codes.join(', ')}</span>}
                  </span>
                  <span className="text-[11px] text-gray-700">{t.indicator_codes.join(', ') || <span className="text-gray-400">Big Ticket indicator</span>}</span>
                  <PerformanceBar value={t.report?.performance_pct} status={t.report?.progress_status} />
                  <span className="flex flex-col items-start gap-0.5">
                    <ProgressChip status={t.report?.progress_status} />
                    {gapNote(t.report) && <span className="text-[9px] text-amber-700">{gapNote(t.report)}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
