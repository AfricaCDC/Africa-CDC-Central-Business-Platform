/**
 * Budget codes of the broad activity, read-only on a specific activity
 * (D-20261103-06). Nothing is chosen or stored on the specific activity.
 *
 * @param {{ codes?: Array<{ id: number, budget_code: string|null, fund_code: string|null, fund_description: string|null }> }} props
 * @returns {JSX.Element}
 * @example <BroadBudgetCodes codes={broad.budget_codes} />
 */
export default function BroadBudgetCodes({ codes = [] }) {
  if (!codes.length) return <p className="text-[11px] text-gray-500">No budget code for this broad activity yet.</p>;
  return (
    <ul className="space-y-0.5">
      {codes.map((c) => (
        <li key={c.id} className="text-[11px] text-gray-800">
          <span className="font-mono font-semibold">{c.budget_code || '—'}</span>
          {c.fund_code && <span className="text-gray-600"> · Fund {c.fund_code}</span>}
          {c.fund_description && <span className="text-gray-500"> ({c.fund_description})</span>}
        </li>
      ))}
    </ul>
  );
}
