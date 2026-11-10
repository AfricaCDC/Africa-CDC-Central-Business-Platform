/* eslint-disable max-lines, complexity, no-unused-vars, no-restricted-syntax --
 * Legacy form page with baseline debt from pre-guardrails era. Scheduled
 * refactor: task #41 — extract URL strings to src/services/specificActivity.api.js,
 * and replace inline role-group check with rbacService.checkPermission (P-02).
 * Do NOT add new violations; this pragma is a ceiling, not a green light.
 * (cdc-rbm/no-api-url-in-component dropped from the list 2026-07-23: the rule
 * no longer fires here and the unused directive itself failed lint-staged.)
 */
/**
 * Full-page form for creating / editing a Specific Activity.
 * Replaces the modal approach — too many fields for a modal.
 *
 * Routes:
 *   /my-specifics/new        → create mode
 *   /my-specifics/:id/edit   → edit mode (loads existing data)
 */

import React, { useEffect, useState, useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useQuery } from '@tanstack/react-query';
import { useSpecificActivityData } from '@/hooks/usePlanNodeQueries';
import api from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import { toast } from 'sonner';
import { Loader2, Save, Send, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SearchSelect from '@/components/shared/SearchSelect';
import MultiSearchSelect from '@/components/shared/MultiSearchSelect';
import Combobox from '@/components/shared/Combobox';
import {
  ACTIVITY_TYPE_OPTIONS,
  ACTIVITY_TYPES,
  ACTIVITY_RISK_OPTIONS,
  BUDGETING_ARRANGEMENT_OPTIONS,
  REFERENCE_TYPES,
  REQUIRED_SPECIFIC_ACTIVITY_FIELDS,
  isActivityFieldProvided,
  STATUSES,
  RBAC_SCOPES,
} from '@rbm/lib/enums';
import { RBAC_MODULES, RBAC_ACTIONS } from '@rbm/lib/rbac';
import { useReferenceValues } from '@/hooks/useReferenceQueries';
import { LOCATION_OPTIONS } from '@/utils/locationOptions';
import { formatLocations } from '@rbm/lib/countries';
import { quarterlyVsAnnualWarning } from '@/utils/quarterSums';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import ComplexityScreeningSection from './specific-activity/ComplexityScreeningSection';
import CostLinesSection from './specific-activity/CostLinesSection';
import { useActivityPlanningForm } from './specific-activity/hooks/useActivityPlanningForm';
import { createPlaceCopies, titleForPlace } from './specific-activity/placeCopies';
import { scopeBroads, indicatorsForBroad, countryOfficeOf } from './specific-activity/planningScope';
import BroadBudgetCodes from './specific-activity/BroadBudgetCodes';
import { formFromDetail, copyFormFrom } from './specific-activity/copyActivity';

const YES_NO = [{ value: '1', label: 'Yes' }, { value: '0', label: 'No' }];

// Human labels for the H-5 required fields (UI copy — drives the "Please
// complete: …" hint and the canSave gate; the field list itself is the shared
// single source REQUIRED_SPECIFIC_ACTIVITY_FIELDS from @rbm/lib/enums).
const REQUIRED_FIELD_LABELS = {
  activity_type: 'Activity and mission type',
  implementation_at_rcc: 'Implementation at RCC',
  budgeting_arrangement: 'Budgeting arrangement',
  primary_funding_source: 'Primary funding source',
  budget_main: 'Total cost of activity',
};

const EMPTY = {
  title: '', description: '', parent_id: '', linked_indicator_id: '', focal_user_id: '',
  activity_type: '', risk_level: '', implementation_at_rcc: '', secondary_division_codes: [],
  responsible_division_code: '',
  budgeting_arrangement: '', primary_funding_source: '', other_funding_source: '',
  grant_name: '', budget_main: '', q1_budget: '', q2_budget: '', q3_budget: '', q4_budget: '',
  locations: [], start_date: '', end_date: '', is_operational: '',
};

export default function SpecificActivityFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  // « Copy to next year » (D-20261105-14): a new activity prefilled from ?copy=<id>.
  const [searchParams] = useSearchParams();
  const copyId = isEdit ? null : searchParams.get('copy');
  const sourceId = id || copyId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getScope } = usePermissions();
  // Admin = may create for any unit (tasks:create at scope all): the API creates
  // their activity approved. Focal persons hold tasks:create at scope own and
  // go through Save draft / Submit.
  const isAdmin = getScope(RBAC_MODULES.TASKS, RBAC_ACTIONS.CREATE) === RBAC_SCOPES.ALL;
  const { planningYear: fiscalYear } = usePlanningYear();

  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Complexity screening + cost lines (D-20261026-01), saved after the activity.
  // Several places = one activity per place, each with the cost lines of its place
  // (D-20261028-01). A procurement has no location.
  const isProcurement = form.activity_type === ACTIVITY_TYPES.PROCUREMENT;
  const places = isProcurement ? [] : form.locations;
  const multi = places.length > 1;
  const plan = useActivityPlanningForm(sourceId || null, multi ? places : []);
  const budgetMain = multi ? plan.totalFor(places[0]) : form.budget_main;

  const { data: refData, isLoading: refLoading } = useSpecificActivityData(fiscalYear);
  // Suggestion lists for the funding-source / grant comboboxes (free text on top).
  const { data: fundingSourceOptions = [] } = useReferenceValues(REFERENCE_TYPES.FUNDING_SOURCE);
  const { data: grantOptions = [] } = useReferenceValues(REFERENCE_TYPES.GRANT);

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['plan', 'node', sourceId],
    queryFn: () => api.get(`/plan-nodes/${sourceId}`).then(r => r.data),
    enabled: !!sourceId,
    staleTime: 60_000,
  });

  const loading = refLoading || (!!sourceId && detailLoading) || plan.isLoading;
  // An edited activity keeps its broad and indicator in the lists; a copy picks new ones.
  const keptBroadId = isEdit ? detail?.parent_id : undefined;
  const keptIndicatorId = isEdit ? detail?.linked_indicator_id : undefined;

  // Only the broads of the user's BU, then only the T3/T4 of the chosen broad
  // (D-20261028-03). The BU is the one picked in the BU switcher (all the
  // user's BUs when none is picked); admins included. A country office picks
  // among every broad of the year (D-20261105-07).
  const { activeCodes, activeDivision } = useActiveDivision();
  const office = useMemo(() => countryOfficeOf(activeDivision), [activeDivision]);
  const myCodes = useMemo(() => (activeCodes?.size ? activeCodes
    : new Set(user?.division_code ? [String(user.division_code).toUpperCase()] : [])), [activeCodes, user?.division_code]);
  const { broads, allIndicators, divisions } = useMemo(() => {
    if (!refData) return { broads: [], allIndicators: [], divisions: [] };
    const { broads: allBroads, t3 = [], t4 = [], divisions: allDivisions } = refData;
    const offered = office ? allBroads : scopeBroads(allBroads, myCodes, keptBroadId);
    return { broads: offered, allIndicators: [...t3, ...t4], divisions: allDivisions };
  }, [refData, myCodes, office, keptBroadId]);
  const selectedBroad = broads.find(b => String(b.id) === String(form.parent_id));
  const indicators = useMemo(() => indicatorsForBroad({
    indicators: allIndicators, codes: myCodes, keepId: keptIndicatorId, broad: selectedBroad,
  }), [allIndicators, selectedBroad, myCodes, keptIndicatorId]);

  useEffect(() => {
    if (!detail) return;
    setForm(isEdit ? formFromDetail(detail) : copyFormFrom(detail));
  }, [detail, isEdit]);

  // New activity of a country office: carried by the office, in its country.
  useEffect(() => {
    if (isEdit || !office) return;
    setForm(p => ({
      ...p,
      responsible_division_code: p.responsible_division_code || office.code,
      locations: p.locations.length || !office.country ? p.locations : [office.country],
    }));
  }, [isEdit, office]);

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setError(null); };

  // Focal person — eligible staff of the activity's main division.
  const focalDivision = form.responsible_division_code || user?.division_code || '';
  const { data: divisionStaff = [] } = useQuery({
    queryKey: ['division-staff', focalDivision],
    // The api interceptor already unwraps { success, data }.
    queryFn: () => api.get(`/plan-nodes/division-staff/${focalDivision}`).then(r => r.data || []),
    enabled: !!focalDivision,
    staleTime: 60 * 60 * 1000,
  });
  const staffOptions = useMemo(() => divisionStaff.map(u => ({
    value: u.id,
    label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
    sub: u.email,
  })), [divisionStaff]);

  // H-5: required fields gate save (both "Save draft" and "Save & submit").
  // Same list + per-field rule as the backend (single source @rbm/lib/enums).
  const gateForm = { ...form, budget_main: String(budgetMain) };
  const missingRequired = REQUIRED_SPECIFIC_ACTIVITY_FIELDS.filter(
    (f) => !isActivityFieldProvided(f, gateForm[f]),
  );
  const missingLabels = missingRequired.map((f) => REQUIRED_FIELD_LABELS[f] || f);
  const canSave = Boolean(form.title.trim()) && Boolean(form.parent_id) && missingRequired.length === 0 && plan.problems.length === 0;

  // Non-blocking coherence check (VH-2): warn when the quarterly cost breakdown
  // doesn't add up to the total cost of the activity. Advisory only.
  const budgetSumWarning = quarterlyVsAnnualWarning(
    [form.q1_budget, form.q2_budget, form.q3_budget, form.q4_budget],
    form.budget_main,
    { unit: 'USD' },
  );

  const buildPayload = () => ({
    // One place per activity: the first place stays here, the others get their own activity.
    title: multi ? titleForPlace(form.title.trim(), places[0]) : form.title.trim(),
    description: form.description.trim() || null,
    parent_id: Number(form.parent_id), responsible_division_code: form.responsible_division_code || user?.division_code,
    linked_indicator_id: form.linked_indicator_id ? Number(form.linked_indicator_id) : null,
    focal_user_id: form.focal_user_id ? Number(form.focal_user_id) : null,
    activity_type: form.activity_type || null,
    risk_level: form.risk_level || null,
    implementation_at_rcc: form.implementation_at_rcc !== '' ? Number(form.implementation_at_rcc) : null,
    secondary_division_codes: form.secondary_division_codes,
    budgeting_arrangement: form.budgeting_arrangement || null,
    primary_funding_source: form.primary_funding_source || null,
    other_funding_source: form.other_funding_source || null,
    grant_name: form.grant_name || null,
    budget_main: parseFloat(budgetMain) || 0, budget_total_2026: parseFloat(budgetMain) || 0,
    q1_budget: parseFloat(form.q1_budget) || 0, q2_budget: parseFloat(form.q2_budget) || 0,
    q3_budget: parseFloat(form.q3_budget) || 0, q4_budget: parseFloat(form.q4_budget) || 0,
    location: formatLocations(multi ? [places[0]] : places),
    start_date: form.start_date || null, end_date: form.end_date || null,
    is_operational: form.is_operational !== '' ? Number(form.is_operational) : null,
    fiscal_year: fiscalYear,
  });

  const backPath = isAdmin ? '/tasks' : '/my-specifics';

  // Several places = several activities (D-20261028-01).
  const copyToOtherPlaces = async (submit) => {
    if (!multi) return;
    const others = places.slice(1);
    const base = { ...buildPayload(), title: form.title.trim(), q1_budget: 0, q2_budget: 0, q3_budget: 0, q4_budget: 0 };
    const { created, failed } = await createPlaceCopies({
      payloadFor: (place) => ({ ...base, budget_main: plan.totalFor(place), budget_total_2026: plan.totalFor(place) }),
      places: others, savePlanning: plan.save, submit,
    });
    if (created.length) toast.success(`${created.length} more activit${created.length > 1 ? 'ies' : 'y'} created: ${others.filter(p => !failed.some(f => f.place === p)).join(', ')}`);
    failed.forEach(f => toast.error(`${f.place}: ${f.message}`));
  };

  const handleSave = async (andSubmit) => {
    if (!canSave) {
      if (!form.title.trim() || !form.parent_id) {
        setError('Activity name and parent broad activity are required');
      } else if (plan.problems.length) {
        setError(`Please ${plan.problems.join(' and ')}`);
      } else {
        setError(`Please complete the required field(s): ${missingLabels.join(', ')}`);
      }
      return;
    }
    if (andSubmit && !form.focal_user_id) {
      setError('A focal person is required to submit for approval');
      return;
    }
    setSaving(true); setError(null);
    try {
      let saved;
      if (isEdit) {
        const { data } = await api.patch(`/plan-nodes/specific-activity/${id}`, buildPayload());
        saved = data;
      } else {
        const { data } = await api.post('/plan-nodes/specific-activity', buildPayload());
        saved = data;
      }
      try {
        await plan.save(saved.id, multi ? places[0] : undefined);
      } catch {
        // The activity is saved: reopen it in edit mode so a retry does not create it twice.
        toast.error('The activity was saved, but not its screening and cost lines. Check them and save again.');
        if (!isEdit) navigate(`/my-specifics/${saved.id}/edit`, { replace: true });
        return;
      }
      // Editing an approved activity already sends it back to review.
      if (andSubmit && !isAdmin && saved.status !== STATUSES.IN_REVIEW) {
        await api.post(`/plan-nodes/specific-activity/${saved.id}/submit`);
        toast.success('Submitted for approval');
      } else {
        toast.success(isEdit ? 'Saved' : 'Draft created');
      }
      await copyToOtherPlaces(andSubmit && !isAdmin);
      navigate(backPath);
    } catch (err) {
      // Canonical envelope is { success:false, message, code }; fall back to the
      // deprecated { error: { message } } shape and finally the axios message.
      setError(
        err.response?.data?.message
        || err.response?.data?.error?.message
        || err.response?.data?.error
        || err.message
        || 'Save failed',
      );
    } finally { setSaving(false); }
  };

  // Hide alias rows in the form (alias_of !== null) so the admin can't
  // pick a duplicate — the canonical division already covers it.
  const divOpts = useMemo(() => divisions.filter(d => !d.alias_of).map(d => ({ value: d.code, label: d.division_name, sub: d.code })), [divisions]);

  if (loading) return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Specific Activities', path: backPath }, { label: isEdit ? 'Edit' : 'New' }]}>
      <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-[#D97706]" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'Specific Activities', path: backPath }, { label: isEdit ? 'Edit Activity' : 'New Activity' }]}>
      <div className="max-w-4xl mx-auto py-4 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-[11px] text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <h1 className="text-[16px] font-semibold text-[#1A5632]">{isEdit ? 'Edit Specific Activity' : 'New Specific Activity'}</h1>
          </div>
          {isAdmin && isEdit ? (
            <select
              value={form.responsible_division_code}
              onChange={e => { set('responsible_division_code', e.target.value); set('focal_user_id', ''); }}
              className="text-[10px] font-semibold border border-gray-300 px-2 py-1 bg-white text-gray-700 w-full sm:w-auto max-w-full"
            >
              <option value="">— Division —</option>
              {divisions.filter(d => !d.alias_of).map(d => <option key={d.code} value={d.code}>{d.code} — {d.division_name}</option>)}
            </select>
          ) : user?.division_name ? (
            <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-1">{user.division_code} — {user.division_name}</span>
          ) : null}
        </div>

        {error && <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 px-4 py-2">{error}</div>}

        {copyId && detail && (
          <div className="text-[11px] text-[#1A5632] bg-[#1A5632]/5 border border-[#1A5632]/30 px-4 py-2">
            Copy of {detail.code || detail.title} ({detail.fiscal_year}). Choose the broad activity and the indicator of {fiscalYear}. Nothing is saved until you save.
          </div>
        )}

        {/* Section 1: Activity Info */}
        <Section title="Activity Information">
          {/* The broad activity comes first: it scopes the T3/T4 list (D-20261028-03). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Row label="Parent Broad Activity *">
              <SearchSelect value={form.parent_id || null} onChange={v => { set('parent_id', v || ''); set('linked_indicator_id', ''); }}
                placeholder="— Select —"
                options={broads.map(b => ({ value: b.id, label: `${b.code} — ${(b.title || '').slice(0, 60)}`, sub: b.responsible_division_code }))} />
            </Row>
            <Row label="Linked Indicator (T3/T4)">
              <SearchSelect value={form.linked_indicator_id || null} onChange={v => set('linked_indicator_id', v || '')}
                placeholder="— None —" allowClear
                options={indicators.map(i => ({ value: i.id, label: `T${i.tier_id} · ${i.code} — ${(i.title || '').slice(0, 50)}` }))} />
            </Row>
          </div>
          {selectedBroad && (
            <Row label="Budget code (from the broad activity)">
              <BroadBudgetCodes codes={selectedBroad.budget_codes} />
            </Row>
          )}
          <Row label="Specific Activity name *">
            <input value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Name of the activity" className={INPUT} />
          </Row>
          <Row label="Description">
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="One or two sentences describing concisely what the activity is about"
              className={`${INPUT} h-20 resize-none`} />
          </Row>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Row label="Activity and mission type *">
              <SearchSelect value={form.activity_type || null} onChange={v => set('activity_type', v || '')}
                placeholder="—" options={ACTIVITY_TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))} allowClear />
            </Row>
            <Row label="Implementation at RCC *">
              <SearchSelect value={form.implementation_at_rcc || null} onChange={v => set('implementation_at_rcc', v || '')}
                placeholder="—" options={YES_NO} allowClear />
            </Row>
            <Row label="Is this an operational activity?">
              <SearchSelect value={form.is_operational || null} onChange={v => set('is_operational', v || '')}
                placeholder="—" options={YES_NO} allowClear />
            </Row>
          </div>
          {/* Optional; sorts and filters the Specific Activities list (D-20261105-05). */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Row label="Risk level">
              <SearchSelect value={form.risk_level || null} onChange={v => set('risk_level', v || '')}
                placeholder="— Not assessed —" options={ACTIVITY_RISK_OPTIONS} allowClear />
              <p className="mt-1 text-[10px] text-gray-500">How likely the activity is to be delayed or not delivered.</p>
            </Row>
          </div>
          <Row label="Secondary responsible divisions/units">
            <MultiSearchSelect values={form.secondary_division_codes} onChange={v => set('secondary_division_codes', v)}
              placeholder="— Add a division —" options={divOpts.filter(d => d.value !== focalDivision)} />
          </Row>
          <Row label="Focal person (staff of the division) *">
            <SearchSelect value={form.focal_user_id || null} onChange={v => set('focal_user_id', v || '')}
              placeholder={focalDivision ? '— Select staff —' : '— Select a division first —'}
              options={staffOptions} disabled={!focalDivision} allowClear />
          </Row>
        </Section>

        {/* Location before Funding: several places = one activity and one budget per place (D-20261028-01). */}
        {!isProcurement && (
          <Section title="Location">
            <Row label="Location">
              <MultiSearchSelect values={form.locations} onChange={v => set('locations', v)}
                placeholder="— Add a place —" options={LOCATION_OPTIONS} />
              <p className="mt-1 text-[10px] text-gray-500">
                Optional. Several places? One activity is created per place, named « activity — place », each with its own cost lines below.
              </p>
            </Row>
          </Section>
        )}

        {/* Section 2: Funding */}
        <Section title="Funding & Budget">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Row label="Budgeting arrangement *">
              <SearchSelect value={form.budgeting_arrangement || null} onChange={v => set('budgeting_arrangement', v || '')}
                placeholder="—" options={BUDGETING_ARRANGEMENT_OPTIONS} allowClear />
            </Row>
            <Row label="Primary funding source *">
              <Combobox value={form.primary_funding_source} onChange={v => set('primary_funding_source', v)}
                options={fundingSourceOptions} placeholder="Select or type a funding source" />
            </Row>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Row label="Other funding source">
              <Combobox value={form.other_funding_source} onChange={v => set('other_funding_source', v)}
                options={fundingSourceOptions} placeholder="Optional — select or type" />
            </Row>
            <Row label="Grant name">
              <Combobox value={form.grant_name} onChange={v => set('grant_name', v)}
                options={grantOptions} placeholder="Select or type a grant name" />
            </Row>
          </div>
          <Row label="Total cost of activity (USD) *">
            {multi ? (
              <p className="text-[11px] text-gray-600">Several places: the total of each activity is the sum of its place&apos;s cost lines below.</p>
            ) : (
              <input type="number" min="0" step="100" value={form.budget_main}
                onChange={e => set('budget_main', e.target.value)} className={INPUT} />
            )}
          </Row>
          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-2">Quarterly cost breakdown (USD)</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {['q1_budget', 'q2_budget', 'q3_budget', 'q4_budget'].map((k, idx) => (
                <div key={k}>
                  <div className="text-[9px] text-gray-400 mb-1">Q{idx + 1} {fiscalYear}</div>
                  <input type="number" min="0" step="100" value={form[k]} onChange={e => set(k, e.target.value)} className={INPUT} />
                </div>
              ))}
            </div>
            {budgetSumWarning && (
              <div role="alert" className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2">
                ⚠ {budgetSumWarning} You can still save — this is only a consistency check.
              </div>
            )}
          </div>
          <CostLinesSection lines={plan.lines} onChange={plan.setLines} total={plan.total}
            budget={form.budget_main} onUseTotal={(t) => set('budget_main', String(t))}
            places={multi ? places : []} totalFor={plan.totalFor} />
        </Section>

        <ComplexityScreeningSection value={plan.screening} onChange={plan.setScreening} />

        {/* Required-field hint (H-5) — explains why Save is disabled */}
        {form.title.trim() && form.parent_id && (missingLabels.length > 0 || plan.problems.length > 0) && (
          <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2">
            Required before saving: {[...missingLabels, ...plan.problems].join(', ')}.
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <Button variant="secondary" size="md" onClick={() => navigate(backPath)}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <Button variant="primary" size="md" onClick={() => handleSave(false)} disabled={saving || !canSave}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
              </Button>
            ) : (
              <>
                {/* Save draft + Save & submit kept inline — orange (#D97706) is the
                    approval-flow accent and isn't part of the primitive variants.
                    Migrate when D-20260416-12 follow-up adds an `accent`/`warning`
                    fill variant. */}
                <button onClick={() => handleSave(false)} disabled={saving || !canSave}
                  className="text-[11px] px-4 py-2 border border-gray-400 text-gray-700 hover:bg-gray-100 disabled:opacity-50 flex items-center gap-1.5">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save draft
                </button>
                <button onClick={() => handleSave(true)} disabled={saving || !canSave}
                  className="text-[11px] px-4 py-2 bg-[#D97706] text-white hover:bg-[#B45309] disabled:opacity-50 flex items-center gap-1.5">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Save &amp; submit for approval
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

const INPUT = 'w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#D97706]';

function Section({ title, children }) {
  return (
    <div className="border border-gray-200 bg-white">
      <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{label}</label>
      {children}
    </div>
  );
}
