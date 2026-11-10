/**
 * IndicatorRowActions — action dropdown for PIRS table rows.
 *
 * Displays a three-dot menu with "View details" and optionally "Edit"
 * when the user has the right role.
 *
 * @param {{
 *   detailUrl: string,
 *   onEdit?: (() => void) | null,
 * }} props
 */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { MoreVertical, Eye, Edit2, Trash2 } from 'lucide-react';

export default function IndicatorRowActions({ detailUrl, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-gray-100">
        <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 shadow-sm min-w-[140px]">
          <Link to={detailUrl} onClick={() => setOpen(false)}
            className="w-full text-left px-3 py-2 text-[11px] text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <Eye className="w-3 h-3 text-gray-400" /> View details
          </Link>
          {onEdit && (
            <button onClick={() => { onEdit(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-[11px] text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <Edit2 className="w-3 h-3 text-gray-400" /> Edit
            </button>
          )}
          {onDelete && (
            <button onClick={() => { onDelete(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-[11px] text-red-600 hover:bg-red-50 flex items-center gap-2">
              <Trash2 className="w-3 h-3 text-red-400" /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
