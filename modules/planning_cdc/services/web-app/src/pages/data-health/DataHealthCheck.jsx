import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

const PAGE = 15;

/**
 * One data health check: its count, why it matters, and the records to
 * complete. Clicking a row opens the page where it is fixed.
 *
 * @param {{ check: { key: string, label: string, hint: string, count: number, rows: object[] } }} props
 * @returns {JSX.Element}
 * @example <DataHealthCheck check={{ key: 'user_unit', label: 'Active users without a unit', hint: '…', count: 0, rows: [] }} />
 */
export default function DataHealthCheck({ check }) {
  const navigate = useNavigate();
  const [shown, setShown] = useState(PAGE);
  const isClean = check.count === 0;
  const rows = check.rows.slice(0, shown);

  return (
    <section className="border border-gray-200 bg-white">
      <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div>
          <h2 className="text-[12px] font-semibold text-gray-900">{check.label}</h2>
          <p className="mt-0.5 text-[11px] text-gray-500">{check.hint}</p>
        </div>
        {isClean ? (
          <span className="flex items-center gap-1 text-[11px] text-[#1A5632]"><CheckCircle2 className="h-4 w-4" /> Complete</span>
        ) : (
          <span className="border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{check.count}</span>
        )}
      </header>
      {!isClean && (
        <table className="w-full text-left text-[11px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.ref} onClick={() => navigate(r.path)} className="cursor-pointer border-b border-gray-50 hover:bg-gray-50">
                <td className="w-40 px-4 py-1.5 font-mono text-[#1A5632]">{r.code}</td>
                <td className="px-2 py-1.5 text-gray-800">{r.name}</td>
                <td className="px-4 py-1.5 text-gray-500">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {check.rows.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="px-4 py-2 text-[12px] text-[#1A5632] hover:underline">
          Show {Math.min(PAGE, check.rows.length - shown)} more
        </button>
      )}
      {check.count > check.rows.length && shown >= check.rows.length && (
        <p className="px-4 py-2 text-[10px] text-gray-500">The first {check.rows.length} of {check.count} are listed.</p>
      )}
    </section>
  );
}
