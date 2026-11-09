import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Eye, Pencil, Trash2 } from 'lucide-react';

/**
 * Reusable row-level action dropdown — renders an "Actions ∨" button.
 *
 * @param {object} props
 * @param {number|string} props.id - Row entity ID
 * @param {Array<{label: string, icon?: React.ComponentType, href?: string, onClick?: Function}>} props.actions
 */
export default function RowActions({ actions }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  return (
    <div className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 bg-white"
      >
        Actions <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-50 bg-white border border-gray-200 shadow-sm py-1 min-w-[160px]">
          {actions.map((action, i) => {
            const Icon = action.icon || Eye;
            const isDanger = action.danger;
            return (
              <button
                key={i}
                onClick={() => {
                  setOpen(false);
                  if (action.href) navigate(action.href);
                  else if (action.onClick) action.onClick();
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left ${isDanger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <Icon className={`w-3 h-3 ${isDanger ? 'text-red-400' : 'text-gray-400'}`} /> {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Pre-built action sets for common entity types */
export function planNodeActions(id) {
  return [
    { label: 'View Details', icon: Eye, href: `/plan/node/${id}` },
    { label: 'Edit', icon: Pencil, href: `/plan/node/${id}` },
  ];
}

export function specificActivityActions(id, { onDelete } = {}) {
  const actions = [
    { label: 'View Details', icon: Eye, href: `/plan/node/${id}` },
    { label: 'Edit Activity', icon: Pencil, href: `/tasks/${id}/edit` },
  ];
  if (onDelete) {
    actions.push({ label: 'Delete', icon: Trash2, danger: true, onClick: () => onDelete(id) });
  }
  return actions;
}

export function indicatorActions(id, { onDelete } = {}) {
  const actions = [
    { label: 'View Details', icon: Eye, href: `/plan/node/${id}` },
    { label: 'Edit PIRS', icon: Pencil, href: `/pirs/${id}/edit` },
  ];
  if (onDelete) {
    actions.push({ label: 'Delete', icon: Trash2, danger: true, onClick: () => onDelete(id) });
  }
  return actions;
}
