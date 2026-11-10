// Layout primitives shared by the edit and read views of the activity report.

export const INPUT = 'w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#D97706] disabled:bg-gray-50';

/**
 * Titled block of the report.
 * @param {{ title: string, children: React.ReactNode }} props
 * @returns {JSX.Element}
 * @example <Section title="11. Activity logistics">…</Section>
 */
export function Section({ title, children }) {
  return (
    <div className="border border-gray-200 bg-white">
      <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

/**
 * Label above a control, carrying the template item number when given.
 * @param {{ n?: string, label: string, children: React.ReactNode }} props
 * @returns {JSX.Element}
 * @example <Row n="7" label="Venue"><input /></Row>
 */
export function Row({ n, label, children }) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
        {n && <span className="text-[#D97706] mr-1">{n}.</span>}{label}
      </label>
      {children}
    </div>
  );
}

/**
 * Numbered textarea following a template item.
 * @param {{ n: string, label: string, value: string, onChange: Function, placeholder?: string, rows?: number }} props
 * @returns {JSX.Element}
 * @example <NumberedField n="10c" label="Narrative" value={v} onChange={setV} />
 */
export function NumberedField({ n, label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 pt-1">
        <span className="inline-flex items-center justify-center w-7 h-6 text-[9px] font-bold bg-[#D97706] text-white">{n}</span>
      </div>
      <div className="flex-1">
        <label className="text-[10px] font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">{label}</label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#D97706] resize-none placeholder:text-gray-300"
        />
      </div>
    </div>
  );
}

/**
 * Read-only multi-line text; renders nothing when empty.
 * @param {{ label: string, value: string, highlight?: boolean }} props
 * @returns {JSX.Element|null}
 * @example <NarrativeBlock label="Narrative" value={form.narrative} highlight />
 */
export function NarrativeBlock({ label, value, highlight }) {
  if (value === '' || value == null) return null;
  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{label}</label>
      <div className={`text-[11px] leading-relaxed whitespace-pre-wrap ${highlight ? 'text-gray-900 bg-[#F0F7F2] border border-[#14442A]/20 px-4 py-3' : 'text-gray-700 border-l-2 border-gray-200 pl-4 py-1'}`}>
        {value}
      </div>
    </div>
  );
}

/**
 * One label/value line of the read-only view; renders nothing when empty.
 * @param {{ label: string, children: React.ReactNode }} props
 * @returns {JSX.Element|null}
 * @example <Fact label="Venue">{form.venue}</Fact>
 */
export function Fact({ label, children }) {
  if (children === '' || children == null || children === false) return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] text-gray-400 uppercase font-semibold w-[160px] flex-shrink-0">{label}</span>
      <div className="text-[12px] text-gray-800">{children}</div>
    </div>
  );
}
