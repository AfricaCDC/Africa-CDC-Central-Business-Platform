/* eslint-disable no-unused-vars, no-restricted-syntax --
 * Legacy module with baseline debt from pre-guardrails era. Scheduled refactor:
 * task #38 — extract level-type column-enum to ENTITY_TYPES, migrate API call
 * to admin.api.js, add React-Query for tree fetch. Do NOT add new violations;
 * this pragma is a ceiling, not a green light.
 */
// Reusable modal components for the org chart pages.
// Replaces window.prompt / window.confirm (banned by CLAUDE.md) with proper
// dialogs that follow the app's design system (flat borders, Africa CDC
// green, text-[11px] body).

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Check, AlertTriangle, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { ORG_LEVEL_TYPES } from '@rbm/lib/enums';
import { CountryOfficeFields } from './CountryOffice';

// ── Level-type visual tokens ──
// Small pill badge we render next to a division's code throughout the org
// pages. Directorate = green (top rank), Division = blue, Unit = gray.
export const LEVEL_STYLES = {
  directorate: { label: 'DIR',  className: 'bg-[#1A5632] text-white' },
  division:    { label: 'DIV',  className: 'bg-blue-100 text-blue-800' },
  unit:        { label: 'UNIT', className: 'bg-gray-100 text-gray-600' },
};

export function LevelBadge({ type, small = false }) {
  if (!type || !LEVEL_STYLES[type]) return null;
  const { label, className } = LEVEL_STYLES[type];
  return (
    <span className={`${small ? 'text-[8px] px-1' : 'text-[9px] px-1.5 py-0.5'} font-bold ${className}`}>
      {label}
    </span>
  );
}

