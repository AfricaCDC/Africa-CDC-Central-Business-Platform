/* eslint-disable complexity -- matrix render with grouped modules */
import { useState, useMemo, Fragment } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { RBAC_SCOPES } from '@rbm/lib/enums';
import { useRbacMatrix, useUpdateRbacPermission } from './hooks/useAdminQueries';

const SCOPE_CYCLE = [null, RBAC_SCOPES.OWN, RBAC_SCOPES.DIVISION, RBAC_SCOPES.DIRECTORATE, RBAC_SCOPES.ALL];
const SCOPE_COLORS = {
  [RBAC_SCOPES.ALL]:         'bg-[#14442A] text-white',
  [RBAC_SCOPES.DIRECTORATE]: 'bg-purple-700 text-white',
  [RBAC_SCOPES.DIVISION]:    'bg-[#D97706] text-white',
  [RBAC_SCOPES.OWN]:         'bg-blue-600 text-white',
};
const SCOPE_LABELS = { all: 'ALL', directorate: 'DIR', division: 'DIV', own: 'OWN' };

const CATEGORY_LABELS = {
  core: 'Core',
  planning: 'Planning',
  pirs: 'PIRS / Indicators',
  reporting: 'Reporting',
  strategy: 'Strategy',
  reference: 'Reference',
  governance: 'Governance',
  admin: 'Admin',
};

