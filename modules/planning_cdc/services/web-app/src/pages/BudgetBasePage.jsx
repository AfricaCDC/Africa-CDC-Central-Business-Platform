import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Loader2, Search, Trash2 } from 'lucide-react';
import { useBudgetCodes, useUpdateBudgetCode, useDeleteBudgetCode } from '@/hooks/useBudgetQueries';
import { toast } from 'sonner';
import { fmtBudgetCompact as fmtBudget, fmtNumber } from '@rbm/lib/formatters';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import ConfirmDialog from '@/components/shared/ConfirmDialog';

// Local non-fallback number formatter (returns '' on null instead of '—')
const fmt = (v) => (v == null || v === '' || Number(v) === 0 ? '' : fmtNumber(v));

function EditCell({ value, onSave, type = 'text', align = 'left' }) {
  const [v, setV] = useState(value ?? '');
  const [editing, setEditing] = useState(false);

  useEffect(() => { setV(value ?? ''); }, [value]);

  const commit = () => {
    setEditing(false);
    if (String(v) !== String(value ?? '')) onSave(v);
  };

  if (editing) {
    return (
      <input
        type={type}
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setV(value ?? ''); setEditing(false); } }}
        className={`w-full text-[10px] border border-[#1A5632] px-1 py-0.5 outline-none ${align === 'right' ? 'text-right' : ''}`}
        autoFocus
      />
    );
  }
  return (
    <div
      onClick={() => setEditing(true)}
      className={`text-[10px] px-1 py-0.5 cursor-text hover:bg-yellow-50 min-h-[18px] ${align === 'right' ? 'text-right' : ''} ${!value ? 'text-gray-300' : 'text-gray-800'}`}
    >
      {type === 'number' ? fmt(value) : (value || '—')}
    </div>
  );
}

/**
 * Budget base list page. Shows all budget codes with inline editing of name,
 * description and amounts for the active fiscal year.
 *
 * @returns {JSX.Element}
 */