// ── Shared modal shell ──
function ModalShell({ title, onClose, children, danger = false }) {
  // Dismiss on Escape for accessibility
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-gray-200 w-full max-w-[440px]"
        onClick={e => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-5 py-3 border-b border-gray-200 ${danger ? 'bg-red-600' : 'bg-[#1A5632]'} text-white`}>
          <h2 className="text-[13px] font-semibold flex items-center gap-2">
            {danger && <AlertTriangle className="w-4 h-4" />}
            {title}
          </h2>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Single-field rename modal ──
export function RenameModal({ open, title, label, defaultValue, onClose, onSave }) {
  const [value, setValue] = useState(defaultValue || '');
  useEffect(() => { if (open) setValue(defaultValue || ''); }, [open, defaultValue]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }, [value, onSave]);

  if (!open) return null;

  return (
    <ModalShell title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">{label}</label>
          <input
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            className="w-full text-[12px] border border-gray-200 px-3 py-2 outline-none focus:border-[#1A5632]"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="md">
            <Check className="w-3 h-3" />
            Save
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Create new division modal (code + name + level type in one form) ──
export function NewDivisionModal({ open, parentNode, onClose, onSave }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  // Suggest a sensible default based on parent: under a directorate → division,
  // under a division → unit, orphan → directorate.
  const suggestedLevel = parentNode?.level_type === ORG_LEVEL_TYPES.DIRECTORATE ? ORG_LEVEL_TYPES.DIVISION
                      : parentNode?.level_type === ORG_LEVEL_TYPES.DIVISION ? ORG_LEVEL_TYPES.UNIT
                      : parentNode ? '' : ORG_LEVEL_TYPES.DIRECTORATE;
  const [levelType, setLevelType] = useState(suggestedLevel);
  // Country office (D-20261028-01): code and name are generated from the country.
  const [isCountryOffice, setIsCountryOffice] = useState(false);
  const [country, setCountry] = useState('');

  useEffect(() => {
    if (open) {
      setCode('');
      setName('');
      setLevelType(suggestedLevel);
      setIsCountryOffice(false);
      setCountry('');
    }
  }, [open, suggestedLevel]);

  const handleCountryOffice = (checked) => {
    setIsCountryOffice(checked);
    if (checked) setLevelType(ORG_LEVEL_TYPES.DIRECTORATE);
  };

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (isCountryOffice) {
      if (country) onSave({ is_country_office: true, country_code: country, level_type: levelType || null });
      return;
    }
    if (!code.trim() || !name.trim()) return;
    onSave({
      code: code.trim(),
      division_name: name.trim(),
      level_type: levelType || null,
    });
  }, [code, name, levelType, isCountryOffice, country, onSave]);

  if (!open) return null;

  const title = parentNode
    ? `New sub-division under "${parentNode.code}"`
    : 'New top-level division';

  return (
    <ModalShell title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
        <CountryOfficeFields isCountryOffice={isCountryOffice} onToggle={handleCountryOffice} country={country} onCountry={setCountry} />
        {!isCountryOffice && (<>
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">Code *</label>
          <input
            autoFocus
            value={code}
            onChange={e => setCode(e.target.value)}
            maxLength={20}
            placeholder="e.g. MIS"
            className="w-full text-[12px] border border-gray-200 px-3 py-2 outline-none focus:border-[#1A5632] font-mono uppercase"
            required
          />
          <p className="text-[9px] text-gray-400 mt-1">Max 20 characters, must be unique across all divisions</p>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">Division name *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Human Resource Management"
            className="w-full text-[12px] border border-gray-200 px-3 py-2 outline-none focus:border-[#1A5632]"
            required
          />
        </div>
        </>)}
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-1">Level</label>
          <select
            value={levelType}
            onChange={e => setLevelType(e.target.value)}
            className="w-full text-[12px] border border-gray-200 px-3 py-2 outline-none focus:border-[#1A5632] bg-white"
          >
            <option value="">— Unclassified —</option>
            <option value="directorate">Directorate</option>
            <option value="division">Division</option>
            <option value="unit">Unit</option>
          </select>
          <p className="text-[9px] text-gray-400 mt-1">
            Africa CDC has 3 organisational levels: Directorate → Division → Unit.
          </p>
        </div>
        {parentNode && (
          <div className="text-[10px] text-gray-500 bg-gray-50 px-3 py-2 border border-gray-100">
            Will be created under <strong className="text-gray-800">{parentNode.division_name}</strong>
            <span className="font-mono text-gray-400 ml-1">({parentNode.code})</span>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="md">
            Create
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Alias picker modal ──
// Lets the user pick a canonical division to mark the current one as an
// alias of. Fetches the FULL tree (including any existing alias rows) so
// the user can see everything, then filters out: self, rows that are
// themselves aliases (no chains), and rows already aliasing the current
// one (no cycles).
export function AliasPickerModal({ open, currentNode, onClose, onSave }) {
  const [search, setSearch] = useState('');

  const { data: allRows = [], isLoading: loading } = useQuery({
    queryKey: ['admin', 'divisions-tree-aliases'],
    queryFn: () => api.get('/admin/divisions/tree', { params: { includeAliases: true } }).then(r => r.data || []),
    enabled: open,
    staleTime: 300_000,
  });

  useEffect(() => { if (open) setSearch(''); }, [open]);

  const options = useMemo(() => {
    if (!currentNode) return [];
    const q = search.toLowerCase().trim();
    return allRows
      .filter(r => r.code !== currentNode.code)      // not self
      .filter(r => !r.alias_of)                       // not already an alias
      .filter(r => !q || r.code.toLowerCase().includes(q) || (r.division_name || '').toLowerCase().includes(q))
      .sort((a, b) => String(a.division_name || '').localeCompare(String(b.division_name || '')));
  }, [allRows, currentNode, search]);

  if (!open || !currentNode) return null;

  return (
    <ModalShell title={`Mark "${currentNode.code}" as alias of…`} onClose={onClose}>
      <div className="px-5 py-3 border-b border-gray-100 bg-amber-50/60 text-[11px] text-amber-800">
        <strong>{currentNode.code}</strong> <span className="italic">— {currentNode.division_name}</span>
        <br />
        will become a non-canonical alias. The tree will hide it by default, but legacy FKs still resolve here.
      </div>
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <Search className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search canonical division..."
            className="w-full text-[12px] border border-gray-200 pl-7 pr-3 py-1.5 outline-none focus:border-[#1A5632]"
          />
        </div>
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        {loading ? (
          <div className="px-5 py-8 text-center text-[11px] text-gray-400">Loading…</div>
        ) : options.length === 0 ? (
          <div className="px-5 py-8 text-center text-[11px] text-gray-400">No matching division.</div>
        ) : (
          options.map(opt => (
            <button
              key={opt.code}
              type="button"
              onClick={() => onSave(opt.code)}
              className="w-full text-left px-4 py-2 text-[11px] hover:bg-gray-50 border-b border-gray-50 last:border-b-0 flex items-center gap-2"
            >
              <span className="font-mono text-[9px] font-semibold text-gray-400 w-[70px] flex-shrink-0">{opt.code}</span>
              <span className="text-gray-800 flex-1 truncate">{opt.division_name}</span>
            </button>
          ))
        )}
      </div>
      <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50/50">
        <Button variant="secondary" size="md" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </ModalShell>
  );
}

// ── Confirm modal (delete, dangerous action, etc.) ──
export function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', danger = false, onClose, onConfirm }) {
  if (!open) return null;
  return (
    <ModalShell title={title} onClose={onClose} danger={danger}>
      <div className="px-5 py-4 space-y-3">
        <div className="text-[12px] text-gray-700 leading-relaxed">{message}</div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          {/* danger keeps inline class — `<Button variant="danger">` is outlined-red (in-row remove);
              this confirm uses filled-red for destructive modal action and is intentional. */}
          <button
            type="button"
            onClick={onConfirm}
            className={`text-[11px] px-4 py-2 text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1A5632] hover:bg-[#14442A]'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
