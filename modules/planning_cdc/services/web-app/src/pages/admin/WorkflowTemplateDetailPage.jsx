/* eslint-disable complexity, max-lines -- form + steps editor + variant badge in a single component */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Save, AlertCircle, Loader2,
} from 'lucide-react';
import WorkflowStepRow from './WorkflowStepRow';
import { useWorkflowTemplate, useSaveWorkflowTemplate } from './hooks/useWorkflowQueries';

const ENTITY_OPTIONS = [
  { value: 'INDICATOR_ACTUAL', label: 'Indicator Report (legacy)' },
  { value: 'INDICATOR_DIVISION_REPORT', label: 'Indicator Report' },
  { value: 'DIVISION_ACTIVITY_REPORT', label: 'Division Report' },
  { value: 'ACTIVITY_REPORT', label: 'Activity Report' },
  { value: 'PLAN_NODE', label: 'Specific Activity' },
];

// eslint-disable-next-line no-restricted-syntax -- step-scope column-enum default, not ENTITY_TYPES
const STEP_SCOPE_DEFAULT = 'DIVISION';

const emptyStep = (order) => ({
  step_order: order,
  step_label: '',
  role_code: 'HEAD_OF_DIVISION',
  scope: STEP_SCOPE_DEFAULT,
});

export default function WorkflowTemplateDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const { data: tpl, isLoading } = useWorkflowTemplate(id);
  const saveMut = useSaveWorkflowTemplate();

  const [form, setForm] = useState({ name: '', entity_type: 'INDICATOR_ACTUAL', description: '', is_active: true, template_variant: 'DEFAULT' });
  const [steps, setSteps] = useState([emptyStep(1)]);
  const [formReady, setFormReady] = useState(isNew);

  useEffect(() => {
    if (!tpl || formReady) return;
    setForm({
      name: tpl.name || '',
      entity_type: tpl.entity_type || 'INDICATOR_ACTUAL',
      description: tpl.description || '',
      is_active: tpl.is_active !== false,
    });
    const sorted = (tpl.steps || [])
      .slice()
      .sort((a, b) => a.step_order - b.step_order)
      .map((s, i) => ({ ...s, step_order: i + 1 }));
    setSteps(sorted.length ? sorted : [emptyStep(1)]);
    setFormReady(true);
  }, [tpl, formReady]);

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const updateStep = (idx, field, value) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const addStep = () => {
    setSteps((prev) => [...prev, emptyStep(prev.length + 1)]);
  };

  const removeStep = (idx) => {
    setSteps((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((s, i) => ({ ...s, step_order: i + 1 }));
    });
  };

  const moveStep = (idx, dir) => {
    setSteps((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, i) => ({ ...s, step_order: i + 1 }));
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Template name is required'); return; }
    const validSteps = steps.filter((s) => s.step_label.trim());
    if (!validSteps.length) { toast.error('At least one step with a label is required'); return; }

    const stepsPayload = validSteps.map((s, i) => ({
      step_order: i + 1,
      step_label: s.step_label.trim(),
      role_code: s.role_code,
      scope: s.scope,
    }));

    try {
      await saveMut.mutateAsync({
        id,
        isNew,
        form: {
          name: form.name, entity_type: form.entity_type, description: form.description,
          is_active: form.is_active,
          // Variant is fixed at creation — the engine routes DEFAULT (owner
          // submits) vs CONTRIBUTOR_CHAIN (contributor submits) on it.
          ...(isNew ? { template_variant: form.template_variant } : {}),
        },
        steps: stepsPayload,
      });
      toast.success(isNew ? 'Template created' : 'Template saved');
      if (isNew) navigate('/admin/workflows');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Failed to save');
    }
  };

  if (isLoading) return (
    <DashboardLayout title="Workflow Template">
      <div className="animate-pulse space-y-4 p-4">
        <div className="h-4 bg-gray-100 w-1/3" />
        <div className="h-8 bg-gray-100 w-full" />
        <div className="h-8 bg-gray-100 w-2/3" />
        <div className="h-20 bg-gray-100 w-full" />
        <div className="h-32 bg-gray-100 w-full" />
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout title={isNew ? 'New Workflow Template' : 'Edit Workflow Template'}>
      <div className="space-y-4 max-w-3xl">
        {/* Back link */}
        <button
          onClick={() => navigate('/admin/workflows')}
          className="flex items-center gap-1 text-[12px] text-[#1A5632] hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to templates
        </button>

        {/* Error */}
        {saveMut.error && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 text-[11px] text-red-600">
            <AlertCircle className="w-3 h-3" /> {saveMut.error.response?.data?.error || saveMut.error.message}
          </div>
        )}

        {/* Metadata form */}
        <div className="bg-white border border-gray-200 p-4 space-y-3">
          <h3 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wide">Template Details</h3>

          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g. Indicator Approval Chain"
              className="w-full px-3 py-1.5 text-[11px] border border-gray-300 bg-white focus:outline-none focus:border-[#1A5632]"
            />
            {!isNew && tpl?.template_variant && (
              <div className="mt-1.5"><span className={`inline-block px-2 py-0.5 text-[9px] font-semibold border ${tpl.template_variant === 'CONTRIBUTOR_CHAIN' ? 'bg-[#1A5632]/10 text-[#1A5632] border-[#1A5632]/30' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>Variant: {tpl.template_variant}</span></div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Entity Type *</label>
              <select
                value={form.entity_type}
                onChange={(e) => updateField('entity_type', e.target.value)}
                className="w-full px-3 py-1.5 text-[11px] border border-gray-300 bg-white focus:outline-none focus:border-[#1A5632]"
              >
                {ENTITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {isNew && (
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Variant *</label>
                <select
                  value={form.template_variant}
                  onChange={(e) => updateField('template_variant', e.target.value)}
                  className="w-full px-3 py-1.5 text-[11px] border border-gray-300 bg-white focus:outline-none focus:border-[#1A5632]"
                >
                  <option value="DEFAULT">Default — owner division submits</option>
                  <option value="CONTRIBUTOR_CHAIN">Contributor chain — contributor division submits</option>
                </select>
                <p className="mt-1 text-[9px] text-gray-400">
                  Activating a template deactivates the other active one of the
                  same entity/variant pair — one active chain per pair.
                </p>
              </div>
            )}
            <div>
              <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Status</label>
              <button
                type="button"
                onClick={() => updateField('is_active', !form.is_active)}
                className={`flex items-center gap-2 px-3 py-1.5 text-[11px] border w-full ${
                  form.is_active
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : 'border-gray-300 bg-gray-50 text-gray-400'
                }`}
              >
                {form.is_active ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={2}
              placeholder="Optional description..."
              className="w-full px-3 py-1.5 text-[11px] border border-gray-300 bg-white focus:outline-none focus:border-[#1A5632] resize-none"
            />
          </div>
        </div>

        {/* Steps editor */}
        <div className="bg-white border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wide">Approval Steps</h3>
            <button
              onClick={addStep}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium text-[#1A5632] border border-[#1A5632] hover:bg-[#1A5632]/5"
            >
              <Plus className="w-3 h-3" /> Add Step
            </button>
          </div>

          {steps.length === 0 ? (
            <p className="text-[11px] text-gray-400 text-center py-6">
              No steps defined. Add at least one approval step.
            </p>
          ) : (
            <div className="space-y-2">
              {steps.map((step, stepIdx) => (
                <WorkflowStepRow
                  key={step.id || `step-${step.step_order}`}
                  step={step}
                  idx={stepIdx}
                  total={steps.length}
                  onUpdate={updateStep}
                  onMove={moveStep}
                  onRemove={removeStep}
                />
              ))}
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saveMut.isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium bg-[#1A5632] text-white hover:bg-[#0F3D24] disabled:opacity-50"
          >
            {saveMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {isNew ? 'Create Template' : 'Save Changes'}
          </button>
          <button
            onClick={() => navigate('/admin/workflows')}
            className="px-4 py-2 text-[11px] text-gray-500 border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
