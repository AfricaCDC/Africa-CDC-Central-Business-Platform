/**
 * Division column for the admin staff list. Shows one line per division the
 * user belongs to, with every role held there. Role labels arrive from the API
 * (sourced from packages/lib), so nothing is hardcoded here.
 *
 * @param {object} props
 * @param {Array<{code: string, division_name: string|null, roles: Array<{code: string, label: string}>}>} [props.divisions]
 * @param {string|null} [props.businessUnit] — shown muted when the user has no division
 * @returns {JSX.Element}
 * @example
 * <UserDivisionsCell divisions={user.divisions} businessUnit={user.business_unit} />
 */
export default function UserDivisionsCell({ divisions, businessUnit }) {
  if (!divisions?.length) {
    return <span className="text-[11px] text-gray-500">{businessUnit || '—'}</span>;
  }
  return (
    <ul className="space-y-1">
      {divisions.map((d) => (
        <li key={d.code} className="text-[11px] text-gray-600" title={d.division_name || d.code}>
          <span className="font-medium text-gray-800">{d.code}</span>
          <span className="text-gray-400"> · {d.roles.map((r) => r.label).join(' / ')}</span>
        </li>
      ))}
    </ul>
  );
}
