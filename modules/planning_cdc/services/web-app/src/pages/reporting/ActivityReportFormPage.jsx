import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { STATUSES, STATUS_COLORS } from '@rbm/lib/enums';
import { usePermissions } from '@/hooks/usePermissions';
import { RBAC_MODULES, RBAC_ACTIONS } from '@rbm/lib/rbac';
import { useActivityReportForm, useSaveActivityReport, useSubmitActivityReport, useApproveActivityReportFromForm, useReportingPeriods } from './hooks/useReportingQueries';
import { resolveQuarter, openPeriodFor } from './activity-report/reportingQuarter';
import ReportingQuarterNotice from './activity-report/ReportingQuarterNotice';
import { EMPTY_FORM, formFromData, buildPayload, listMissingForSubmit } from './activity-report/reportTemplate';
import ReportHeader from './activity-report/ReportHeader';
import ReportBackground from './activity-report/ReportBackground';
import ReportEditView from './activity-report/ReportEditView';
import ReportReadView from './activity-report/ReportReadView';
import ReportSignOff from './activity-report/ReportSignOff';
import PreparerHistory from './activity-report/PreparerHistory';
import DeleteDraftButton from './activity-report/DeleteDraftButton';
import ReportActions from './activity-report/ReportActions';

const BASE_CRUMBS = [{ label: 'Home', path: '/report' }, { label: 'Activity Report', path: '/activity-report' }];
const LOCKED_STATUSES = [STATUSES.SUBMITTED, STATUSES.APPROVED];

const errorMessage = (err) => err?.response?.data?.message || err?.message || 'Failed to save';

const statusStyle = (status) => STATUS_COLORS[status] || STATUS_COLORS[STATUSES.DRAFT];

function PageState({ isLoading }) {
  return (
    <DashboardLayout breadcrumbs={[...BASE_CRUMBS, { label: isLoading ? 'Loading...' : 'Not Found' }]}>
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-[#D97706]" />
        </div>
      ) : (
        <div className="p-6 text-[11px] text-gray-500">Activity not found.</div>
      )}
    </DashboardLayout>
  );
}

/** Display name of the signed-in user, for "Prepared by" before the first save. */
const displayName = (user) => user?.full_name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || '';

function toStaffOption(s) {
  const name = s.fullName || s.name || `${s.fname || s.firstName || ''} ${s.lname || s.lastName || ''}`.trim();
  return { value: name, label: name, sub: s.division_name || s.division || s.department || '' };
}

/**
 * Period the report belongs to. Edit mode reads it from the report; create
 * mode from the URL and the activity's own plan year.
 */
function resolvePeriod(data, searchParams, periods) {
  const report = data?.report || {};
  const fiscalYear = String(report.fiscal_year || data?.activity?.fiscal_year || new Date().getFullYear());
  // An existing report keeps its quarter; a new one follows ?q=, else the open
  // reporting window, else the calendar (reportingQuarter.js).
  return { quarter: report.quarter || resolveQuarter(searchParams.get('q'), periods, fiscalYear), fiscalYear };
}

/**
 * Activity report, create and edit, following the official Africa CDC
 * Activity Reporting Template (D-20261001-01). Container only: the template
 * sections live in ./activity-report/.
 * @returns {JSX.Element}
 * @example <Route path="/activity-report/:activityId/new" element={<ActivityReportFormPage />} />
 */
