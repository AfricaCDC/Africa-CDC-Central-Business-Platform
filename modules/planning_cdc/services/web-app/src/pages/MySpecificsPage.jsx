/* eslint-disable max-lines, complexity --
 * Legacy page with baseline debt from pre-guardrails era. Scheduled refactor:
 * task #37. Do NOT add new violations; this pragma is a ceiling, not a green light.
 *
 * (cdc-rbm/no-inline-status-map cleared 2026-05-31: the status→count and
 *  status→sort-order maps are now derived from SPECIFIC_STATUSES_BY_ACTION;
 *  chip colours already came from getStatusConfig.)
 */
/**
 * MySpecificsPage — focal-person view of SPECIFIC_ACTIVITY rows they own.
 *
 * Before the 2026-04-08 approval workflow this page was read-only and only
 * listed APPROVED items that matched the user's division_code. Now it is
 * the focal person's workbench:
 *   - Lists every specific activity they created, in every state
 *     (DRAFT, IN_REVIEW, APPROVED, REJECTED) via the `mine=true` scope.
 *   - Lets them create new ones (header button → /my-specifics/new).
 *   - Lets them edit DRAFT / REJECTED / APPROVED (edit of APPROVED auto-
 *     bumps the row back to IN_REVIEW, enforced by the backend).
 *   - Lets them submit DRAFT / REJECTED for approval.
 *   - Lets them delete DRAFT (admin path for the rest).
 *   - Shows the rejection reason inline on REJECTED rows so they know why
 *     and can fix + resubmit.
 *
 * Per CLAUDE.md "Zero Hardcoded Values" the status chip colors come from
 * `STATUS_STYLES` / `getStatusConfig` in @rbm/lib/enums — never inline the
 * Tailwind classes per status.
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useQueryClient } from '@tanstack/react-query';
import { useMySpecificActivities } from '@/hooks/usePlanNodeQueries';
import api from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import { Loader2, Plus, Edit2, Send, XCircle, Eye, AlertTriangle, ChevronDown, Ban, Copy } from 'lucide-react';
import { nextPlanYear, copyPath } from './specific-activity/copyActivity';
import Modal from '@/components/shared/Modal';
import { toast } from 'sonner';
import { fmtBudgetCompact as fmt } from '@rbm/lib/formatters';
import { STATUSES, ACTIVITY_RISK_CONFIG, getStatusConfig } from '@rbm/lib/enums';
import SpecificsFilterBar from './specific-activity/SpecificsFilterBar';
import { useSpecificsFilters } from './specific-activity/hooks/useSpecificsFilters';
import { STATUS_ORDER, filterSpecifics, sortSpecifics, distinctOptions } from './specific-activity/specificsList';
import { usePermissions } from '@/hooks/usePermissions';
import { getErrorMessage } from '@/utils/errorMessage';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { usePlanningYear } from '@/contexts/PlanningYearContext';

const FILTER_TABS = [
  { key: 'ALL',       label: 'All' },
  { key: 'DRAFT',     label: 'Drafts' },
  { key: 'IN_REVIEW', label: 'In review' },
  { key: 'APPROVED',  label: 'Approved' },
  { key: 'REJECTED',  label: 'Rejected' },
  { key: 'CANCELLED', label: 'Cancelled' },
];


/**
 * "My specific activities" page. Lists T6 specific activities owned by the
 * current user with status filters and links to the create / edit form pages.
 *
 * @returns {JSX.Element}
 */
