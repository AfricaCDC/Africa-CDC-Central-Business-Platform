import { Link } from 'react-router-dom';
import StatusBadge from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/QueryStates';

function Narrative({ label, value }) {
  if (!value) return null;
  return (
    <div className="mt-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-[12px] text-gray-700 whitespace-pre-line">{value}</div>
    </div>
  );
}

/**
 * The activity reports filed on the unit's specific activities for the
 * quarter, submitted or approved (D-20261106-13).
 *
 * @param {{ reports: object[] }} props - `activities` of the division summary
 * @returns {JSX.Element}
 * @example <DivisionActivityReportsPanel reports={data.activities} />
 */
export default function DivisionActivityReportsPanel({ reports }) {
  return (
    <div className="bg-white border border-gray-200 border-t-0">
      <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-[13px] font-semibold text-gray-800">Activity reports ({reports.length})</h3>
      </div>
      {reports.length ? (
        <div className="divide-y divide-gray-100">
          {reports.map((r) => (
            <div key={r.id} className="px-5 py-3">
              <div className="flex items-center gap-2">
                <Link to={`/plan/node/${r.plan_node_id}`} className="text-[12px] font-semibold text-gray-900 hover:text-[#1A5632] hover:underline">
                  <span className="font-mono text-[#1A5632] mr-1.5">{r.code}</span>{r.title}
                </Link>
                <StatusBadge status={r.status} />
              </div>
              <Narrative label="Achievements" value={r.achievements} />
              <Narrative label="Challenges" value={r.challenges} />
              <Narrative label="Lessons learned" value={r.lessons_learned} />
              <Narrative label="Next steps" value={r.next_steps} />
            </div>
          ))}
        </div>
      ) : (
        <div className="py-10">
          <EmptyState title="No activity report" hint="No activity report of this unit was submitted for the quarter." />
        </div>
      )}
    </div>
  );
}
