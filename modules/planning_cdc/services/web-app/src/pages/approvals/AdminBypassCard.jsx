/**
 * Admin bypass affordance shown only to users with
 * `reports:approve:all`. Click opens the BypassModal confirmation.
 *
 * @param {object} props
 * @param {() => void} props.onOpen
 * @returns {JSX.Element}
 */
export default function AdminBypassCard({ onOpen }) {
  return (
    <div className="mt-3 border border-amber-200 bg-amber-50 p-3 text-[11px]">
      <div className="mb-1 font-semibold text-amber-800">Admin bypass</div>
      <p className="mb-2 text-amber-700">
        Short-circuits the chain to approved/final. Use only when the normal
        approval path is blocked and the report must still land.
      </p>
      <button
        type="button"
        onClick={onOpen}
        className="border border-amber-600 bg-white px-3 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
      >
        Bypass as admin
      </button>
    </div>
  );
}