export default function MySpecificsPage() {
  const { user } = useAuth();
  const { activeCodes, activeDivision, loaded: divLoaded, divisions: myDivisions } = useActiveDivision();
  // Legacy users.division_code is NULL for multi-division-era assignments.
  const divCode = activeDivision?.code || myDivisions?.[0]?.code || user?.division_code;
  const navigate = useNavigate();
  const { planningYear: fiscalYear, years: planYears } = usePlanningYear();

  const queryClient = useQueryClient();
  const { data: raw, isLoading: rawLoading } = useMySpecificActivities(fiscalYear);
  const loading = rawLoading || !divLoaded;
  const { specifics: allSpecifics = [], broads: allBroads = [] } = raw || {};
  const broads = useMemo(() => {
    if (!divCode) return allBroads;
    return allBroads.filter(b => activeCodes.has(String(b.responsible_division_code || '').toUpperCase()));
  }, [allBroads, divCode, activeCodes]);
  const broadIds = useMemo(() => new Set(broads.map(b => b.id)), [broads]);
  const specifics = useMemo(() => {
    if (!divCode) return allSpecifics;
    return allSpecifics.filter(s =>
      broadIds.has(s.parent_id) ||
      activeCodes.has(String(s.responsible_division_code || '').toUpperCase())
    );
  }, [allSpecifics, broadIds, activeCodes, divCode]);
  const { filters, setFilter, clearAllFilters, activeFilterCount } = useSpecificsFilters();
  const fundingOptions = useMemo(() => distinctOptions(specifics, 'primary_funding_source'), [specifics]);


  // Per-row action-in-flight id, prevents double-clicks during network calls.
  const [actingId, setActingId] = useState(null);
  // Row waiting on a ConfirmDialog before we fire the cancel/delete call.
  // Replaces the banned window.confirm per CLAUDE.md UX rules.
  const [cancelConfirm, setCancelConfirm] = useState(null);
  const [naModal, setNaModal] = useState(null);
  const [naReason, setNaReason] = useState('');
  const [naSaving, setNaSaving] = useState(false);

  // Who can create a specific activity is governed by the RBAC matrix — NOT a
  // hardcoded role. Focal persons hold tasks:create:own; M&E holds
  // tasks:create:all (B-1, D-20260621-06). Any role an admin grants tasks:create
  // gets the button automatically.
  const { can } = usePermissions();
  const canCreateActivity = can('tasks', 'create');
  // « Copy to next year » once the next plan is loaded (D-20261105-14).
  const copyYear = canCreateActivity ? nextPlanYear(fiscalYear, planYears || []) : null;

  // ── Row actions ──────────────────────────────────────────────
  const handleSubmit = async (row) => {
    setActingId(row.id);
    try {
      await api.post(`/plan-nodes/specific-activity/${row.id}/submit`);
      toast.success(`${row.title} submitted for approval`);
      queryClient.invalidateQueries({ queryKey: ['plan-nodes', 'specific-activity'] });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Submit failed'));
    } finally {
      setActingId(null);
    }
  };

  // Cancel works for every status except CANCELLED itself. The backend
  // hard-deletes DRAFT rows (nothing to keep around) and flips everything
  // else to CANCELLED — kept in the table for the focal's history but
  // hidden from the live workplan, Gantt, dashboards and HOD review queue.
  // We open a ConfirmDialog first (no window.confirm).
  const askCancel = (row) => setCancelConfirm(row);

  const handleCancel = async () => {
    const row = cancelConfirm;
    setCancelConfirm(null);
    if (!row) return;
    const wasDraft = row.status === STATUSES.DRAFT;
    setActingId(row.id);
    try {
      await api.post(`/plan-nodes/specific-activity/${row.id}/cancel`);
      toast.success(wasDraft ? 'Draft deleted' : 'Activity cancelled');
      queryClient.invalidateQueries({ queryKey: ['plan-nodes', 'specific-activity'] });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Cancel failed'));
    } finally {
      setActingId(null);
    }
  };


  const handleMarkNA = async () => {
    if (!naModal || !naReason.trim()) return;
    setNaSaving(true);
    try {
      await api.post(`/reporting/activity-reports/${naModal.id}/not-applicable`, { reason: naReason.trim() });
      toast.success('Marked as not applicable');
      setNaModal(null);
      setNaReason('');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed'));
    } finally { setNaSaving(false); }
  };

  // ── Filtering & counts ───────────────────────────────────────
  const counts = useMemo(() => {
    const c = { ALL: specifics.length, ...Object.fromEntries(STATUS_ORDER.map(s => [s, 0])) };
    for (const s of specifics) {
      if (c[s.status] !== undefined) c[s.status] += 1;
    }
    return c;
  }, [specifics]);

  // Needs your action first (rejected, drafts, …), then the riskiest.
  const filtered = useMemo(() => sortSpecifics(filterSpecifics(specifics, filters)), [specifics, filters]);

  const totalBudget = filtered.reduce((s, sp) => s + Number(sp.budget_total_2026 || 0), 0);

  if (loading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'Specific Activities' }]}>
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#D97706]" />
        </div>
      </DashboardLayout>
    );
  }

  if (!divCode && !user?.division_code) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'Specific Activities' }]}>
        <div className="p-6 text-[11px] text-gray-500">No division assigned to your account.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/report' }, { label: 'Specific Activities' }]}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#D97706] text-white">
          <div className="px-6 py-5 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">
                  Specific Activities
                </span>
                <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-white/15">
                  {activeDivision?.code || user.division_code}
                </span>
              </div>
              <h1 className="text-[18px] font-semibold leading-snug">{activeDivision?.division_name || user.division_name}</h1>
              <p className="text-[11px] text-white/70 mt-1">
                Your proposed activities — drafts stay private until you submit.
              </p>
            </div>
            {canCreateActivity && (
              <Button
                variant="inverse"
                size="md"
                onClick={() => navigate('/my-specifics/new')}
                className="flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                New specific
              </Button>
            )}
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex items-center gap-6 text-[12px] text-white/70 flex-wrap">
            <span><strong className="text-white">{counts.ALL}</strong> total</span>
            <span><strong className="text-white">{counts.DRAFT}</strong> drafts</span>
            <span><strong className="text-white">{counts.IN_REVIEW}</strong> in review</span>
            <span><strong className="text-white">{counts.APPROVED}</strong> approved</span>
            <span><strong className="text-white">{counts.REJECTED}</strong> rejected</span>
            {totalBudget > 0 && (
              <span className="ml-auto text-white font-semibold">{fmt(totalBudget)}</span>
            )}
          </div>
        </div>

        {/* Search, status tabs and filters, all in the URL (D-20261105-05) */}
        <SpecificsFilterBar filters={filters} setFilter={setFilter} clearAllFilters={clearAllFilters}
          activeFilterCount={activeFilterCount} tabs={FILTER_TABS} counts={counts} fundingOptions={fundingOptions} />

        {/* Status legend */}
        <div className="bg-white border border-gray-200 border-t-0 px-5 py-2.5 flex items-center gap-4 flex-wrap">
          <span className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">Legend:</span>
          {[
            { status: 'DRAFT', desc: 'Saved but not submitted yet' },
            { status: 'IN_REVIEW', desc: 'Awaiting approval by the Responsible Person of the Business Unit' },
            { status: 'APPROVED', desc: 'Approved and active in the workplan' },
            { status: 'REJECTED', desc: 'Returned with comments — edit and resubmit' },
            { status: 'CANCELLED', desc: 'Withdrawn from the workplan' },
          ].map(({ status, desc }) => {
            const cfg = getStatusConfig(status);
            return (
              <div key={status} className="flex items-center gap-1.5">
                <span className={`text-[8px] font-semibold px-1.5 py-0.5 ${cfg.bg} ${cfg.text} border ${cfg.border}`}>{cfg.label}</span>
                <span className="text-[9px] text-gray-400">{desc}</span>
              </div>
            );
          })}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 border-t-0">
          {filtered.length === 0 ? (
            <div className="px-5 py-12 text-center text-[11px] text-gray-400">
              {filters.q || activeFilterCount > 0
                ? 'No activities match the current filters.'
                : 'You have not created any specific activity yet. Click "New specific" to start.'}
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] text-gray-400 uppercase border-b border-gray-100 bg-gray-50/50">
                  <th className="px-3 py-2 font-normal w-[100px]">Status</th>
                  <th className="px-3 py-2 font-normal w-[110px]">Code</th>
                  <th className="px-3 py-2 font-normal">Title</th>
                  <th className="px-3 py-2 font-normal w-[100px] text-right">Budget</th>
                  <th className="px-3 py-2 font-normal w-[140px] text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const cfg = getStatusConfig(s.status);
                  const canEdit = [STATUSES.DRAFT, STATUSES.REJECTED].includes(s.status);
                  const canSubmitRow = [STATUSES.DRAFT, STATUSES.REJECTED].includes(s.status);
                  const canCancel = s.status !== STATUSES.CANCELLED;
                  const cancelLabel = s.status === STATUSES.DRAFT ? 'Delete draft' : 'Cancel activity';
                  return (
                    <React.Fragment key={s.id}>
                      <tr className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                        <td className="px-3 py-2.5">
                          <span className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[9px] font-mono font-bold text-[#D97706]">
                          <span onClick={() => navigate(`/plan/node/${s.id}`)} className="hover:underline cursor-pointer">
                            {s.code || <span className="text-gray-300">—</span>}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-gray-800">
                          <span onClick={() => navigate(`/plan/node/${s.id}`)} className="hover:text-[#D97706] hover:underline cursor-pointer">
                            {s.title}
                          </span>
                          {ACTIVITY_RISK_CONFIG[s.risk_level] && (
                            <span className={`ml-2 inline-block px-1 py-0.5 text-[8px] font-semibold border ${ACTIVITY_RISK_CONFIG[s.risk_level].bg} ${ACTIVITY_RISK_CONFIG[s.risk_level].text} ${ACTIVITY_RISK_CONFIG[s.risk_level].border}`}>
                              {ACTIVITY_RISK_CONFIG[s.risk_level].label} risk
                            </span>
                          )}
                          {s.indicator_code && (
                            <span className="ml-2 inline-block px-1 py-0.5 text-[8px] font-mono bg-purple-50 text-purple-700 border border-purple-200">
                              {s.indicator_code}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] font-semibold text-[#D97706] text-right">
                          {fmt(s.budget_total_2026)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <ActionDropdown
                            onView={() => navigate(`/plan/node/${s.id}`)}
                            onEdit={canEdit ? () => navigate(`/my-specifics/${s.id}/edit`) : null}
                            onCopy={copyYear ? () => navigate(copyPath(s.id, copyYear)) : null}
                            copyLabel={`Copy to ${copyYear}`}
                            onSubmit={canSubmitRow ? () => handleSubmit(s) : null}
                            onSignalNA={s.status !== STATUSES.CANCELLED ? () => { setNaModal(s); setNaReason(''); } : null}
                            onCancel={canCancel ? () => askCancel(s) : null}
                            cancelLabel={cancelLabel}
                            loading={actingId === s.id}
                          />
                        </td>
                      </tr>
                      {s.status === STATUSES.REJECTED && s.rejection_reason && (
                        <tr className="bg-red-50/60 border-b border-red-100">
                          <td colSpan={5} className="px-3 py-2 text-[10px] text-red-700">
                            <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" />
                            <strong>Rejected:</strong> {s.rejection_reason}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>


        {/* Cancel confirmation — replaces the banned window.confirm. DRAFT
            rows are hard-deleted, everything else becomes CANCELLED. */}
        {naModal && (
          <Modal open title="Flag Ownership Dispute" onClose={() => setNaModal(null)} danger={false}>
            <div className="px-5 py-4 space-y-3">
              <p className="text-[11px] text-gray-600">
                You are flagging <strong>{naModal.code}</strong> — {naModal.title} as incorrectly assigned to your division. This notification will be sent to platform administrators for review and reassignment.
              </p>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Justification *</label>
                <textarea autoFocus value={naReason} onChange={e => setNaReason(e.target.value)}
                  placeholder="Explain why this activity does not fall under your division's mandate..."
                  className="w-full text-[11px] border border-gray-300 px-3 py-2 h-20 resize-none focus:outline-none focus:border-gray-500" />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
              <button onClick={() => setNaModal(null)} className="text-[11px] px-3 py-1.5 border border-gray-300 text-gray-500 hover:bg-white">Cancel</button>
              <button onClick={handleMarkNA} disabled={!naReason.trim() || naSaving}
                className="text-[11px] px-3 py-1.5 bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-50">
                {naSaving ? 'Saving...' : 'Confirm N/A'}
              </button>
            </div>
          </Modal>
        )}

        <ConfirmDialog
          open={!!cancelConfirm}
          title={cancelConfirm?.status === STATUSES.DRAFT ? 'Delete draft?' : 'Cancel this activity?'}
          description={
            cancelConfirm
              ? cancelConfirm.status === STATUSES.DRAFT
                ? `"${cancelConfirm.title}" will be permanently deleted. This cannot be undone.`
                : `"${cancelConfirm.title}" will be removed from the live workplan. Its history stays visible to you but it no longer counts as an active activity.`
              : ''
          }
          confirmLabel={cancelConfirm?.status === STATUSES.DRAFT ? 'Delete draft' : 'Cancel activity'}
          variant="danger"
          onClose={() => setCancelConfirm(null)}
          onConfirm={handleCancel}
        />
      </div>
    </DashboardLayout>
  );
}

/* ── Action dropdown with clear text labels ── */
function ActionDropdown({ onView, onEdit, onCopy, copyLabel, onSubmit, onSignalNA, onCancel, cancelLabel, loading }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (loading) return <Loader2 className="w-3 h-3 animate-spin text-[#D97706] mx-auto" />;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] px-2.5 py-1 border border-gray-300 text-gray-600 hover:bg-gray-50"
      >
        Actions <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 shadow-sm min-w-[160px]">
          <button onClick={() => { onView(); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-[11px] text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <Eye className="w-3 h-3 text-gray-400" /> View details
          </button>
          {onEdit && (
            <button onClick={() => { onEdit(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-[11px] text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <Edit2 className="w-3 h-3 text-gray-400" /> Edit
            </button>
          )}
          {onCopy && (
            <button onClick={() => { onCopy(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-[11px] text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <Copy className="w-3 h-3 text-gray-400" /> {copyLabel}
            </button>
          )}
          {onSubmit && (
            <button onClick={() => { onSubmit(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-[11px] text-[#D97706] hover:bg-orange-50 flex items-center gap-2">
              <Send className="w-3 h-3" /> Submit for approval
            </button>
          )}
          {onSignalNA && (
            <button onClick={() => { onSignalNA(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-[11px] text-gray-500 hover:bg-gray-50 flex items-center gap-2">
              <Ban className="w-3 h-3" /> Flag ownership dispute
            </button>
          )}
          {onCancel && (
            <>
              <div className="border-t border-gray-100" />
              <button onClick={() => { onCancel(); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-[11px] text-red-600 hover:bg-red-50 flex items-center gap-2">
                <XCircle className="w-3 h-3" /> {cancelLabel || 'Cancel'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
