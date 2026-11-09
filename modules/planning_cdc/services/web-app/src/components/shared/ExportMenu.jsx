import { useState } from 'react';
import { Download, ChevronDown, Loader2 } from 'lucide-react';

/**
 * Reusable Export dropdown (XLSX / CSV). Self-contained — no external dropdown
 * dependency. Renders an "Export" button that toggles a small menu; choosing a
 * format calls `onExport(format)`. The caller owns the download + busy state.
 *
 * Gate this with `can(module, 'export')` at the call site — the component does
 * not check permissions itself.
 *
 * @param {object} props
 * @param {(format: 'xlsx'|'csv') => void} props.onExport
 * @param {boolean} [props.isExporting] - shows a spinner and disables the menu
 * @param {boolean} [props.disabled]
 * @param {string} [props.label='Export']
 * @returns {JSX.Element}
 * @example
 * <ExportMenu onExport={(fmt) => download(fmt)} isExporting={busy} />
 */
export default function ExportMenu({ onExport, isExporting = false, disabled = false, label = 'Export' }) {
  const [open, setOpen] = useState(false);

  const handlePick = (format) => {
    setOpen(false);
    onExport(format);
  };

  const options = [
    { format: 'xlsx', label: 'Excel (.xlsx)' },
    { format: 'csv', label: 'CSV (.csv)' },
  ];

  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={disabled || isExporting}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 border border-gray-200 bg-white text-[12px] text-gray-700 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {isExporting
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Download className="w-3.5 h-3.5" />}
        {label}
        <ChevronDown className="w-3 h-3 text-gray-400" />
      </button>

      {open && !isExporting && (
        <>
          {/* click-away backdrop */}
          <button
            type="button"
            aria-label="Close export menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div role="menu" className="absolute right-0 z-20 mt-1 w-40 border border-gray-200 bg-white shadow-sm">
            {options.map((opt) => (
              <button
                key={opt.format}
                type="button"
                role="menuitem"
                onClick={() => handlePick(opt.format)}
                className="block w-full text-left text-[12px] text-gray-700 px-3 py-2 hover:bg-[#E0F0E9]"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