export default function ActivityReportFormPage() {
  const { activityId, reportId: reportIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can, getScope } = usePermissions();

  const { data, isLoading } = useActivityReportForm({ activityId, reportId: reportIdParam });
  const saveMut = useSaveActivityReport();
  const submitMut = useSubmitActivityReport();
  const approveMut = useApproveActivityReportFromForm();

  const activity = data?.activity;
  const { data: periods } = useReportingPeriods();
  const { quarter, fiscalYear } = resolvePeriod(data, searchParams, periods);
  const staffOptions = useMemo(() => (data?.staff || []).map(toStaffOption), [data?.staff]);
  const [createdId, setCreatedId] = useState(null);
  const reportId = reportIdParam ? parseInt(reportIdParam, 10) : createdId;

  const [form, setForm] = useState(EMPTY_FORM);
  const [formReady, setFormReady] = useState(false);
  // Verification files attached to this report, reported by VerificationUpload.
  // In create mode no report exists yet, so it stays 0 until the first save.
  const [evidenceCount, setEvidenceCount] = useState(0);

  // Initialise the form once from query data (not data-fetching).
  useEffect(() => {
    if (!data || formReady) return;
    setForm(formFromData(data.activity, data.report));
    setFormReady(true);
  }, [data, formReady]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const applyStatus = (status) => setForm((p) => ({ ...p, status: status ?? p.status }));

  const handleSave = async (submitAfter) => {
    try {
      const payload = buildPayload(form, { activityId, quarter, fiscalYear, activity });
      const saved = (await saveMut.mutateAsync({ reportId, payload })).data || {};
      if (!reportId && saved.id) {
        setCreatedId(saved.id);
        navigate(`/activity-report/${activityId}/report/${saved.id}`, { replace: true });
      }
      const savedId = saved.id || reportId;
      if (!submitAfter) { applyStatus(saved.status); toast.success('Saved'); return; }
      if (!savedId) {
        // Saved, but the response carried no id to submit — stay on the page.
        applyStatus(saved.status);
        toast.error('Saved, but could not submit — reopen the report to submit');
        return;
      }
      const submitted = await submitMut.mutateAsync(savedId);
      applyStatus(submitted.data.status);
      toast.success('Report submitted');
      setTimeout(() => navigate('/activity-report'), 800);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const handleApprove = async () => {
    try {
      await approveMut.mutateAsync(reportId);
      toast.success('Report approved');
      applyStatus(STATUSES.APPROVED);
    } catch { toast.error('Approval failed'); }
  };

  if (isLoading || !activity) return <PageState isLoading={isLoading} />;

  const status = statusStyle(form.status);
  const isLocked = LOCKED_STATUSES.includes(form.status);

  return (
    <DashboardLayout breadcrumbs={[...BASE_CRUMBS, { label: activity.code || 'Report' }]}>
      <ReportHeader activity={activity} quarter={quarter} fiscalYear={fiscalYear} status={status} />
      <ReportingQuarterNotice quarter={quarter} fiscalYear={fiscalYear} openPeriod={openPeriodFor(periods, fiscalYear)} />
      <ReportBackground activity={activity} fiscalYear={fiscalYear} />

      <div className="py-4 space-y-6 px-6">
        {saveMut.error && (
          <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 px-4 py-2">{errorMessage(saveMut.error)}</div>
        )}

        {isLocked
          ? <ReportReadView form={form} activity={activity} reportId={reportId} fiscalYear={fiscalYear} />
          : (
            <ReportEditView
              form={form} set={set} activity={activity} staffOptions={staffOptions}
              reportId={reportId} quarter={quarter} fiscalYear={fiscalYear} onEvidenceChange={setEvidenceCount}
            />
          )}

        <ReportSignOff report={data.report} currentUserName={displayName(user)} />
        <PreparerHistory
          report={data.report}
          canChange={getScope(RBAC_MODULES.ACTIVITY_REPORT, RBAC_ACTIONS.APPROVE) === 'all'}
        />

        <ReportActions
          isReviewMode={can('activity_report', 'approve') && form.status === STATUSES.SUBMITTED}
          isLocked={isLocked}
          statusLabel={status.label}
          missing={listMissingForSubmit(form, evidenceCount)}
          hasReport={Boolean(reportId)}
          isSaving={saveMut.isPending}
          isSubmitting={submitMut.isPending}
          isApproving={approveMut.isPending}
          onCancel={() => navigate('/activity-report')}
          onSave={() => handleSave(false)}
          onSubmit={() => handleSave(true)}
          onApprove={handleApprove}
        />
        <DeleteDraftButton
          report={data.report}
          user={user}
          isAdmin={getScope(RBAC_MODULES.ACTIVITY_REPORT, RBAC_ACTIONS.CREATE) === 'all'}
          onDeleted={() => navigate('/activity-report')}
        />
      </div>
    </DashboardLayout>
  );
}
