/* eslint-disable no-unused-vars --
 * Legacy file with baseline debt from pre-guardrails era. Scheduled refactor:
 * T-42..T-49 (TanStack Query migration). Do NOT add new violations; this pragma is a ceiling.
 */
/**
 * SpecificActivityReviewTable — head-of-division review queue for
 * SPECIFIC_ACTIVITY rows sitting in IN_REVIEW.
 *
 * Used inside ReviewSubmissionsPage as the "Specific Activities" tab. All
 * data loading is self-contained — the parent only needs to mount this
 * component when the tab is active.
 *
 * Admin users (SYSTEM_ADMIN / RBM_ADMIN) see every IN_REVIEW row across
 * every division. Regular HODs are scoped server-side to the divisions
 * they actually head (via `scope=my_division_review` + user_divisions).
 *
 * The "Reject" flow reuses the same rejection pattern as indicator reports
 * (RejectModal passed from the parent) — prompting for a reason that lands
 * in the row's `rejection_reason` column.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';
import { Loader2, Eye, Check, X, AlertTriangle, Search } from 'lucide-react';
import { toast } from 'sonner';
import { fmtBudgetCompact as fmt, fmtMonth as fmtDate } from '@rbm/lib/formatters';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { NODE_TYPES } from '@rbm/lib/enums';
import DirectorateDivisionFilter from '@/pages/review-submissions/DirectorateDivisionFilter';
import useDivisionFilter from '@/pages/review-submissions/useDivisionFilter';

export default function SpecificActivityReviewTable({ isAdmin }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actingId, setActingId] = useState(null);
  // Row pending an approval confirmation — replaces window.confirm.
  const [approveConfirm, setApproveConfirm] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const divFilter = useDivisionFilter('sa');

  const load = async () => {
    setLoading(true);
    try {
      // Every fiscal year: activities planned for next year are reviewed
      // while the current year runs. Admins see everything (the default list
      // includes pending statuses for them).
      const params = isAdmin
        ? { node_type: NODE_TYPES.SPECIFIC_ACTIVITY }
        : { node_type: NODE_TYPES.SPECIFIC_ACTIVITY, scope: 'my_division_review' };
      const { data } = await api.get('/plan-nodes', { params });
      // For admin we still need to narrow client-side to IN_REVIEW because
      // the default list includes APPROVED rows for admins.
      const list = Array.isArray(data) ? data : [];
      setRows(isAdmin ? list.filter(r => r.status === 'IN_REVIEW') : list);
    } catch (err) {
      toast.error('Failed to load specific activities to review');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const askApprove = (row) => setApproveConfirm(row);

  const approve = async () => {
    const row = approveConfirm;
    setApproveConfirm(null);
    if (!row) return;
    setActingId(row.id);
    try {
      await api.post(`/plan-nodes/specific-activity/${row.id}/approve`);
      toast.success(`${row.title} approved`);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Approve failed');
    } finally {
      setActingId(null);
    }
  };

  const reject = async (reason) => {
    const row = rejectModal?.row;
    if (!row) return;
    if (!reason || !reason.trim()) {
      toast.error('Rejection reason required');
      return;
    }
    setActingId(row.id);
    try {
      await api.post(`/plan-nodes/specific-activity/${row.id}/reject`, { rejection_reason: reason });
      toast.success(`${row.title} rejected`);
      setRejectModal(null);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Reject failed');
    } finally {
      setActingId(null);
    }
  };

  const { matches: matchesDivision } = divFilter;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => matchesDivision(r.responsible_division_code) && (
      !q ||
      (r.title || '').toLowerCase().includes(q) ||
      (r.code || '').toLowerCase().includes(q) ||
      (r.responsible_division_code || '').toLowerCase().includes(q)
    ));
  }, [rows, search, matchesDivision]);

  return (
    <>
      {/* Search */}
      <div className="bg-white border border-gray-200 border-t-0 px-5 py-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[340px]">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, code or division..."
            className="w-full text-[11px] border border-gray-200 pl-8 pr-3 py-1.5 outline-none focus:border-[#1A5632]"
          />
        </div>
        <DirectorateDivisionFilter {...divFilter.filterProps} />
        <span className="text-[10px] text-gray-500 ml-auto">
          <strong>{filtered.length}</strong> awaiting review
        </span>
      </div>

      {/* Approve confirmation — replaces window.confirm. */}
      <ConfirmDialog
        open={!!approveConfirm}
        title="Approve this specific activity?"
        description={
          approveConfirm
            ? `"${approveConfirm.title}" will become visible in the live workplan, Gantt and dashboards. This cannot be undone — the focal person can still resubmit edits, which will bring it back to review.`
            : ''
        }
        confirmLabel="Approve"
        onClose={() => setApproveConfirm(null)}
        onConfirm={approve}
      />

      {/* Reject modal */}
      {rejectModal && (
        <RejectModal
          row={rejectModal.row}
          onCancel={() => setRejectModal(null)}
          onSubmit={reject}
          saving={actingId === rejectModal.row?.id}
        />
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 border-t-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-[12px] text-gray-400">
            {search || divFilter.isActive ? 'No activities match the search or filters.' : 'No specific activities awaiting review.'}
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] text-gray-500 uppercase border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2 w-[100px]">Division</th>
                <th className="px-3 py-2 w-[60px]">FY</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2 w-[140px] text-center">Timeline</th>
                <th className="px-3 py-2 w-[110px] text-right">Budget</th>
                <th className="px-3 py-2 w-[120px] text-center">Submitted</th>
                <th className="px-3 py-2 w-[120px] text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => (
                <tr key={r.id} className={`border-b border-gray-100 hover:bg-amber-50/40 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                  <td className="px-3 py-2.5 text-[10px]">
                    <span className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-600 font-mono">
                      {r.responsible_division_code || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[10px] text-gray-600">{r.fiscal_year}</td>
                  <td className="px-3 py-2.5 text-[11px] text-gray-800">{r.title}</td>
                  <td className="px-3 py-2.5 text-[9px] text-gray-500 text-center">
                    {r.start_date ? `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[10px] font-semibold text-[#D97706] text-right">
                    {fmt(r.budget_main || r.budget_total_2026)}
                  </td>
                  <td className="px-3 py-2.5 text-[9px] text-gray-500 text-center">
                    {r.submitted_at ? fmtDate(r.submitted_at) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => navigate(`/plan/node/${r.id}`)}
                        className="p-1 border border-gray-300 text-gray-600 hover:bg-gray-50"
                        title="View"
                      >
                        <Eye className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => askApprove(r)}
                        disabled={actingId === r.id}
                        className="p-1 border border-green-600 text-green-700 hover:bg-green-600 hover:text-white disabled:opacity-50"
                        title="Approve"
                      >
                        {actingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => setRejectModal({ row: r })}
                        disabled={actingId === r.id}
                        className="p-1 border border-red-500 text-red-600 hover:bg-red-500 hover:text-white disabled:opacity-50"
                        title="Reject"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ─── Inline RejectModal (lightweight, scoped to this table) ───
function RejectModal({ row, onCancel, onSubmit, saving }) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="bg-white border border-gray-200 w-full max-w-[520px]" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 bg-red-600 text-white flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <h2 className="text-[14px] font-semibold">Reject Specific Activity</h2>
          <button onClick={onCancel} className="ml-auto text-white/70 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="text-[11px] text-gray-600">
            Rejecting <strong>{row?.title}</strong> — the focal person will see your reason and can fix &amp; resubmit.
          </div>
          <div>
            <label className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
              Rejection reason *
            </label>
            <textarea
              autoFocus
              rows={5}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Budget breakdown missing, dates overlap with existing activity..."
              className="w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-red-500 resize-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={onCancel} disabled={saving}
              className="text-[11px] px-4 py-2 border border-gray-300 text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSubmit(reason)}
              disabled={saving || !reason.trim()}
              className="text-[11px] px-4 py-2 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              {saving ? 'Rejecting...' : 'Confirm rejection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
