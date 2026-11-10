import { Link } from 'react-router-dom';
import { useActivityEvidence } from './hooks/useActivityEvidence';

const lineOf = (r) => `${r.code} ${r.title}${r.text ? `: ${r.text}` : ''}`;

/**
 * The approved activity reports of the quarter behind this indicator for
 * the unit (D-20261105-12), with a button that adds them to the narrative.
 * Shows nothing while loading, on error or when there is none: it is a
 * help, never a blocker of the form.
 *
 * @param {{ indicatorId: string, quarter: string, fiscalYear: string, divisionCode: string, onAppend: (text: string) => void }} props
 * @returns {JSX.Element|null}
 * @example <ActivityEvidencePanel indicatorId="40" quarter="Q4" fiscalYear="2026" divisionCode="EPR" onAppend={append} />
 */
export default function ActivityEvidencePanel({ indicatorId, quarter, fiscalYear, divisionCode, onAppend }) {
  const { data: reports = [] } = useActivityEvidence({ indicatorId, quarter, fiscalYear, divisionCode });
  if (!reports.length) return null;

  const handleAppend = () => onAppend(reports.map(lineOf).join('\n'));

  return (
    <div className="mt-2 border border-[#1A5632]/30 bg-[#1A5632]/5 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-[#1A5632]">
          {reports.length} approved activity report{reports.length > 1 ? 's' : ''} this quarter
        </p>
        <button type="button" onClick={handleAppend} className="border border-[#1A5632] bg-white px-2 py-0.5 text-[11px] text-[#1A5632] hover:bg-[#1A5632] hover:text-white">
          Add to the narrative
        </button>
      </div>
      <ul className="mt-1 space-y-1">
        {reports.map((r) => (
          <li key={r.id} className="text-[11px] text-gray-700">
            <Link to={r.link} className="font-mono text-[#1A5632] hover:underline">{r.code}</Link> {r.title}
            {r.text && <span className="text-gray-500">: {r.text}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
