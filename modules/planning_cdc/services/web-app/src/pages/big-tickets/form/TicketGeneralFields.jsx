import { X } from 'lucide-react';
import SearchSelect from '@/components/shared/SearchSelect';
import { YEAR_OPTIONS, pillarShort, pillarTitle } from '../config';

const INPUT = 'w-full border border-gray-300 px-2 py-1.5 text-[12px] focus:border-[#1A5632] focus:outline-none';
const LABEL = 'flex flex-col gap-1 text-[10px] text-gray-500';

/**
 * Identity, business units and years of a Big Ticket.
 *
 * @param {{ form: object, isEdit: boolean, pillars: object[], divisions: object[],
 *   onField: (key: string, value: unknown) => void, onToggleContributor: (code: string) => void }} props
 * @returns {JSX.Element}
 * @example <TicketGeneralFields form={form} isEdit={false} pillars={pillars} divisions={divisions} onField={setField} onToggleContributor={toggle} />
 */
export default function TicketGeneralFields({ form, isEdit, pillars, divisions, onField, onToggleContributor }) {
  const divisionOptions = divisions.map((d) => ({ value: d.code, label: `${d.code} — ${d.division_name || d.code}` }));
  const contributorOptions = divisionOptions.filter((o) => o.value !== form.lead_division_code && !form.contributors.includes(o.value));
  const nameOf = (code) => divisions.find((d) => d.code === code)?.division_name || code;

  return (
    <section className="flex flex-col gap-4 border border-gray-200 bg-white px-4 py-4">
      <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
        <label className={LABEL}>Code
          <input value={form.code} onChange={(e) => onField('code', e.target.value)} placeholder="BT43" className={INPUT} required />
        </label>
        <label className={LABEL}>Big Ticket
          <input value={form.title} onChange={(e) => onField('title', e.target.value)} placeholder="What will be delivered" className={INPUT} required />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <label className={LABEL}>AHSS pillar
          <select value={form.pillar_id} onChange={(e) => onField('pillar_id', e.target.value)} className={INPUT}>
            <option value="">—</option>
            {pillars.map((p) => <option key={p.id} value={String(p.id)}>{pillarShort(p.name)} · {pillarTitle(p.name)}</option>)}
          </select>
        </label>
        <div className={LABEL}>Lead business unit
          <SearchSelect value={form.lead_division_code} options={divisionOptions} onChange={(v) => onField('lead_division_code', v || '')} placeholder="Choose the lead BU" />
        </div>
        <label className={LABEL}>Start year
          <select value={form.start_year} onChange={(e) => onField('start_year', e.target.value)} className={INPUT}>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className={LABEL}>End year
          <select value={form.end_year} onChange={(e) => onField('end_year', e.target.value)} className={INPUT}>
            <option value="">Open (no end year)</option>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={LABEL}>Contributing business units
          <SearchSelect value="" options={contributorOptions} onChange={(v) => v && onToggleContributor(v)} placeholder="Add a business unit" />
          <div className="flex flex-wrap gap-1.5">
            {form.contributors.map((code) => (
              <span key={code} className="flex items-center gap-1 border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-800" title={nameOf(code)}>
                {code}
                <button type="button" onClick={() => onToggleContributor(code)} aria-label={`Remove ${code}`} className="text-gray-500 hover:text-red-700">
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        </div>
        <label className={LABEL}>Other contributors (free text)
          <input value={form.contributors_note} onChange={(e) => onField('contributors_note', e.target.value)} placeholder="e.g. All BUs, Gender" className={INPUT} />
        </label>
      </div>

      {[['expected_result', 'Expected result'], ['delivery_model', 'Delivery model'], ['success_factors', 'Success factors']].map(([key, label]) => (
        <label key={key} className={LABEL}>{label}
          <textarea rows={2} value={form[key]} onChange={(e) => onField(key, e.target.value)} className={`${INPUT} resize-y`} />
        </label>
      ))}

      {isEdit && (
        <label className="flex items-center gap-2 text-[11px] text-gray-700">
          <input type="checkbox" checked={form.is_active} onChange={(e) => onField('is_active', e.target.checked)} />
          Active (inactive tickets disappear from the list)
        </label>
      )}
    </section>
  );
}
