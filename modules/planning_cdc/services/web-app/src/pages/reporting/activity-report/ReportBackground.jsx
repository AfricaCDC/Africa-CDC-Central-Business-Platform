import { useNavigate } from 'react-router-dom';
import { fyToYear, currentFy } from '@rbm/lib/fiscalYear';

function NodeCard({ n, caption, node, accent, children }) {
  const navigate = useNavigate();
  return (
    <div className="border border-gray-200 p-3">
      <p className={`text-[9px] uppercase tracking-wider font-bold mb-1 ${accent}`}>
        {n}. {caption}
      </p>
      {node ? (
        <button
          type="button"
          onClick={() => navigate(`/plan/node/${node.id}`)}
          className="text-[11px] font-medium text-gray-900 hover:underline text-left"
        >
          <span className={`font-mono font-bold mr-1 ${accent}`}>{node.code}</span>
          {node.title}
        </button>
      ) : (
        <p className="text-[11px] text-gray-400">Not linked in the workplan</p>
      )}
      {children}
    </div>
  );
}

/**
 * Template items 1, 2, 3 and 5: the results chain the activity sits in, all
 * filled from the workplan. Read-only in every mode.
 * @param {{ activity: object, fiscalYear: string }} props
 * @returns {JSX.Element}
 * @example <ReportBackground activity={activity} fiscalYear="2026" />
 */
export default function ReportBackground({ activity, fiscalYear }) {
  const indicator = activity.linked_indicator || null;
  const fy = currentFy(Number(fiscalYear));
  const target = indicator ? (indicator[`target_y${fy}_numeric`] ?? indicator.target_y1_numeric) : null;

  return (
    <div className="bg-white border border-gray-200 border-t-0 px-6 py-4">
      <p className="text-[10px] uppercase text-gray-400 font-semibold mb-2">Background (from the workplan)</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <NodeCard n="1" caption="Tier 2 outcome result contributed to" node={activity.tier2_outcome} accent="text-[#14442A]" />
        <NodeCard n="2" caption="Output result emanating from the activity" node={indicator} accent="text-purple-700">
          {indicator && (
            <div className="text-[9px] text-gray-500 mt-1">
              Tier {indicator.tier_id} · Baseline <strong>{indicator.baseline_numeric ?? '—'}</strong>
              {' '}· Target {fyToYear(fy)} <strong className="text-[#14442A]">{target ?? '—'}</strong>
            </div>
          )}
        </NodeCard>
        <NodeCard n="3" caption="Activity name / code" node={activity} accent="text-[#D97706]" />
        <NodeCard n="5" caption="Broad activity (AMERT)" node={activity.parent_broad} accent="text-[#B45309]" />
      </div>
    </div>
  );
}
