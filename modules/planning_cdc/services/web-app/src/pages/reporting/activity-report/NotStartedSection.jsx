import { upcomingQuarters } from './reportTemplate';

/**
 * "This activity has not started yet" (D-20261013-08). Ticked, the report is
 * submitted with the expected start quarter only: the other fields and the
 * verification file are no longer required.
 *
 * @param {{ form: object, set: Function, quarter: string, fiscalYear: string }} props
 * @returns {JSX.Element}
 * @throws {never}
 * @example <NotStartedSection form={form} set={set} quarter="Q3" fiscalYear="2026" />
 */
export default function NotStartedSection({ form, set, quarter, fiscalYear }) {
  const options = upcomingQuarters(quarter, fiscalYear);
  const handleToggle = (checked) => {
    set('not_started', checked);
    if (!checked) set('expected_start', '');
  };

  return (
    <div className={`border px-5 py-3 ${form.not_started ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <label className="flex items-center gap-2 text-[12px] text-gray-800 cursor-pointer">
        <input type="checkbox" checked={form.not_started} onChange={(e) => handleToggle(e.target.checked)} />
        This activity has not started yet
      </label>
      {form.not_started && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="expected-start" className="text-[11px] text-gray-700">Expected to start in</label>
          <select
            id="expected-start"
            value={form.expected_start}
            onChange={(e) => set('expected_start', e.target.value)}
            className="text-[11px] border border-gray-300 px-2 py-1 focus:outline-none focus:border-[#1A5632]"
          >
            <option value="">Select a quarter</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span className="text-[10px] text-gray-500">Only this is required. Other fields are optional.</span>
        </div>
      )}
    </div>
  );
}

/**
 * Read-only notice for a report whose activity has not started.
 * @param {{ form: object }} props
 * @returns {JSX.Element|null}
 * @example <NotStartedNotice form={form} />
 */
export function NotStartedNotice({ form }) {
  if (!form.not_started) return null;
  const when = form.expected_start ? form.expected_start.replace('-', ' ') : 'a later quarter';
  return (
    <div role="status" className="border border-amber-300 bg-amber-50 px-5 py-3 text-[12px] text-amber-900">
      This activity has not started yet. Expected to start in <strong>{when}</strong>.
    </div>
  );
}
