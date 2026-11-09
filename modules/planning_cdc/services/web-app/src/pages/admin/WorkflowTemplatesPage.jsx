import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { toast } from 'sonner';
import {
  Plus, GitBranch, AlertCircle, ToggleLeft, ToggleRight,
  Pencil, Layers,
} from 'lucide-react';
import { useWorkflowTemplates, useToggleWorkflowTemplate } from './hooks/useWorkflowQueries';

const ENTITY_LABELS = {
  INDICATOR_ACTUAL: 'Indicator Actual',
  INDICATOR_DIVISION_REPORT: 'Indicator Quarterly Report',
  DIVISION_ACTIVITY_REPORT: 'Division Report',
  ACTIVITY_REPORT: 'Activity Report',
  PLAN_NODE: 'Specific Activity',
};

const VARIANT_BADGES = {
  DEFAULT: { label: 'DEFAULT', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  CONTRIBUTOR_CHAIN: { label: 'CONTRIBUTOR CHAIN', cls: 'bg-[#1A5632]/10 text-[#1A5632] border-[#1A5632]/30' },
};

const SKEL_KEYS = ['s1', 's2', 's3', 's4', 's5'];

export default function WorkflowTemplatesPage() {
  const navigate = useNavigate();
  const { data: templates = [], isLoading, error } = useWorkflowTemplates();
  const toggleMut = useToggleWorkflowTemplate();

  const handleToggle = async (tpl) => {
    try {
      await toggleMut.mutateAsync({ id: tpl.id, isActive: tpl.is_active });
      toast.success(`Template ${tpl.is_active ? 'deactivated' : 'activated'}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status');
    }
  };

  return (
    <DashboardLayout title="Workflow Templates">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[#1A5632]">Workflow Templates</h2>
            <p className="text-[11px] text-gray-400">
              Define approval chains for reports and activities
            </p>
          </div>
          <button
            onClick={() => navigate('/admin/workflows/new')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-[#1A5632] text-white hover:bg-[#0F3D24]"
          >
            <Plus className="w-3.5 h-3.5" /> New Template
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 text-[11px] text-red-600">
            <AlertCircle className="w-3 h-3" />
            {error.message || 'Error'}
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-gray-200">
          {isLoading ? (
            <div className="divide-y divide-gray-100">
              {SKEL_KEYS.map((sk) => (
                <div key={sk} className="flex items-center gap-4 px-4 py-3 animate-pulse">
                  <div className="h-3 bg-gray-100 w-1/4" />
                  <div className="h-3 bg-gray-100 w-1/6" />
                  <div className="h-3 bg-gray-100 w-12" />
                  <div className="h-3 bg-gray-100 w-16" />
                  <div className="h-3 bg-gray-100 w-20 ml-auto" />
                </div>
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center py-20">
              <GitBranch className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-[12px] text-gray-400">No workflow templates yet</p>
              <button
                onClick={() => navigate('/admin/workflows/new')}
                className="text-[11px] text-[#1A5632] mt-2 hover:underline"
              >
                Create your first template
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2 text-[10px] font-medium text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="px-4 py-2 text-[10px] font-medium text-gray-500 uppercase tracking-wide">Entity Type</th>
                  <th className="px-4 py-2 text-[10px] font-medium text-gray-500 uppercase tracking-wide">Variant</th>
                  <th className="px-4 py-2 text-[10px] font-medium text-gray-500 uppercase tracking-wide text-center">Steps</th>
                  <th className="px-4 py-2 text-[10px] font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2 text-[10px] font-medium text-gray-500 uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {templates.map((tpl) => (
                  <tr
                    key={tpl.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/admin/workflows/${tpl.id}`)}
                  >
                    <td className="px-4 py-2.5">
                      <span className="text-[12px] text-gray-800 font-medium">{tpl.name}</span>
                      {tpl.description && (
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[300px]">{tpl.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] text-gray-600">
                        {ENTITY_LABELS[tpl.entity_type] || tpl.entity_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {(() => {
                        const v = VARIANT_BADGES[tpl.template_variant] || { label: tpl.template_variant || 'DEFAULT', cls: 'bg-gray-50 text-gray-500 border-gray-200' };
                        return (
                          <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold border ${v.cls}`}>
                            {v.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 shadow-sm">
                        <Layers className="w-3 h-3" />
                        {tpl.steps?.length || 0}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {tpl.is_active ? (
                        <span className="inline-block px-2 py-0.5 text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 text-[10px] font-medium bg-gray-50 text-gray-400 border border-gray-200">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => navigate(`/admin/workflows/${tpl.id}`)}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500 border border-gray-200 hover:bg-gray-50"
                          title="Edit"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        <button
                          onClick={() => handleToggle(tpl)}
                          disabled={toggleMut.isPending}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                          title={tpl.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {tpl.is_active
                            ? <><ToggleRight className="w-3.5 h-3.5 text-green-600" /> <span className="text-gray-500">On</span></>
                            : <><ToggleLeft className="w-3.5 h-3.5 text-gray-400" /> <span className="text-gray-400">Off</span></>
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
