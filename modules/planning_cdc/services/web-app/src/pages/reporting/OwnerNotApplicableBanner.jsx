import { STATUSES } from '@rbm/lib/enums';

/**
 * Banner on the indicator report form when the MAIN division marked the
 * indicator not applicable for the quarter (D-20261013-10): contributors see
 * it too, so nobody reports on an indicator the owner dropped.
 *
 * @param {{ reports: Array<object> }} props - every division report of the indicator for the quarter
 * @returns {JSX.Element|null}
 * @throws {never}
 * @example <OwnerNotApplicableBanner reports={allDivReports} />
 */
export default function OwnerNotApplicableBanner({ reports }) {
  const owner = (reports || []).find((r) => r.role === 'OWNER' && r.status === STATUSES.NOT_APPLICABLE);
  if (!owner) return null;
  const why = owner.rejection_reason || owner.narrative;
  return (
    <div role="status" className="border border-amber-300 bg-amber-50 px-5 py-3 text-[12px] text-amber-900 mb-3">
      The main division ({owner.division_code}) marked this indicator <strong>not applicable</strong> for this quarter.
      {why && <span className="block text-[11px] mt-1">Reason: {why}</span>}
    </div>
  );
}