export default function BudgetBasePage() {
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const { planningYear: fiscalYear } = usePlanningYear();
  const navigate = useNavigate();
  const { data: codes = [], isLoading: loading } = useBudgetCodes(fiscalYear);
  const updateMut = useUpdateBudgetCode(fiscalYear);
  const deleteMut = useDeleteBudgetCode(fiscalYear);

  const filtered = useMemo(() => {
    if (!search) return codes;
    const s = search.toLowerCase();
    return codes.filter(c =>
      (c.budget_code || '').toLowerCase().includes(s) ||
      (c.broad_code || '').toLowerCase().includes(s) ||
      (c.broad_title || '').toLowerCase().includes(s) ||
      (c.fund_description || '').toLowerCase().includes(s) ||
      (c.fund_code || '').toLowerCase().includes(s)
    );
  }, [codes, search]);

  const handleSave = (id, field, value) => {
    updateMut.mutate({ id, data: { [field]: value } }, {
      onSuccess: () => toast.success('Saved'),
      onError: () => toast.error('Save failed'),
    });
  };

  const handleDelete = (id) => {
    deleteMut.mutate(id, {
      onSuccess: () => toast.success('Deleted'),
      onError: () => toast.error('Delete failed'),
    });
  };

  const totals = useMemo(() => ({
    count: filtered.length,
    amount: filtered.reduce((s, c) => s + Number(c.amount || 0), 0),
    main: filtered.reduce((s, c) => s + Number(c.main_budget || 0), 0),
    ta: filtered.reduce((s, c) => s + Number(c.technical_assistance || 0), 0),
    ips: filtered.reduce((s, c) => s + Number(c.total_ips || 0), 0),
  }), [filtered]);

  if (loading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Budget' }, { label: 'Budget Base' }]}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Budget' }, { label: 'Budget Base' }]}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#1A5632] text-white">
          <div className="px-6 py-5">
            <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">FY {fiscalYear}</span>
            <h1 className="text-[18px] font-semibold mt-2">Budget Base — Editable Codes</h1>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70 flex-wrap">
            <span><strong className="text-white">{totals.count}</strong> Budget Codes</span>
            <span>Main: <strong className="text-white">{fmtBudget(totals.main)}</strong></span>
            <span>TA: <strong className="text-white">{fmtBudget(totals.ta)}</strong></span>
            <span>Total IPs: <strong className="text-white">{fmtBudget(totals.ips)}</strong></span>
            <span className="ml-auto text-white font-semibold">Amount: {fmtBudget(totals.amount)}</span>
          </div>
        </div>

        {/* Filter */}
        <div className="bg-white border border-gray-200 border-t-0 px-5 py-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-[400px]">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by code, broad activity, fund..."
              className="w-full text-[11px] border border-gray-200 pl-8 pr-3 py-1.5 outline-none focus:border-[#1A5632]"
            />
          </div>
          <span className="text-[10px] text-gray-400 ml-auto">Click any cell to edit</span>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 border-t-0 overflow-x-auto">
          <table className="w-full text-left text-[10px]" style={{ minWidth: 1400 }}>
            <thead>
              <tr className="bg-gray-100 text-gray-500 uppercase">
                <th className="px-2 py-2 font-semibold w-[80px]">Broad</th>
                <th className="px-2 py-2 font-semibold w-[110px]">Budget Code</th>
                <th className="px-2 py-2 font-semibold w-[80px]">Fund Code</th>
                <th className="px-2 py-2 font-semibold w-[160px]">Fund Description</th>
                <th className="px-2 py-2 font-semibold w-[80px]">Func. Area</th>
                <th className="px-2 py-2 font-semibold w-[100px] text-right">Amount</th>
                <th className="px-2 py-2 font-semibold w-[100px] text-right">Main</th>
                <th className="px-2 py-2 font-semibold w-[100px] text-right">TA</th>
                <th className="px-2 py-2 font-semibold w-[100px] text-right">Total IPs</th>
                <th className="px-2 py-2 font-semibold w-[80px] text-right">Gap</th>
                <th className="px-2 py-2 font-semibold">Description</th>
                <th className="px-2 py-2 font-semibold w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c.id} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} ${(updateMut.isPending && updateMut.variables?.id === c.id) ? 'opacity-50' : ''}`}>
                  <td className="px-2 py-1">
                    <button
                      onClick={() => navigate(`/plan/node/${c.plan_node_id}`)}
                      className="text-[10px] font-mono font-bold text-[#B45309] hover:underline"
                      title={c.broad_title}
                    >
                      {c.broad_code}
                    </button>
                  </td>
                  <td className="px-2 py-1">
                    <EditCell value={c.budget_code} onSave={v => handleSave(c.id, 'budget_code', v)} />
                  </td>
                  <td className="px-2 py-1">
                    <EditCell value={c.fund_code} onSave={v => handleSave(c.id, 'fund_code', v)} />
                  </td>
                  <td className="px-2 py-1">
                    <EditCell value={c.fund_description} onSave={v => handleSave(c.id, 'fund_description', v)} />
                  </td>
                  <td className="px-2 py-1">
                    <EditCell value={c.functional_area} onSave={v => handleSave(c.id, 'functional_area', v)} />
                  </td>
                  <td className="px-2 py-1">
                    <EditCell value={c.amount} type="number" align="right" onSave={v => handleSave(c.id, 'amount', v)} />
                  </td>
                  <td className="px-2 py-1">
                    <EditCell value={c.main_budget} type="number" align="right" onSave={v => handleSave(c.id, 'main_budget', v)} />
                  </td>
                  <td className="px-2 py-1">
                    <EditCell value={c.technical_assistance} type="number" align="right" onSave={v => handleSave(c.id, 'technical_assistance', v)} />
                  </td>
                  <td className="px-2 py-1">
                    <EditCell value={c.total_ips} type="number" align="right" onSave={v => handleSave(c.id, 'total_ips', v)} />
                  </td>
                  <td className="px-2 py-1">
                    <EditCell value={c.gap} type="number" align="right" onSave={v => handleSave(c.id, 'gap', v)} />
                  </td>
                  <td className="px-2 py-1">
                    <EditCell value={c.description} onSave={v => handleSave(c.id, 'description', v)} />
                  </td>
                  <td className="px-2 py-1 text-center">
                    <button onClick={() => setDeleteId(c.id)} aria-label={`Delete budget code ${c.budget_code || ''}`} className="text-red-400 hover:text-red-600">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                <td colSpan={5} className="px-2 py-2 text-[11px] text-gray-700">TOTAL ({totals.count} codes)</td>
                <td className="px-2 py-2 text-[11px] text-right text-[#1A5632]">{fmt(totals.amount)}</td>
                <td className="px-2 py-2 text-[11px] text-right text-[#1A5632]">{fmt(totals.main)}</td>
                <td className="px-2 py-2 text-[11px] text-right text-[#1A5632]">{fmt(totals.ta)}</td>
                <td className="px-2 py-2 text-[11px] text-right text-[#1A5632]">{fmt(totals.ips)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="bg-white border border-gray-200 border-t-0 px-5 py-12 text-center text-[11px] text-gray-400">
            No budget codes found.
          </div>
        )}
      </div>
      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => handleDelete(deleteId)}
        title="Delete this budget code?"
        description="The budget code is removed from the plan year. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />
    </DashboardLayout>
  );
}