export default function RbacPermissionsPage() {
  const { data, isLoading } = useRbacMatrix();
  const updatePerm = useUpdateRbacPermission();
  const [selectedRole, setSelectedRole] = useState(null);
  const [saving, setSaving] = useState({});

  const matrix = data?.matrix;
  const roles = data?.roles || [];

  if (!selectedRole && roles.length) {
    setSelectedRole(roles[0].id);
  }

  const permMap = useMemo(() => {
    if (!matrix || !selectedRole) return {};
    const map = {};
    (matrix.matrix || []).forEach(p => {
      if (p.role_id === selectedRole) {
        map[`${p.module}.${p.action}`] = p.scope;
      }
    });
    return map;
  }, [matrix, selectedRole]);

  const groupedModules = useMemo(() => {
    if (!matrix) return [];
    const groups = {};
    (matrix.modules || []).forEach(m => {
      const cat = m.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(m);
    });
    return Object.entries(groups).sort(([, a], [, b]) => (a[0]?.sort_order || 0) - (b[0]?.sort_order || 0));
  }, [matrix]);

  const actions = useMemo(() => (matrix?.actions || []).sort((a, b) => a.sort_order - b.sort_order), [matrix]);

  const handleCellClick = async (moduleCode, actionCode) => {
    const key = `${moduleCode}.${actionCode}`;
    const current = permMap[key] || null;
    const currentIdx = SCOPE_CYCLE.indexOf(current);
    const nextScope = SCOPE_CYCLE[(currentIdx + 1) % SCOPE_CYCLE.length];

    setSaving(prev => ({ ...prev, [key]: true }));
    try {
      await updatePerm.mutateAsync({
        nextScope,
        role_id: selectedRole,
        module_code: moduleCode,
        action_code: actionCode,
      });
    } catch {
      toast.error('Failed to update permission');
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  };

  const selectedRoleData = roles.find(r => r.id === selectedRole);
  const permCount = Object.keys(permMap).length;

  if (isLoading) return (
    <DashboardLayout breadcrumbs={[{ label: 'Admin' }, { label: 'RBAC Permissions' }]}>
      <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-[#1A5632]" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Admin' }, { label: 'RBAC Permissions' }]}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#1A5632] text-white">
          <div className="px-6 py-5">
            <div className="flex items-center gap-3 mb-2">
              <Shield className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-2 py-0.5">RBAC</span>
            </div>
            <h1 className="text-[16px] font-semibold">Permission Matrix</h1>
            <p className="text-[11px] text-white/60 mt-1">Click a cell to cycle: empty → OWN → DIV → DIR → ALL → empty</p>
          </div>
          <div className="border-t border-white/15 px-6 py-2.5 flex flex-wrap items-center gap-6 text-[11px] text-white/70">
            <span><strong className="text-white">{roles.length}</strong> Roles</span>
            <span><strong className="text-white">{matrix?.modules?.length || 0}</strong> Modules</span>
            <span><strong className="text-white">{actions.length}</strong> Actions</span>
            {selectedRoleData && (
              <span className="ml-auto">
                <strong className="text-white">{selectedRoleData.name || selectedRoleData.code}</strong> — {permCount} permissions
              </span>
            )}
          </div>
        </div>

        {/* Role tabs */}
        <div className="bg-white border border-gray-200 border-t-0 px-4 py-2 flex flex-wrap gap-1">
          {roles.map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedRole(r.id)}
              className={`text-[10px] font-semibold px-3 py-1.5 transition-colors ${
                selectedRole === r.id
                  ? 'bg-[#1A5632] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r.code}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="bg-white border border-gray-200 border-t-0 px-6 py-2 flex flex-wrap items-center gap-4 text-[9px]">
          <span className="text-gray-400 uppercase font-semibold">Scopes:</span>
          <span className="inline-flex items-center gap-1"><span className="w-6 h-4 bg-[#14442A] text-white text-[8px] font-bold flex items-center justify-center">ALL</span> Unrestricted</span>
          <span className="inline-flex items-center gap-1"><span className="w-6 h-4 bg-purple-700 text-white text-[8px] font-bold flex items-center justify-center">DIR</span> Directorate (all children)</span>
          <span className="inline-flex items-center gap-1"><span className="w-6 h-4 bg-[#D97706] text-white text-[8px] font-bold flex items-center justify-center">DIV</span> Division only</span>
          <span className="inline-flex items-center gap-1"><span className="w-6 h-4 bg-blue-600 text-white text-[8px] font-bold flex items-center justify-center">OWN</span> Own records only</span>
          <span className="inline-flex items-center gap-1"><span className="w-6 h-4 bg-gray-100 border border-gray-200 text-[8px] text-gray-300 flex items-center justify-center">—</span> Denied</span>
        </div>

        {/* Matrix table */}
        <div className="bg-white border border-gray-200 border-t-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2 text-[9px] text-gray-400 font-semibold uppercase w-[200px] sticky left-0 bg-gray-50 z-10">Module</th>
                {actions.map(a => (
                  <th key={a.code} className="px-1.5 py-2 text-[8px] text-gray-400 font-semibold uppercase text-center w-[60px]">
                    {a.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedModules.map(([category, modules]) => (
                <Fragment key={category}>
                  <tr>
                    <td colSpan={actions.length + 1} className="px-3 py-1.5 bg-gray-100 border-b border-gray-200">
                      <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                        {CATEGORY_LABELS[category] || category}
                      </span>
                    </td>
                  </tr>
                  {modules.map((mod, idx) => (
                    <tr key={mod.code} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                      <td className="px-3 py-1.5 sticky left-0 bg-inherit z-10">
                        <div className="text-[10px] font-semibold text-gray-800">{mod.name}</div>
                        <div className="text-[8px] text-gray-400 font-mono">{mod.code}</div>
                      </td>
                      {actions.map(act => {
                        const key = `${mod.code}.${act.code}`;
                        const scope = permMap[key] || null;
                        const isSaving = saving[key];
                        return (
                          <td key={act.code} className="px-1 py-1 text-center">
                            <button
                              onClick={() => handleCellClick(mod.code, act.code)}
                              disabled={isSaving}
                              className={`w-[48px] h-[22px] text-[8px] font-bold border transition-colors ${
                                scope
                                  ? `${SCOPE_COLORS[scope]} border-transparent`
                                  : 'bg-gray-50 border-gray-200 text-gray-300 hover:bg-gray-100'
                              } ${isSaving ? 'opacity-50' : ''}`}
                              title={`${mod.code}.${act.code}: ${scope || 'denied'}`}
                            >
                              {isSaving ? '...' : (scope ? SCOPE_LABELS[scope] : '—')}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
