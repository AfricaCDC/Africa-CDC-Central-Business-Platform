import { COMPLEXITY_QUESTION, COMPLEXITY_CRITERIA, COMPLEXITY_RATINGS, scoreComplexity } from '@rbm/lib/complexity';

const TH = 'px-3 py-2 text-[10px] font-semibold uppercase text-gray-500';

function YesNo({ value, onChange }) {
  return (
    <div className="flex gap-4" role="radiogroup" aria-label={COMPLEXITY_QUESTION} aria-required="true">
      {[[true, 'Yes'], [false, 'No']].map(([v, label]) => (
        <label key={label} className="flex cursor-pointer items-center gap-1.5 text-[12px] text-gray-800">
          <input type="radio" name="requires_complex_decision" checked={value === v} onChange={() => onChange(v)} className="accent-[#1A5632]" />
          {label}
        </label>
      ))}
    </div>
  );
}

function CriteriaMatrix({ value, onRate }) {
  return (
    <div className="overflow-x-auto border border-gray-200">
      <table className="w-full min-w-[560px]">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className={`${TH} text-left`}>Complexity criterion</th>
            {COMPLEXITY_RATINGS.map((r) => <th key={r.value} className={`${TH} w-24 text-center`}>{r.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {COMPLEXITY_CRITERIA.map((c) => (
            <tr key={c.key} className="border-b border-gray-100 align-top">
              <td className="px-3 py-2.5">
                <div className="text-[11px] font-semibold text-gray-900">{c.label}</div>
                <div className="text-[10px] text-gray-500">{c.description}</div>
                {value[c.key] && <div className="mt-1 text-[10px] text-[#1A5632]">{c.anchors[value[c.key] - 1]}</div>}
              </td>
              {COMPLEXITY_RATINGS.map((r) => (
                <td key={r.value} className="px-3 py-2.5 text-center">
                  <input type="radio" name={c.key} aria-label={`${c.label}: ${r.label}`} title={c.anchors[r.value - 1]}
                    checked={Number(value[c.key]) === r.value} onChange={() => onRate(c.key, r.value)} className="accent-[#1A5632]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Result({ value }) {
  const rated = COMPLEXITY_CRITERIA.filter((c) => value[c.key]).length;
  const score = scoreComplexity(value);
  if (!score) {
    return <p className="text-[11px] text-gray-500">{rated} of {COMPLEXITY_CRITERIA.length} criteria rated. Rate all five to see the result.</p>;
  }
  return (
    <div className="border border-[#1A5632]/30 bg-[#F2F7F3] px-4 py-3" role="status">
      <p className="text-[12px] text-gray-900"><strong>Score {score.total} / 15</strong> · {score.band.label}</p>
      <p className="mt-1 text-[11px] text-gray-700">{score.band.action}</p>
    </div>
  );
}

/**
 * Decision Complexity Screening of the AWP activity (D-20261026-01): the
 * Yes / No question and, on Yes, one rating per criterion with the
 * automatic score. Informative: it does not change the approval.
 *
 * @param {{ value: object, onChange: (next: object) => void }} props - value: requires_complex_decision + one rating per criterion key
 * @returns {JSX.Element}
 * @example <ComplexityScreeningSection value={plan.screening} onChange={plan.setScreening} />
 */
export default function ComplexityScreeningSection({ value, onChange }) {
  const handleAnswer = (answer) => onChange({ ...value, requires_complex_decision: answer });
  const handleRate = (key, rating) => onChange({ ...value, [key]: rating });
  return (
    <section className="border border-gray-200 bg-white">
      <header className="border-b border-gray-200 bg-gray-50 px-5 py-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-gray-700">Decision Complexity Screening</h2>
        <p className="mt-0.5 text-[10px] text-gray-500">For planning support only: the answers do not affect the approval of the activity.</p>
      </header>
      <div className="space-y-4 px-5 py-4">
        <div>
          <p className="mb-2 text-[12px] font-medium text-gray-900">1. {COMPLEXITY_QUESTION} <span className="text-red-700" aria-hidden="true">*</span></p>
          <YesNo value={value.requires_complex_decision} onChange={handleAnswer} />
        </div>
        {value.requires_complex_decision === true && (
          <div className="space-y-3">
            <p className="text-[12px] font-medium text-gray-900">2. Rate the level of decision complexity against the following criteria.</p>
            <p className="text-[10px] text-gray-500">Select one response for each criterion: 1 = Low, 2 = Moderate, 3 = High.</p>
            <CriteriaMatrix value={value} onRate={handleRate} />
            <Result value={value} />
          </div>
        )}
      </div>
    </section>
  );
}
