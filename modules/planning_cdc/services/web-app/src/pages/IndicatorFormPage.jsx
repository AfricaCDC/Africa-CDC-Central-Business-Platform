/* eslint-disable max-lines, complexity, no-unused-vars, no-restricted-syntax --
 * Legacy form page with baseline debt from pre-guardrails era. Scheduled
 * refactor: task #41 — extract URL strings to src/services/indicator.api.js +
 * replace INDICATOR_TYPE_MAP with ENTITY_TYPES import.
 * Do NOT add new violations; this pragma is a ceiling, not a green light.
 */
/**
 * Full-page form for creating / editing a PIRS indicator (T3/T4).
 * Replaces the modal — per CLAUDE.md all forms are dedicated pages.
 *
 * Routes:
 *   /pirs/new         → create mode
 *   /pirs/:id/edit    → edit mode
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import SearchSelect from '@/components/shared/SearchSelect';
import { usePillars } from '@/hooks/usePillars';
import api from '@/services/api';
import { Loader2, Save, ArrowLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fyToYear } from '@rbm/lib/fiscalYear';
import { usePlanningYear } from '@/contexts/PlanningYearContext';
import { quarterlyVsAnnualWarning } from '@/utils/quarterSums';

const TIER_OPTIONS = [
  { value: 3, label: 'T3 — Short-term Outcome' },
  { value: 4, label: 'T4 — Output' },
];
const CATEGORY_OPTIONS = [
  { value: 'Global Indicator', label: 'Global Indicator' },
  { value: 'Africa-CDC Wide Indicator', label: 'Africa-CDC Wide Indicator' },
  { value: 'Africa-CDC Wide', label: 'Africa-CDC Wide' },
  { value: 'AU+AfCDC Wide Indicator', label: 'AU+AfCDC Wide Indicator' },
  { value: 'Donor-required Indicator', label: 'Donor-required Indicator' },
];
const FREQUENCY_OPTIONS = [
  { value: 'Monthly', label: 'Monthly' },
  { value: 'Quarterly', label: 'Quarterly' },
  { value: 'Semi-Annual', label: 'Semi-Annual' },
  { value: 'Annual', label: 'Annual' },
];
const INDICATOR_TYPE_MAP = { 3: 'Outcome', 4: 'Output' };
const INPUT = 'w-full text-[12px] border border-gray-300 px-3 py-2 focus:outline-none focus:border-[#1A5632]';

export default function IndicatorFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { fyNum: currentFyNum } = usePlanningYear();

  const [form, setForm] = useState({
    indicator_name: '', indicator_code: '', tier_id: '', category: '',
    definition: '', baseline_value: '', baseline_source: '',
    target_fy1: '', target_fy2: '', target_fy3: '', target_fy4: '', target_fy5: '',
    q1_target: '', q2_target: '', q3_target: '', q4_target: '',
    overall_target: '', data_source: '', data_collection_method: '',
    disaggregation_ids: [],
    reporting_frequency: '', reporting_level: '',
    numerator: '', denominator: '', disaggregation: '',
    accountable_division_id: '',
    contributing_divisions: [],
    parent_id: '',
    unit_of_measure_id: '',
    is_big_ticket: false,
    pillar_id: '',
    active_periods: [], // array of { fy: 1..5, q: 1..4 }
  });
  const [saving, setSaving] = useState(false);
  const { data: pillars = [] } = usePillars();
  const pillarOptions = useMemo(
    () => pillars.map((p) => ({ value: p.id, label: p.name })),
    [pillars],
  );
  const [error, setError] = useState(null);

  const { data: divisions = [], isLoading: divLoading } = useQuery({
    queryKey: ['admin', 'division-codes'],
    queryFn: () => api.get('/admin/division-codes').catch(() => ({ data: [] })).then(r => Array.isArray(r.data) ? r.data : []),
    staleTime: 300_000,
  });

  const { data: outcomeAreas = [] } = useQuery({
    queryKey: ['plan-nodes', 'outcome-areas'],
    queryFn: () => api.get('/plan-nodes', { params: { node_type: 'OUTCOME_AREA' } }).then(r => Array.isArray(r.data) ? r.data : []),
    staleTime: 300_000,
  });

  const { data: unitsOfMeasure = [] } = useQuery({
    queryKey: ['admin', 'units-of-measure'],
    queryFn: () => api.get('/admin/units-of-measure').catch(() => ({ data: [] })).then(r => Array.isArray(r.data) ? r.data : []),
    staleTime: 300_000,
  });

  const { data: disaggCatalog = { items: [], grouped: {} } } = useQuery({
    queryKey: ['reporting', 'disaggregations'],
    queryFn: () => api.get('/reporting/disaggregations').then(r => r.data || { items: [], grouped: {} }),
    staleTime: 300_000,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['plan', 'node', id],
    queryFn: () => api.get(`/plan-nodes/${id}`).then(r => r.data),
    enabled: isEdit,
    staleTime: 60_000,
  });

  const loading = divLoading || (isEdit && detailLoading);

  useEffect(() => {
    if (!detail || !isEdit) return;
    setForm({
      indicator_name: detail.indicator_name || detail.title || '',
      indicator_code: detail.indicator_code || detail.code || '',
      tier_id: detail.tier_id ?? '',
      category: detail.category || '',
      definition: detail.definition || '',
      baseline_value: detail.baseline_value ?? detail.baseline_numeric ?? '',
      baseline_source: detail.baseline_source || '',
      target_fy1: detail.target_fy1 ?? detail.target_y1_numeric ?? '',
      target_fy2: detail.target_fy2 ?? detail.target_y2_numeric ?? '',
      target_fy3: detail.target_fy3 ?? detail.target_y3_numeric ?? '',
      target_fy4: detail.target_fy4 ?? detail.target_y4_numeric ?? '',
      target_fy5: detail.target_fy5 ?? detail.target_y5_numeric ?? '',
      q1_target: detail.q1_target ?? detail.q1_target_numeric ?? '',
      q2_target: detail.q2_target ?? detail.q2_target_numeric ?? '',
      q3_target: detail.q3_target ?? detail.q3_target_numeric ?? '',
      q4_target: detail.q4_target ?? detail.q4_target_numeric ?? '',
      overall_target: detail.overall_target ?? '',
      data_source: detail.data_source || '',
      data_collection_method: detail.data_collection_method || '',
      reporting_frequency: detail.reporting_frequency || '',
      reporting_level: detail.reporting_level || '',
      numerator: detail.numerator || '',
      denominator: detail.denominator || '',
      disaggregation: detail.disaggregation || '',
      parent_id: detail.parent_id ?? '',
      unit_of_measure_id: detail.unit_of_measure_id ?? '',
      accountable_division_id: detail.accountable_division_id || detail.responsible_division_code || '',
      // Only the explicit, user-editable value — divisions inferred from
      // linked Specific Activities are shown separately (read-only) below,
      // never merged back into this saved field. Merging them here used to
      // silently undo removals: any division that was still the responsible
      // division of a linked Specific Activity would reappear on every
      // refetch, right after the user had removed it and saved.
      contributing_divisions: (() => {
        let explicit = detail.contributing_divisions;
        if (typeof explicit === 'string') { try { explicit = JSON.parse(explicit); } catch { explicit = []; } }
        if (!Array.isArray(explicit)) explicit = [];
        return explicit;
      })(),
      active_periods: Array.isArray(detail.active_periods) ? detail.active_periods : [],
      is_big_ticket: !!detail.is_big_ticket,
      pillar_id: detail.pillar_id ?? '',
    });
  }, [detail, isEdit]);

  // Divisions inferred from linked Specific Activities — informational only.
  // These are the responsible divisions of any SPECIFIC_ACTIVITY whose
  // linked_indicator_id points here; they can't be removed from this form
  // because they aren't stored in contributing_divisions — unlink the
  // activity itself (on its own edit page) to change this.
  const linkedSpecificDivisions = useMemo(() => {
    const mainCode = form.accountable_division_id || '';
    const byCode = new Map();
    (detail?.linked_specifics || []).forEach((s) => {
      const code = s.division?.code || s.responsible_division_code;
      if (!code || code === mainCode || form.contributing_divisions.includes(code)) return;
      if (!byCode.has(code)) {
        byCode.set(code, { code, label: s.division?.name || code, activityLabel: s.title || s.code || `#${s.id}` });
      }
    });
    return [...byCode.values()];
  }, [detail, form.accountable_division_id, form.contributing_divisions]);

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setError(null); };
  const canSave = form.indicator_name.trim() && form.indicator_code.trim() && form.tier_id;

  // Non-blocking coherence check (VH-2): the Q1..Q4 targets are the breakdown
  // of the CURRENT fiscal year, so they must add up to THAT year's annual
  // target (target_fyN) — not the cumulative `overall_target`, and not FY1.
  // Comparing against the wrong year was the "FY2023 instead of FY2026" bug
  // (D-20260621). Advisory only — never blocks the save.
  const currentFyAnnualTarget = form[`target_fy${currentFyNum}`];
  const targetSumWarning = quarterlyVsAnnualWarning(
    [form.q1_target, form.q2_target, form.q3_target, form.q4_target],
    currentFyAnnualTarget,
  );

  // Active-reporting-period helpers (5×4 grid) — form state is an array
  // of { fy, q } pairs; the toggle/has helpers keep the lookups cheap.
  const hasPeriod = (fy, q) => form.active_periods.some((p) => p.fy === fy && p.q === q);
  const togglePeriod = (fy, q) => {
    setForm((p) => {
      const exists = p.active_periods.some((r) => r.fy === fy && r.q === q);
      return {
        ...p,
        active_periods: exists
          ? p.active_periods.filter((r) => !(r.fy === fy && r.q === q))
          : [...p.active_periods, { fy, q }],
      };
    });
  };
  const applyPeriodPreset = (preset) => {
    const cy = currentFyNum;
    const presets = {
      'current-all': [{ fy: cy, q: 1 }, { fy: cy, q: 2 }, { fy: cy, q: 3 }, { fy: cy, q: 4 }],
      'current-annual': [{ fy: cy, q: 4 }],
      'current-semi': [{ fy: cy, q: 2 }, { fy: cy, q: 4 }],
      'all-years-annual': Array.from({ length: 5 }, (_, i) => ({ fy: i + 1, q: 4 })),
      'clear': [],
    };
    setForm((p) => ({ ...p, active_periods: presets[preset] || p.active_periods }));
  };

  const queryClient = useQueryClient();
  const handleSave = async () => {
    if (!canSave) { setError('Name, code and tier are required'); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        ...form,
        tier_id: Number(form.tier_id),
        indicator_type: INDICATOR_TYPE_MAP[Number(form.tier_id)] || 'Output',
        contributing_divisions: form.contributing_divisions,
        active_periods: form.active_periods,
      };
      if (isEdit) {
        await api.put(`/plan-nodes/indicator/${id}`, payload);
        // Stay on the page with fresh data instead of redirecting away.
        await queryClient.invalidateQueries({ queryKey: ['plan', 'node', id] });
        toast.success('Indicator saved');
      } else {
        const res = await api.post('/plan-nodes/indicator', payload);
        toast.success('Indicator created');
        const newId = res.data?.id || res.data?.data?.id;
        if (newId) navigate(`/pirs/${newId}/edit`, { replace: true });
        else navigate('/short-term-outcome');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || err.message || 'Save failed');
    } finally { setSaving(false); }
  };

  // Only canonical divisions in the form — aliases (alias_of != null) are
  // hidden so the user can't pick HRMD when HR already exists.
  const divOpts = divisions
    .filter(d => !d.alias_of)
    .map(d => ({ value: d.code, label: d.division_name, sub: d.code }));

  if (loading) return (
    <DashboardLayout breadcrumbs={[{ label: 'PIRS', path: '/pirs' }, { label: isEdit ? 'Edit' : 'New' }]}>
      <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout breadcrumbs={[{ label: 'PIRS', path: '/pirs' }, { label: isEdit ? 'Edit Indicator' : 'New Indicator' }]}>
      <div className="max-w-4xl mx-auto py-4 space-y-6">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-[11px] text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <h1 className="text-[16px] font-semibold text-[#1A5632]">{isEdit ? 'Edit Indicator' : 'New Indicator'}</h1>
          </div>
        </div>

        {error && <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 px-4 py-2">{error}</div>}

        <Section title="Indicator Identity">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Row label="Indicator Code *">
              <input value={form.indicator_code} onChange={e => set('indicator_code', e.target.value)}
                placeholder="e.g. CHSISD.1.1-17" className={INPUT} />
            </Row>
            <Row label="Tier *">
              <SearchSelect value={form.tier_id || null} onChange={v => set('tier_id', v || '')}
                options={TIER_OPTIONS} placeholder="— Select —" />
            </Row>
            <Row label="Category">
              <SearchSelect value={form.category || null} onChange={v => set('category', v || '')}
                options={CATEGORY_OPTIONS} placeholder="—" allowClear />
            </Row>
            <Row label="AHSS Pillar">
              <SearchSelect value={form.pillar_id || null} onChange={v => set('pillar_id', v || '')}
                options={pillarOptions} placeholder="—" allowClear />
            </Row>
          </div>
          <Row label="Indicator Name *">
            <input autoFocus value={form.indicator_name} onChange={e => set('indicator_name', e.target.value)}
              placeholder="Full indicator name" className={INPUT} />
          </Row>
          <Row label="Definition">
            <textarea value={form.definition} onChange={e => set('definition', e.target.value)}
              placeholder="What does this indicator measure?" rows={3} className={`${INPUT} resize-none`} />
          </Row>
        </Section>

        <Section title="Classification">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Row label="Linked Outcome Area">
              <select value={form.parent_id} onChange={e => set('parent_id', e.target.value)} className={INPUT}>
                <option value="">— Unlinked —</option>
                {outcomeAreas.map(oa => (
                  <option key={oa.id} value={oa.id}>{oa.code} — {oa.title?.substring(0, 60)}</option>
                ))}
              </select>
            </Row>
            <Row label="Unit of Measure">
              <select value={form.unit_of_measure_id} onChange={e => set('unit_of_measure_id', e.target.value)} className={INPUT}>
                <option value="">— Select —</option>
                {unitsOfMeasure.map(u => (
                  <option key={u.id} value={u.id}>{u.label} ({u.code})</option>
                ))}
              </select>
            </Row>
          </div>
          <label className="flex items-start gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={form.is_big_ticket}
              onChange={e => set('is_big_ticket', e.target.checked)}
              className="mt-0.5 accent-[#1A5632]"
            />
            <span>
              <span className="text-[11px] font-semibold text-gray-700">Big ticket indicator</span>
              <span className="block text-[9px] text-gray-400">Leadership-priority indicator surfaced in review-submission and division-report filters.</span>
            </span>
          </label>
        </Section>

        <Section title="Measurement">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Row label="Numerator">
              <input value={form.numerator} onChange={e => set('numerator', e.target.value)} className={INPUT} />
            </Row>
            <Row label="Denominator">
              <input value={form.denominator} onChange={e => set('denominator', e.target.value)} className={INPUT} />
            </Row>
          </div>
          <div>
            <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Disaggregation</div>
            <div className="border border-gray-300 p-3 space-y-2 max-h-48 overflow-y-auto">
              {Object.entries(disaggCatalog.grouped || {}).map(([cat, items]) => (
                <div key={cat}>
                  <div className="text-[9px] font-bold text-gray-400 uppercase mb-1">{cat}</div>
                  {items.map(d => (
                    <label key={d.id} className="flex items-center gap-2 py-0.5 cursor-pointer hover:bg-gray-50 px-1">
                      <input type="checkbox"
                        checked={(form.disaggregation_ids || []).includes(d.id)}
                        onChange={e => {
                          const ids = form.disaggregation_ids || [];
                          set('disaggregation_ids', e.target.checked ? [...ids, d.id] : ids.filter(x => x !== d.id));
                        }}
                        className="accent-[#1A5632]" />
                      <span className="text-[11px] text-gray-700">{d.name}</span>
                      {d.description && <span className="text-[9px] text-gray-400">— {d.description}</span>}
                    </label>
                  ))}
                </div>
              ))}
              {(disaggCatalog.items || []).length === 0 && <div className="text-[10px] text-gray-400">No disaggregation categories available</div>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Row label="Baseline Value">
              <input type="number" step="any" inputMode="decimal" value={form.baseline_value} onChange={e => set('baseline_value', e.target.value)} className={INPUT} />
            </Row>
            <Row label="Baseline Source">
              <input value={form.baseline_source} onChange={e => set('baseline_source', e.target.value)} className={INPUT} />
            </Row>
          </div>
        </Section>

        <Section title="Targets">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {['target_fy1', 'target_fy2', 'target_fy3', 'target_fy4', 'target_fy5'].map((k, i) => {
              const fyNum = i + 1;
              const year = fyToYear(fyNum);
              const isCurrent = fyNum === currentFyNum;
              return (
                <div key={k}>
                  <div className={`text-[9px] uppercase mb-1 flex items-center gap-1 ${isCurrent ? 'text-[#1A5632] font-bold' : 'text-gray-400'}`}>
                    <span>FY{fyNum}</span>
                    <span className="text-gray-400 font-normal">· {year}</span>
                    {isCurrent && <span className="text-[8px] bg-[#1A5632] text-white px-1 py-0.5">CURRENT</span>}
                  </div>
                  <input type="number" step="any" inputMode="decimal" value={form[k]} onChange={e => set(k, e.target.value)} className={INPUT} />
                </div>
              );
            })}
          </div>
          <div className="text-[9px] text-gray-400 uppercase mt-3 mb-1">
            Quarterly breakdown — should sum to the FY{currentFyNum} · {fyToYear(currentFyNum)} annual target
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {['q1_target', 'q2_target', 'q3_target', 'q4_target'].map((k, i) => (
              <div key={k}>
                <div className="text-[9px] text-gray-400 uppercase mb-1">Q{i + 1} Target</div>
                <input type="number" step="any" inputMode="decimal" value={form[k]} onChange={e => set(k, e.target.value)} className={INPUT} />
              </div>
            ))}
          </div>
          <Row label="Overall Target">
            <input value={form.overall_target} onChange={e => set('overall_target', e.target.value)} className={INPUT} />
          </Row>
          {targetSumWarning && (
            <div role="alert" className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2">
              ⚠ {targetSumWarning} You can still save — this is only a consistency check.
            </div>
          )}
        </Section>

        <Section title="Reporting Periods">
          <p className="text-[10px] text-gray-500 mb-3">
            Tick every (fiscal year × quarter) where this indicator should appear in the reporting workflow.
            Leave all unchecked to opt this indicator out of the quarterly reporting queue entirely.
          </p>

          {/* Presets */}
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { key: 'current-all', label: `All quarters of FY${currentFyNum} (${fyToYear(currentFyNum)})` },
              { key: 'current-annual', label: `Annual — FY${currentFyNum} Q4 only` },
              { key: 'current-semi', label: `Semi-annual — FY${currentFyNum} Q2 + Q4` },
              { key: 'all-years-annual', label: 'Annual across FY1..FY5' },
              { key: 'clear', label: 'Clear all' },
            ].map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPeriodPreset(p.key)}
                className="text-[10px] px-2 py-1 border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-[#1A5632] hover:text-[#1A5632]"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Grid */}
          <div className="border border-gray-200">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[9px] uppercase text-gray-500">
                  <th className="px-3 py-2 text-left font-medium w-[180px]">Fiscal year</th>
                  {[1, 2, 3, 4].map((q) => (
                    <th key={q} className="px-3 py-2 text-center font-medium">Q{q}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[1, 2, 3, 4, 5].map((fy) => {
                  const year = fyToYear(fy);
                  const isCurrent = fy === currentFyNum;
                  return (
                    <tr key={fy} className={isCurrent ? 'bg-[#1A5632]/[0.03]' : ''}>
                      <td className={`px-3 py-2 text-[11px] font-semibold ${isCurrent ? 'text-[#1A5632]' : 'text-gray-700'}`}>
                        FY{fy} · {year}
                        {isCurrent && <span className="ml-1.5 text-[8px] bg-[#1A5632] text-white px-1 py-0.5">CURRENT</span>}
                      </td>
                      {[1, 2, 3, 4].map((q) => (
                        <td key={q} className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={hasPeriod(fy, q)}
                            onChange={() => togglePeriod(fy, q)}
                            className="w-3.5 h-3.5 accent-[#1A5632] cursor-pointer"
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-gray-400 mt-2">
            {form.active_periods.length === 0
              ? 'No reporting period selected — this indicator will not appear in any quarterly report queue.'
              : `${form.active_periods.length} period${form.active_periods.length > 1 ? 's' : ''} selected.`}
          </p>
        </Section>

        <Section title="Data Collection & Reporting">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Row label="Data Source">
              <input value={form.data_source} onChange={e => set('data_source', e.target.value)} className={INPUT} />
            </Row>
            <Row label="Data Collection Method">
              <input value={form.data_collection_method} onChange={e => set('data_collection_method', e.target.value)} className={INPUT} />
            </Row>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Row label="Reporting Frequency">
              <SearchSelect value={form.reporting_frequency || null} onChange={v => set('reporting_frequency', v || '')}
                options={FREQUENCY_OPTIONS} placeholder="—" allowClear />
            </Row>
            <Row label="Reporting Level">
              <input value={form.reporting_level} onChange={e => set('reporting_level', e.target.value)} className={INPUT} />
            </Row>
            <Row label="Disaggregation">
              <input value={form.disaggregation} onChange={e => set('disaggregation', e.target.value)} className={INPUT} />
            </Row>
          </div>
          <Row label="Accountable Division (MAIN)">
            <SearchSelect value={form.accountable_division_id || null} onChange={v => set('accountable_division_id', v || '')}
              options={divOpts} placeholder="— Select division —" allowClear />
          </Row>
          <Row label="Contributing Divisions">
            <div className="space-y-2">
              <SearchSelect
                value={null}
                onChange={v => {
                  if (v && !form.contributing_divisions.includes(v)) {
                    set('contributing_divisions', [...form.contributing_divisions, v]);
                  }
                }}
                options={divOpts.filter(d => d.value !== form.accountable_division_id
                  && !form.contributing_divisions.includes(d.value)
                  && !linkedSpecificDivisions.some(ls => ls.code === d.value))}
                placeholder="— Add a contributing division —"
              />
              {form.contributing_divisions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.contributing_divisions.map(code => {
                    const div = divOpts.find(d => d.value === code);
                    return (
                      <span key={code} className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 border border-orange-200 text-[9px] font-semibold text-[#B45309]">
                        {div ? div.label : code} ({code})
                        <button type="button" onClick={() => set('contributing_divisions', form.contributing_divisions.filter(c => c !== code))}
                          className="text-orange-400 hover:text-orange-600">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              {linkedSpecificDivisions.length > 0 && (
                <div className="space-y-1 pt-1">
                  <p className="text-[9px] text-gray-500">
                    Auto-included via linked Specific Activities — unlink the activity to remove:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {linkedSpecificDivisions.map(d => (
                      <span key={d.code} title={`Via Specific Activity: ${d.activityLabel}`}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 border border-gray-200 text-[9px] font-semibold text-gray-500">
                        {d.label} ({d.code})
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Row>
        </Section>

        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <Button variant="secondary" size="md" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={handleSave} disabled={saving || !canSave}>
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {isEdit ? 'Save Changes' : 'Create Indicator'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

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
